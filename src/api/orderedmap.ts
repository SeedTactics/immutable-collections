/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { LazySeq } from "../lazyseq.js";
import {
  ComparisionConfig,
  mkComparisonConfig,
  OrderedMapKey,
} from "../data-structures/comparison.js";
import {
  adjust,
  build,
  collectValues,
  difference,
  foldl,
  foldr,
  from,
  intersection,
  iterateAsc,
  iterateDesc,
  lookup,
  alter,
  mapValues,
  split,
  union,
  TreeNode,
  minView,
  maxView,
  lookupMin,
  lookupMax,
  partition,
} from "../data-structures/tree.js";
import { OrderedSet } from "./orderedset.js";

// eslint-disable-next-line @typescript-eslint/ban-types
type NotUndefined = {} | null;

function constUndefined() {
  return undefined;
}

/**
 * Immutable Ordered Map
 *
 * @remarks
 * The `OrderedMap<K, V>` class stores key-value pairs where the keys have type `K` and the values type `V`.
 * Keys can be numbers, strings, booleans, dates, or custom objects which implement the {@link class_api!ComparableObj} interface.
 * The entries are stored in a balanced binary tree, and various methods can iterate over the entries in either ascending
 * or descending order of keys.  OrderedMap implements the typescript-builtin `ReadonlyMap` interface (which
 * consists of the read-only methods of [the JS builtin Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)).
 *
 * The OrderedMap is immutable, which means that no changes or mutations are allowed directly to the OrderedMap.
 * Instead, modification operations such as {@link OrderedMap#alter} return a new OrderedMap which contains the
 * result of the modification.  The original OrderedMap is unchanged and can continue to be accessed and used.
 * The OrderedMap implements this efficiently using structural sharing and does not require a full copy; indeed,
 * the `alter` method will copy at most `O(log n)` entries.
 */
export class OrderedMap<K extends OrderedMapKey, V> implements ReadonlyMap<K, V> {
  /** Static method to create a new empty OrderedMap
   *
   * @category Creating Ordered Maps
   *
   * @remarks
   * The key type must extend `OrderedMapKey`, which consists of strings, numbers, dates, booleans, or a custom
   * user-defined object which implements the `ComparableObj` interface.  The `ComparableObj` interface allows you
   * to create complex keys which are made up of multiple properties.  Values can have any type but can not
   * contain `undefined`.  The value type can include `null` if you wish to represent missing or empty values.
   *
   * While you can start with an empty `OrderedMap` and then use {@link OrderedMap#set} to add entries, it
   * is more efficient to create the OrderedMap in bulk using either the static {@link OrderedMap.from} or {@link OrderedMap.build}
   * or using various methods on {@link LazySeq} to convert a `LazySeq` to an `OrderedMap`.
   */
  public static empty<K extends OrderedMapKey, V extends NotUndefined>(): OrderedMap<
    K,
    V
  > {
    return new OrderedMap(mkComparisonConfig(), null);
  }

  /** Efficiently create a new OrderedMap from key-value pairs
   *
   * @category Creating Ordered Maps
   *
   * @remarks
   * `from` efficiently creates an OrderedMap from a sequence of key-value pairs.  An optional `merge` function
   * can be provided.  When `from` detects a duplicate key, the merge function is called to determine
   * the value associated to the key.  The first parameter `v1` to the merge function is the existing value
   * and the second parameter `v2` is the new value just recieved from the sequence. The return value from the
   * merge function is the value associated to the key.  If no merge function is provided, the second value `v2`
   * is used, overwriting the first value `v1`.
   *
   * If you have a LazySeq, the LazySeq.{@link LazySeq#toOrderedMap} method is an easy way to call `from`.
   *
   * Runs in time O(n log n)
   */
  public static from<K extends OrderedMapKey, V extends NotUndefined>(
    items: Iterable<readonly [K, V]>,
    merge?: (v1: V, v2: V) => V
  ): OrderedMap<K, V> {
    const cfg = mkComparisonConfig();
    return new OrderedMap(cfg, from(cfg, items, merge));
  }

  /** Efficently create a new OrderedMap
   *
   * @category Creating Ordered Maps
   *
   * @remarks
   * `build` efficiently creates an OrderedMap from a sequence of values and a key extraction function.  If a
   * duplicate key is found, the later value is used and the earlier value is overwritten.  If this is
   * not desired, use the more generalized version of `build` which also provides a value extraction function.
   *
   * Runs in time O(n log n)
   */
  public static build<K extends OrderedMapKey, V extends NotUndefined>(
    items: Iterable<V>,
    key: (v: V) => K
  ): OrderedMap<K, V>;

  /** Efficently create a new OrderedMap
   *
   * @category Creating Ordered Maps
   *
   * @remarks
   * `build` efficiently creates an OrderedMap from a sequence of items, a key extraction function, and a value extraction
   * function.  The sequence of items can have any type `T`, and for each item the key is extracted.  If the key does not
   * yet exist, the `val` extraction function is called with `undefined` to retrieve the value associated to the key.
   * If the key already exists in the HashMap, the `val` extraction function is called with the `old` value to
   * merge the new item `t` into the existing value `old`.
   *
   * Runs in time O(n log n)
   */
  public static build<T, K extends OrderedMapKey, V extends NotUndefined>(
    items: Iterable<T>,
    key: (v: T) => K,
    val: (old: V | undefined, t: T) => V
  ): OrderedMap<K, V>;

  public static build<T, K extends OrderedMapKey, V extends NotUndefined>(
    items: Iterable<T>,
    key: (t: T) => K,
    val?: (old: V | undefined, t: T) => V
  ): OrderedMap<K, V> {
    const cfg = mkComparisonConfig();
    return new OrderedMap(cfg, build(cfg, items, key, val));
  }

  /** size is a readonly property containing the number of entries in the OrderedMap.
   *
   * @category IReadOnlyMap interface
   */
  get size(): number {
    return this.root === null ? 0 : this.root.size;
  }

  /** Looks up the value associated to the given key.  Returns undefined if the key is not found.
   *
   * @category IReadOnlyMap interface
   *
   * Runs in time O(log n)
   */
  get(k: K): V | undefined {
    return lookup(this.cfg, k, this.root);
  }

  /** Checks if the key exists in the OrderedMap.  Returns true if found, otherwise false
   *
   * @category IReadOnlyMap interface
   *
   * Runs in time O(log n)
   */
  has(k: K): boolean {
    return lookup(this.cfg, k, this.root) !== undefined;
  }

  /** Iterates the keys and values in the OrderedMap in ascending order of keys
   *
   * @category IReadOnlyMap interface
   *
   * @remarks
   * This is the default iteration when using `for .. of` directly on the `OrderedMap`.  It iterates
   * all keys and values in ascinding order of keys.
   */
  [Symbol.iterator](): IterableIterator<[K, V]> {
    return iterateAsc((k, v) => [k, v], this.root);
  }

  /** Iterates the keys and values in the OrderedMap in ascending order of keys
   *
   * @category IReadOnlyMap interface
   *
   * @remarks
   * This provides an iterator for all the entries in the map in ascending order of keys.
   * Similar to the builtin [Map.entries](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries),
   * it can only be iterated once.  Use {@link OrderedMap#toAscLazySeq} or {@link OrderedMap#toDescLazySeq} to create an iterable that can be
   * iterated more than once.
   */
  entries(): IterableIterator<[K, V]> {
    return iterateAsc((k, v) => [k, v], this.root);
  }

  /** Iterates the keys in the OrderedMap in ascending order
   *
   * @category IReadOnlyMap interface
   *
   * @remarks
   * This provides an iterator for all the keys in the map in ascending order of keys.
   * Similar to the builtin [Map.keys](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/keys),
   * it can only be iterated once.  Use {@link OrderedMap#keysToAscLazySeq} or {@link OrderedMap#keysToDescLazySeq} to
   * create an iterable that can be iterated more than once.
   */
  keys(): IterableIterator<K> {
    return iterateAsc((k) => k, this.root);
  }

  /** Iterates the values in the OrderedMap
   *
   * @category IReadOnlyMap interface
   *
   * @remarks
   * This provides an iterator for all the values in the map.  Despite only yielding values, the order of
   * iteration is in ascending order of keys.
   * Similar to the builtin [Map.values](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/values),
   * it can only be iterated once.  Use {@link OrderedMap#valuesToAscLazySeq} or {@link OrderedMap#valuesToDescLazySeq} to create an iterable that can be
   * iterated more than once.
   *
   */
  values(): IterableIterator<V> {
    return iterateAsc((_, v) => v, this.root);
  }

  /** Applys a function to each entry in the OrderedMap
   *
   * @category IReadOnlyMap interface
   *
   * @remarks
   * This applies the function `f` to each value and key in the hashmap. The order of iteration is
   * by ascending order of key.
   */
  forEach(f: (val: V, k: K, map: OrderedMap<K, V>) => void): void {
    foldl(
      (_, k, v) => {
        f(v, k, this);
        return undefined;
      },
      undefined,
      this.root
    );
  }

  /** Reduce all the entries in the OrderedMap to a single value
   *
   * @category Iteration
   *
   * @remarks
   * The letter-l in `foldl` stands for left.  Thinking of all the entries as an ascending list, `foldl` starts
   * combining entries from the left side.  Thus, the entry with the smallest key is combined with the zero value,
   * which is then combined with the next smallest key, and so on.
   */
  foldl<T>(f: (acc: T, key: K, val: V) => T, zero: T): T {
    return foldl(f, zero, this.root);
  }

  /** Reduce all the entries in the OrderedMap to a single value
   *
   * @category Iteration
   *
   * @remarks
   * The letter-r in `foldr` stands for right.  Thinking of all the entries as an ascending list, `foldr` starts
   * combining entries from the right side.  Thus, the entry with the largest key is combined with the zero value,
   * which is then combined with the second-to-largest key, and so on.
   */
  foldr<T>(f: (key: K, val: V, acc: T) => T, zero: T): T {
    return foldr(f, zero, this.root);
  }

  /** Creates a LazySeq which iterates all the entries in the OrderedMap in ascending order of keys
   *
   * @category Iteration
   */
  toAscLazySeq(): LazySeq<readonly [K, V]> {
    const root = this.root;
    return LazySeq.ofIterator(() => iterateAsc((k, v) => [k, v], root));
  }

  /** Creates a LazySeq which iterates all the keys in the OrderedMap in ascending order of keys
   *
   * @category Iteration
   */
  keysToAscLazySeq(): LazySeq<K> {
    const root = this.root;
    return LazySeq.ofIterator(() => iterateAsc((k) => k, root));
  }

  /** Creates a LazySeq which iterates all the values in the OrderedMap in ascending order of keys
   *
   * @category Iteration
   */
  valuesToAscLazySeq(): LazySeq<V> {
    const root = this.root;
    return LazySeq.ofIterator(() => iterateAsc((_, v) => v, root));
  }

  /** Creates a LazySeq which iterates all the entries in the OrderedMap in descending order of keys
   *
   * @category Iteration
   */
  toDescLazySeq(): LazySeq<readonly [K, V]> {
    const root = this.root;
    return LazySeq.ofIterator(() => iterateDesc((k, v) => [k, v], root));
  }

  /** Creates a LazySeq which iterates all the keys in the OrderedMap in descending order of keys
   *
   * @category Iteration
   */
  keysToDescLazySeq(): LazySeq<K> {
    const root = this.root;
    return LazySeq.ofIterator(() => iterateDesc((k) => k, root));
  }

  /** Creates a LazySeq which iterates all the values in the OrderedMap in descending order of keys
   *
   * @category Iteration
   */
  valuesToDescLazySeq(): LazySeq<V> {
    const root = this.root;
    return LazySeq.ofIterator(() => iterateDesc((_, v) => v, root));
  }

  /** Creates an OrderedSet which contains all the keys in the OrderedMap
   *
   * @category Iteration
   *
   * @remarks
   * This function is O(1) and very fast because the backing data structure is reused.
   * Essentially, the OrderedMap and OrderedSet classes are just two different APIs against the
   * same underlying balanced tree.  Since both OrderedSet and OrderedMap are immutable, they can both
   * share the same underlying tree without problems.
   */
  keySet(): OrderedSet<K> {
    return OrderedSet.ofKeys(this);
  }

  /** Return a new OrderedMap with the given key set to the given value
   *
   * @category Modification
   *
   * @remarks
   * If the key already exists and the value is `===` to the existing value, then the OrderedMap
   * object instance is returned unchanged.
   *
   * Runs in time O(log n)
   */
  set(k: K, v: V): OrderedMap<K, V> {
    const newRoot = alter(this.cfg, k, () => v, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  /** Return a new OrderedMap by inserting, modifying, or deleting the value at a given key
   *
   * @category Modification
   *
   * @remarks
   * `alter` is a generalization of `get`, `set`, and `delete`.  It can be used to
   * insert a new entry, modify an existing entry, or delete an existing entry.  `alter` first
   * looks for the key in the map.  The function `f` is then applied to the existing value
   * if the key was found and `undefined` if the key does not exist.  If the function `f`
   * returns `undefined`, the entry is deleted and if `f` returns a value, the entry is updated
   * to use the new value.
   *
   * If the key is not found and `f` returns undefined or the key exists and the function `f` returns
   * a value `===` to the existing value, then the OrderedMap object instance is returned unchanged.
   *
   * Runs in time O(log n)
   */
  alter(k: K, f: (existing: V | undefined) => V | undefined): OrderedMap<K, V> {
    const newRoot = alter(this.cfg, k, f, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  /** Return a new OrderedMap with entry with the given key removed (if it exists)
   *
   * @category Modification
   *
   * @remarks
   * If the key does not exist, then the OrderedMap object instance is returned unchanged.
   *
   * Runs in time O(log n)
   */
  delete(k: K): OrderedMap<K, V> {
    const newRoot = alter(this.cfg, k, constUndefined, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  /** Split an OrderedMap into two OrderedMaps based on a function
   *
   * @category Transformation
   *
   * @remarks
   * The function `f` is applied to each key and value.  The entries for which `f` returns `true`
   * are placed in one OrderedMap and entries for which `f` returns false are placed in the other.
   * The two OrderedMaps are returned as a tuple, with the `true` ordered map returned as the first
   * element of the tuple.
   *
   * If the function `f` returns `true` for all entries, then the first OrderedMap object instance
   * is guaranteed to be === to the `this` object instance.  Similar for if `f` returns `false` for
   * all entries.
   *
   * This runs in O(n) time.
   */
  partition(f: (k: K, v: V) => boolean): readonly [OrderedMap<K, V>, OrderedMap<K, V>] {
    const [trueRoot, falseRoot] = partition(f, this.root);
    if (trueRoot === this.root) {
      return [this, new OrderedMap(this.cfg, null)];
    } else if (falseRoot === this.root) {
      return [new OrderedMap(this.cfg, null), this];
    } else {
      return [new OrderedMap(this.cfg, trueRoot), new OrderedMap(this.cfg, falseRoot)];
    }
  }

  /** Transform the values in the OrderedMap using a function
   *
   * @category Transformation
   *
   * @remarks
   * `mapValues` applies the function `f` to each value and key in the OrderedMap and returns a new OrderedMap
   * with the same keys but the values adjusted to the result of the function `f`.  This can be done efficiently because
   * the keys are unchanged the arrangement of the tree is unchanged.  If you wish to transform
   * both the keys and the values, either use {@link OrderedMap#toAscLazySeq}, map the lazy sequence, and then convert the
   * lazy sequence back to an OrderedMap or use {@link OrderedMap#adjust} to bulk-adjust keys.
   *
   * `mapValues` guarantees that if no values are changed, then the OrderedMap object instance is returned
   * unchanged.
   *
   * This runs in O(n) time.
   */
  mapValues<V2>(f: (v: V, k: K) => V2): OrderedMap<K, V2> {
    const newRoot = mapValues(f, this.root);
    if (newRoot === this.root) {
      return this as unknown as OrderedMap<K, V2>;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  /** Transform or delete the values in the OrderedMap using a function
   *
   * @category Transformation
   *
   * @remarks
   * `collectValues` applies the function `f` to each value and key in the OrderedMap.  If `f` returns null or undefined,
   * the key and value is removed.  Otherwise, the returned value from `f` is used as the new value associated to the key k.
   * This can be done efficiently because the keys are unchanged the arrangement of the tree
   * is unchanged.  If you wish to transform both the keys and the values, either use {@link OrderedMap#toAscLazySeq},
   * map the lazy sequence, and then convert the lazy sequence back to an Ordered or use {@link OrderedMap#alter} to change many keys
   * in bulk.
   *
   * `collectValues` guarantees that if no values are changed, then the OrderedMap object instance is returned
   * unchanged.
   *
   * This runs in O(n) time.
   */
  collectValues<V2>(f: (v: V, k: K) => V2 | null | undefined): OrderedMap<K, V2> {
    const newRoot = collectValues(f as (v: V, k: K) => V2 | undefined, true, this.root);
    if (newRoot === this.root) {
      return this as unknown as OrderedMap<K, V2>;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  /** Remove entries from the OrderedMap that return false from a predicate
   *
   * @category Transformation
   *
   * @remarks
   * `filter` applies the function `f` to each value and key in the OrderedMap.  If `f` returns false, the
   * key is removed.
   *
   * `filter` guarantees that if no values are removed, then the OrderedMap object instance is returned
   * unchanged.
   *
   * This runs in O(n) time.
   */
  filter(f: (v: V, k: K) => boolean): OrderedMap<K, V> {
    const newRoot = collectValues((v, k) => (f(v, k) ? v : undefined), false, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  /** Split an OrderedMap into the entries below a key, the value for a key, and the entries above a key
   *
   * @category Transformation
   *
   * @remarks
   * `split` returns an object with three properties.  `below` is an OrderedMap with all the entries
   * which have key less than the provided key `k`.  If the provided key `k` exists in the OrderedMap,
   * the returned `val` property contains the value associated with the key `k`.  Otherwise, `val` is undefined.
   * Finally, the `above` property consists of all the entries in the OrderedMap with keys greater than `k`.
   *
   * This runs in time O(log n)
   */
  split(k: K): {
    readonly below: OrderedMap<K, V>;
    readonly val: V | undefined;
    readonly above: OrderedMap<K, V>;
  } {
    const s = split(this.cfg, k, this.root);
    return {
      below: new OrderedMap(this.cfg, s.below),
      val: s.val,
      above: new OrderedMap(this.cfg, s.above),
    };
  }

  /** Find the minimum key and asscoiated value in the OrderedMap
   *
   * @category Min/Max Keys
   *
   * @remarks
   * In O(log n) time, find the minimum key.  Returns undefined if the OrderedMap is empty.
   */
  lookupMin(): readonly [K, V] | undefined {
    if (this.root === null) return undefined;
    else return lookupMin(this.root);
  }

  /** Find the maximum key and asscoiated value in the OrderedMap
   *
   * @category Min/Max Keys
   *
   * @remarks
   * In O(log n) time, find the maximum key.  Returns undefined if the OrderedMap is empty.
   */
  lookupMax(): readonly [K, V] | undefined {
    if (this.root === null) return undefined;
    else return lookupMax(this.root);
  }

  /** Remove the minimum key and return the resulting OrderedMap
   *
   * @category Min/Max Keys
   *
   * @remarks
   * In O(log n) time, find and remove the minimum key.
   */
  deleteMin(): OrderedMap<K, V> {
    if (this.root === null) return this;
    const m = minView(this.root);
    return new OrderedMap(this.cfg, m.rest);
  }

  /** Remove the maximum key and return the resulting OrderedMap
   *
   * @category Min/Max Keys
   *
   * @remarks
   * In O(log n) time, find and remove the maximum key.
   */
  deleteMax(): OrderedMap<K, V> {
    if (this.root === null) return this;
    const m = maxView(this.root);
    return new OrderedMap(this.cfg, m.rest);
  }

  /** Lookup and remove the minimum key
   *
   * @category Min/Max Keys
   *
   * @remarks
   * In O(log n) time, find and remove the minimum key.  The minimum key, the asscoiated value,
   * and the result of removing the minimum key are returned.  If the original OrderedMap is empty,
   * undefined is returned.
   */
  minView():
    | { readonly minKey: K; readonly minVal: V; readonly rest: OrderedMap<K, V> }
    | undefined {
    if (this.root === null) {
      return undefined;
    } else {
      const m = minView(this.root);
      return { minKey: m.k, minVal: m.v, rest: new OrderedMap(this.cfg, m.rest) };
    }
  }

  /** Lookup and remove the maximum key
   *
   * @category Min/Max Keys
   *
   * @remarks
   * In O(log n) time, find and remove the maximum key.  The maximum key, the asscoiated value,
   * and the result of removing the maximum key are returned.  If the original OrderedMap is empty,
   * undefined is returned.
   */
  maxView():
    | { readonly maxKey: K; readonly maxVal: V; readonly rest: OrderedMap<K, V> }
    | undefined {
    if (this.root === null) {
      return undefined;
    } else {
      const m = maxView(this.root);
      return { maxKey: m.k, maxVal: m.v, rest: new OrderedMap(this.cfg, m.rest) };
    }
  }

  /** Returns a new OrderedMap which combines all entries in two OrderedMaps
   *
   * @category Bulk Modification
   *
   * @remarks
   * `union` produces a new OrderedMap which contains all the entries in both OrderedMaps.  If a
   * key appears in only one of the two maps, the value from the map is used.  If a key appears
   * in both maps, the provided merge function is used to determine the value.  If the merge function
   * is not specified, the value from `other` is used.
   *
   * `union` guarantees that if the resulting OrderedMap is equal to `this`, then the OrderedMap object
   * instance is returned unchanged.
   *
   * Runs in time O(m log(n/m)) where m is the size of the smaller map and n is the size of the larger map.
   */
  union(
    other: OrderedMap<K, V>,
    merge?: (vThis: V, vOther: V, k: K) => V
  ): OrderedMap<K, V> {
    const newRoot = union(this.cfg, merge ?? ((_, s) => s), this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  /** Create a new HashMap which combines all entries in a sequence of HashMaps
   *
   * @category Bulk Modification
   *
   * @remarks
   * `OrderedMap.union` is the static version of {@link OrderedMap#union} and allows unioning more than two OrderedMaps
   * at once.  It produces a new OrderedMap which contains all the entries in all the OrderedMaps.  If a
   * key appears in only one of the maps, the value from that map is used.  If a key appears
   * in multiple maps, the provided merge function is used to determine the value.  The order of merging
   * is equivalent to the order of maps in the sequence.
   *
   * `union` guarantees that if the resulting OrderedMap is equal to the first non-empty OrderedMap in the sequence,
   * then the OrderedMap object instance is returned unchanged.
   */
  public static union<K extends OrderedMapKey, V extends NotUndefined>(
    merge: (v1: V, v2: V, k: K) => V,
    ...maps: readonly OrderedMap<K, V>[]
  ): OrderedMap<K, V> {
    const nonEmpty = maps.filter((m) => m.size > 0);
    if (nonEmpty.length === 0) {
      return OrderedMap.empty<K, V>();
    } else {
      let root = nonEmpty[0].root;
      for (let i = 1; i < nonEmpty.length; i++) {
        const m = nonEmpty[i];
        root = union(m.cfg, merge, root, m.root);
      }
      if (root === nonEmpty[0].root) {
        return nonEmpty[0];
      } else {
        return new OrderedMap(nonEmpty[0].cfg, root);
      }
    }
  }

  /** Returns a new HashMap which contains only entries whose keys are in both OrderedMaps
   *
   * @category Bulk Modification
   *
   * @remarks
   * `intersection` produces a new OrderedMap which contains all the entries which have keys in
   * both HashMaps.  For each such entry, the merge function is used to determine the resulting value.
   * If the merge function is not specified, the value from the `other` is used.
   *
   * `intersection` guarantees that if the resulting OrderedMap is equal to `this`, then the OrderedMap object
   * instance is returned unchanged.
   *
   * Runs in time O(m log(n/m)) where m is the size of the smaller map and n is the size of the larger map.
   */
  intersection(
    other: OrderedMap<K, V>,
    merge?: (vThis: V, vOther: V, k: K) => V
  ): OrderedMap<K, V> {
    const newRoot = intersection(this.cfg, merge ?? ((_, s) => s), this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  /** Returns a new OrderedMap which contains only entries whose keys are in all OrderedMaps
   *
   * @category Bulk Modification
   *
   * @remarks
   * `OrderedMap.intersection` is a static version of {@link OrderedMap#intersection}, and produces a new OrderedMap
   * which contains the entries which have keys in all specified OrderedMaps.  For each such entry, the merge
   * function is used to determine the resulting value.
   *
   * `intersection` guarantees that if the resulting OrderedMap is equal to the first non-empty OrderedMap, then the
   * OrderedMap object * instance is returned unchanged.
   */
  public static intersection<K extends OrderedMapKey, V extends NotUndefined>(
    merge: (v1: V, v2: V, k: K) => V,
    ...maps: readonly OrderedMap<K, V>[]
  ): OrderedMap<K, V> {
    if (maps.length === 0) {
      return OrderedMap.empty();
    } else {
      let root = maps[0].root;
      for (let i = 1; i < maps.length; i++) {
        const m = maps[i];
        root = intersection(m.cfg, merge, root, m.root);
      }
      if (root === maps[0].root) {
        return maps[0];
      } else {
        return new OrderedMap(maps[0].cfg, root);
      }
    }
  }

  /** Returns a new OrderedMap which contains only keys which do not appear in the provided OrderedMap
   *
   * @category Bulk Modification
   *
   * @remarks
   * `difference` produces a new OrderedMap which contains all the entries in `this` where the key does
   * **not** exist in the provided `other` OrderedMap.  Can think of this as `this - other` where the subtraction
   * is removing all the keys in `other` from `this`.  The values of the `other` OrderedMap are ignored and
   * can be any value `V2`.
   *
   * `difference` guarantees that if no entries are removed from `this`, then the OrderedMap object
   * instance is returned unchanged.
   *
   * Runs in time O(m log(n/m)) where m is the size of the smaller map and n is the size of the larger map.
   */
  difference<V2>(other: OrderedMap<K, V2>): OrderedMap<K, V> {
    const newRoot = difference(this.cfg, this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  /** Returns a new OrderedMap which contains only keys which do not appear in the provided OrderedSet
   *
   * @category Bulk Modification
   *
   * @remarks
   * `withoutKeys` produces a new OrderedMap which contains all the entries in `this` where the key does
   * **not** exist in the provided `keys` OrderedSet.
   *
   * `withoutKeys` guarantees that if no entries are removed from `this`, then the OrderedMap object
   * instance is returned unchanged.
   *
   * Runs in time O(m log(n/m)) where m is the size of the smaller map and n is the size of the larger map.
   */
  withoutKeys(other: OrderedSet<K>): OrderedMap<K, V> {
    const setPrivate = other as unknown as { root: TreeNode<K, unknown> | null };
    const newRoot = difference(this.cfg, this.root, setPrivate.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  /** Return a new OrderedMap which adjusts all the provided keys with a specified modification function.
   *
   * @category Bulk Modification
   *
   * @remarks
   * `adjust` is passed a OrderedMap of keys to adjust associated to helper values of type `V2` (the type `V2` can be
   * anything).  For each key to modify, `adjust` then calls the `adjustVal` function with the current existing
   * value in the OrderedMap (or `undefined` if the key does not exist) and the helper value associated with the key.
   * The return value is set as the new value for the key, or removed if the return value is `undefined`.
   *
   * `adjust` guarantees that if no entries are changed from `this`, then the OrderedMap object
   * instance is returned unchanged.
   *
   * Runs in time O(n + m) where n and m are the sizes of this OrderedMap and the `keysToAdjust` OrderedMap.
   */
  adjust<V2>(
    keysToAdjust: OrderedMap<K, V2>,
    adjustVal: (existingVal: V | undefined, helperVal: V2, k: K) => V | undefined
  ): OrderedMap<K, V> {
    const newRoot = adjust(this.cfg, adjustVal, this.root, keysToAdjust.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  private cfg: ComparisionConfig<K>;
  private root: TreeNode<K, V> | null;

  private constructor(cfg: ComparisionConfig<K>, root: TreeNode<K, V> | null) {
    this.cfg = cfg;
    this.root = root;
  }
}

Object.defineProperty(OrderedMap.prototype, "@@__IMMUTABLE_KEYED__@@", { value: true });
