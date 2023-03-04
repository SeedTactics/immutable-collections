/* Copyright John Lenz, BSD license, see LICENSE file for details */

import {
  adjust,
  alter,
  build,
  collectValues,
  difference,
  fold,
  from,
  HamtNode,
  insert,
  intersection,
  iterate,
  lookup,
  mapValues,
  remove,
  union,
} from "../data-structures/hamt.js";
import { HashConfig, HashKey, mkHashConfig } from "../data-structures/hashing.js";
import { LazySeq } from "../lazyseq.js";
import { HashSet } from "./hashset.js";

// eslint-disable-next-line @typescript-eslint/ban-types
type NotUndefined = {} | null;

/**
 * Immutable Hash Map
 *
 * @remarks
 * The `HashMap<K, V>` class stores key-value pairs where the keys have type `K`
 * and the values type `V`.  Keys can be numbers, strings, booleans, dates, or
 * custom objects which implement the {@link class_api!HashableObj} and {@link class_api!ComparableObj} interfaces.
 * `HashMap` implements the typescript-builtin `ReadonlyMap` interface (which
 * consists of the read-only methods of [the JS builtin
 * Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)).
 *
 * The HashMap is immutable, which means that no changes or mutations are
 * allowed directly to the HashMap.  Instead, modification operations such as
 * {@link HashMap#delete} return a new HashMap which contains the result of the
 * modification.  The original HashMap is unchanged and can continue to be
 * accessed and used.  The HashMap implements this efficiently using structural
 * sharing and does not require a full copy.
 */
export class HashMap<K extends HashKey, V> implements ReadonlyMap<K, V> {
  /** Static method to create a new empty HashMap
   *
   * @category Creating Hash Maps
   *
   * @remarks The key type must extend {@link class_api!HashKey}, which consists of strings,
   * numbers, dates, booleans, or a custom user-defined object which implements
   * the {@link class_api!HashableObj} and {@link class_api!ComparableObj} interfaces.
   * These interfaces allows you to create complex keys which are made up of multiple properties.  Values can
   * have any type but can not contain `undefined`.  The value type can include
   * `null` if you wish to represent missing or empty values.
   *
   * While you can start with an empty `HashMap` and then use {@link HashMap#set}
   * to add entries, it is more efficient to create the HashMap in bulk using
   * either the static {@link HashMap.from} or {@link HashMap.build} or using
   * various methods on {@link LazySeq} to convert a `LazySeq` to a `HashMap`.
   *
   * @example
   * ```ts
   * import { HashMap } from "@seedtactics/immutable-collections";
   * const hEmpty = HashMap.empty<string, number>();
   * const h = hEmpty.set("one", 1).set("two", 2);
   * for (const [k, v] of h) {
   *   console.log("key " + k + ": " + v.toString());
   * }
   * ```
   */
  public static empty<K extends HashKey, V extends NotUndefined>(): HashMap<K, V> {
    return new HashMap(mkHashConfig(), null, 0);
  }

  /** Efficiently create a new HashMap from key-value pairs
   *
   * @category Creating Hash Maps
   *
   * @remarks
   * `from` efficiently creates a HashMap from a sequence of key-value pairs.  An optional `merge` function
   * can be provided.  When `from` detects a duplicate key, the merge function is called to determine
   * the value associated to the key.  The first parameter `v1` to the merge function is the existing value
   * and the second parameter `v2` is the new value just recieved from the sequence. The return value from the
   * merge function is the value associated to the key.  If no merge function is provided, the second value `v2`
   * is used, overwriting the first value `v1`.
   *
   * If you have a LazySeq, the LazySeq.{@link LazySeq#toHashMap} method is an easy way to call `from`.
   *
   * @example
   * ```ts
   * import { HashMap } from "@seedtactics/immutable-collections";
   * const h = HashMap.from(
   *   [["one", 1], ["two", 2], ["one", 3]]
   * );
   * console.log(h.get("one")); // prints 3 because 3 overwrites the 1
   * console.log(h.get("two")); // prints 2
   * ```
   *
   * @example
   * ```ts
   * import { HashMap } from "@seedtactics/immutable-collections";
   * const h = HashMap.from(
   *   [["one", 1], ["two", 2], ["one", 3]],
   *   (v1, v2) => v1 + v2 + 100
   * );
   * console.log(h.get("one")); // prints 104 because merge is called with 1 and 3
   * console.log(h.get("two")); // prints 2
   * ```
   */
  public static from<K extends HashKey, V extends NotUndefined>(
    items: Iterable<readonly [K, V]>,
    merge?: (v1: V, v2: V) => V
  ): HashMap<K, V> {
    const cfg = mkHashConfig();
    const [root, size] = from(cfg, items, merge);
    return new HashMap(cfg, root, size);
  }

  /** Efficently create a new HashMap
   *
   * @category Creating Hash Maps
   *
   * @remarks
   * `build` efficiently creates a HashMap from a sequence of values and a key extraction function.  If a
   * duplicate key is found, the later value is used and the earlier value is overwritten.  If this is
   * not desired, use the more generalized version of `build` which also provides a value extraction function.
   */
  public static build<K extends HashKey, V extends NotUndefined>(
    items: Iterable<V>,
    key: (v: V) => K
  ): HashMap<K, V>;

  /** Efficently create a new HashMap
   *
   * @category Creating Hash Maps
   *
   * @remarks
   * `build` efficiently creates a HashMap from a sequence of items, a key extraction function, and a value extraction
   * function.  The sequence of initial items can have any type `T`, and for each item the key is extracted.  If the key does not
   * yet exist, the `val` extraction function is called with `undefined` to retrieve the value associated to the key.
   * If the key already exists in the HashMap, the `val` extraction function is called with the `old` value to
   * merge the new item `t` into the existing value `old`.
   */
  public static build<T, K extends HashKey, V extends NotUndefined>(
    items: Iterable<T>,
    key: (v: T) => K,
    val: (old: V | undefined, t: T) => V
  ): HashMap<K, V>;

  public static build<T, K extends HashKey, V extends NotUndefined>(
    items: Iterable<T>,
    key: (t: T) => K,
    val?: (old: V | undefined, t: T) => V
  ): HashMap<K, V> {
    const cfg = mkHashConfig();
    const [root, size] = build(cfg, items, key, val as (old: V | undefined, t: T) => V);
    return new HashMap(cfg, root, size);
  }

  /** size is a readonly property containing the number of entries in the HashMap.
   *
   * @category IReadOnlyMap interface
   */
  readonly size: number;

  /** Looks up the value associated to the given key.  Returns undefined if the key is not found.
   *
   * @category IReadOnlyMap interface
   *
   */
  get(k: K): V | undefined {
    if (this.root === null) return undefined;
    return lookup(this.cfg, k, this.root);
  }

  /** Checks if the key exists in the HashMap.  Returns true if found, otherwise false
   *
   * @category IReadOnlyMap interface
   *
   */
  has(k: K): boolean {
    return this.get(k) !== undefined;
  }

  /** Iterates the keys and values in the HashMap
   *
   * @category IReadOnlyMap interface
   *
   * @remarks
   * This is the default iteration when using `for .. of` directly on the `HashMap`.  It iterates
   * all keys and values.  The order of iteration is an implementation detail and cannot be relied upon,
   * it depends on the hashes and how the internal data is organized.
   *
   * @example
   * ```ts
   * import { HashMap } from "@seedtactics/immutable-collections";
   * const h = HashMap.from([["one", 1], ["two", 2], ["three", 3]]);
   * for (const [k, v] of h) {
   *   console.log("key " + k + ": " + v.toString());
   * }
   *
   * // will print
   * // key one: 1
   * // key two: 2
   * // key three: 3
   * ```
   */
  [Symbol.iterator](): IterableIterator<[K, V]> {
    return iterate((k, v) => [k, v], this.root);
  }

  /** Iterates the keys and values in the HashMap
   *
   * @category IReadOnlyMap interface
   *
   * @remarks
   * This provides an iterator for all the entries in the map.  The order of iteration is an
   * implementation detail and cannot be relied upon, it depends on the hashes and how the internal
   * data is organized. Similar to the builtin [Map.entries](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries),
   * it can only be iterated once.  Use {@link HashMap#toLazySeq} to create an iterable that can be
   * iterated more than once.
   *
   */
  entries(): IterableIterator<[K, V]> {
    return iterate((k, v) => [k, v], this.root);
  }

  /** Iterates the keys in the HashMap
   *
   * @category IReadOnlyMap interface
   *
   * @remarks
   * This provides an iterator for all the keys in the map.  The order of iteration is an
   * implementation detail and cannot be relied upon, it depends on the hashes and how the internal
   * data is organized. Similar to the builtin [Map.keys](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/keys),
   * it can only be iterated once.  Use {@link HashMap#keysToLazySeq} to create an iterable that can be
   * iterated more than once.
   *
   */
  keys(): IterableIterator<K> {
    return iterate((k) => k, this.root);
  }

  /** Iterates the values in the HashMap
   *
   * @category IReadOnlyMap interface
   *
   * @remarks
   * This provides an iterator for all the values in the map.  The order of iteration is an
   * implementation detail and cannot be relied upon, it depends on the hashes and how the internal
   * data is organized. Similar to the builtin [Map.values](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/values),
   * it can only be iterated once.  Use {@link HashMap#valuesToLazySeq} to create an iterable that can be
   * iterated more than once.
   *
   */
  values(): IterableIterator<V> {
    return iterate((_, v) => v, this.root);
  }

  /** Applys a function to each entry in the HashMap
   *
   * @category IReadOnlyMap interface
   *
   * @remarks
   * This applies the function `f` to each value and key in the hashmap. The order of iteration is an
   * implementation detail and cannot be relied upon, it depends on the hashes and how the internal
   * data is organized.
   */
  forEach(f: (val: V, k: K, map: HashMap<K, V>) => void): void {
    fold(
      (_, k, v) => {
        f(v, k, this);
        return undefined;
      },
      undefined,
      this.root
    );
  }

  /** Reduce all the entries in the HashMap to a single value
   *
   * @category Other Read Methods
   */
  fold<T>(f: (acc: T, key: K, val: V) => T, zero: T): T {
    return fold(f, zero, this.root);
  }

  /** Creates a LazySeq which iterates all the entries in the HashMap
   *
   * @category Other Read Methods
   */
  toLazySeq(): LazySeq<readonly [K, V]> {
    const root = this.root;
    return LazySeq.ofIterator(() => iterate((k, v) => [k, v], root));
  }

  /** Creates a LazySeq which iterates all the keys in the HashMap
   *
   * @category Other Read Methods
   */
  keysToLazySeq(): LazySeq<K> {
    const root = this.root;
    return LazySeq.ofIterator(() => iterate((k) => k, root));
  }

  /** Creates a LazySeq which iterates all the values in the HashMap
   *
   * @category Other Read Methods
   */
  valuesToLazySeq(): LazySeq<V> {
    const root = this.root;
    return LazySeq.ofIterator(() => iterate((_, v) => v, root));
  }

  /** Creates a HashSet which contains all the keys in the HashMap
   *
   * @category Other Read Methods
   *
   * @remarks
   * This function is O(1) and very fast because the backing data structure is reused.
   * Essentially, the HashMap and {@link HashSet} classes are just two different APIs against the
   * same underlying tree.  Since both HashSet and HashMap are immutable, they can both
   * share the same underlying tree without problems.
   */
  keySet(): HashSet<K> {
    return HashSet.ofKeys(this);
  }

  /** Return a new HashMap with the given key set to the given value
   *
   * @category Modification
   *
   * @remarks
   * If the key already exists and the value is `===` to the existing value, then the HashMap
   * object instance is returned unchanged.
   *
   * @example
   * ```ts
   * import { HashMap } from "@seedtactics/immutable-collections";
   * const h = HashMap.from([["one", 1], ["two", 2], ["three", 3]]);
   *
   * const h2 = h.set("one", 1);
   * console.log(h === h2); // prints true
   *
   * const h3 = h.set("one", 50);
   * console.log(h === h3); // prints false
   *
   * console.log(h.get("one")); // prints 1
   * console.log(h3.get("one")); // prints 50
   * ```
   */
  set(k: K, v: V): HashMap<K, V> {
    return this.modify(k, () => v);
  }

  /** Return a new HashMap with the value at a key modified using a function
   *
   * @category Modification
   *
   * @remarks
   * The modify function is a more efficient combination of {@link HashMap#get} and {@link HashMap#set}.  `modify` first
   * looks for the key in the map.  If the key is found, the function `f` is applied to the
   * existing value and the result is used to set the new value.  If the key is not found, the
   * function `f` is applied to `undefined` and the result is used to set the new value.
   * This allows you to either insert ot modify the value at a key.
   *
   * If the key already exists and the returned value is `===` to the existing value, then the HashMap
   * object instance is returned unchanged.
   */
  modify(k: K, f: (existing: V | undefined) => V): HashMap<K, V> {
    const [newRoot, inserted] = insert(this.cfg, k, f, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashMap(this.cfg, newRoot, this.size + (inserted ? 1 : 0));
    }
  }

  /** Return a new HashMap with the given key removed (if it exists)
   *
   * @category Modification
   *
   * @remarks
   * If the key does not exist, then the HashMap object instance is returned unchanged.
   */
  delete(k: K): HashMap<K, V> {
    const newRoot = remove(this.cfg, k, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashMap(this.cfg, newRoot, this.size - 1);
    }
  }

  /** Return a new HashMap by inserting, modifying, or deleting the value at a given key
   *
   * @category Modification
   *
   * @remarks
   * `alter` is a generalization of {@link HashMap#get}, {@link HashMap#set}, {@link HashMap#modify},
   * and {@link HashMap#delete}.  It can be used to insert a new entry, modify an existing entry, or
   * delete an existing entry.  `alter` first looks for the key in the map.  The function `f` is then
   * applied to the existing value if the key was found and `undefined` if the key does not exist.
   * If the function `f` returns `undefined`, the entry is deleted and if `f` returns a value, the
   * entry is updated to use the new value.
   *
   * If the key is not found and `f` returns undefined or the key exists and the function `f` returns
   * a value `===` to the existing value, then the HashMap object instance is returned unchanged.
   */
  alter(k: K, f: (existing: V | undefined) => V | undefined): HashMap<K, V> {
    const [newRoot, sizeChange] = alter(this.cfg, k, f, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashMap(this.cfg, newRoot, this.size + sizeChange);
    }
  }

  /** Transform the values in the HashMap using a function
   *
   * @category Transformation
   *
   * @remarks
   * `mapValues` applies the function `f` to each value and key in the HashMap and returns a new HashMap
   * with the same keys but the values adjusted to the result of the function `f`.  This can be done efficiently because
   * the keys are unchanged the arrangement of the data structure is unchanged.  If you wish to transform
   * both the keys and the values, use {@link HashMap#toLazySeq}, map the lazy sequence, and then convert the
   * lazy sequence back to a HashMap.  (This is the most efficient way to transform both the keys and values, since
   * if the keys change the entire data structure needs to be rebuilt anyway.)
   *
   * `mapValues` guarantees that if no values are changed, then the HashMap object instance is returned
   * unchanged.
   */
  mapValues<V2 extends NotUndefined>(f: (v: V, k: K) => V2): HashMap<K, V2> {
    const newRoot = mapValues(f, this.root);
    if (newRoot === this.root) {
      // if the roots didn't change, then the map is empty or  the values were === which
      // means that V1 is the same as V2.  In either case, can cast.
      return this as unknown as HashMap<K, V2>;
    } else {
      return new HashMap(this.cfg, newRoot, this.size);
    }
  }

  /** Transform or delete the values in the HashMap using a function
   *
   * @category Transformation
   *
   * @remarks
   * `collectValues` applies the function `f` to each value and key in the HashMap.  If `f` returns null or undefined,
   * the key and value is removed.  Otherwise, the returned value from `f` is used as the new value associated to the key k.
   * This can be done efficiently because the keys are unchanged the arrangement of the data
   * structure is unchanged.  If you wish to transform both the keys and the values, use {@link HashMap#toLazySeq},
   * map the lazy sequence, and then convert the lazy sequence back to a HashMap.  (This is the most efficient
   * way to transform both the keys and values, since if the keys change the entire data structure needs to be
   * rebuilt anyway.)
   *
   * `collectValues` guarantees that if no values are changed, then the HashMap object instance is returned
   * unchanged.
   */
  collectValues<V2 extends NotUndefined>(
    f: (v: V, k: K) => V2 | null | undefined
  ): HashMap<K, V2> {
    const [newRoot, newSize] = collectValues(
      f as (v: V, k: K) => V2 | undefined,
      true,
      this.root
    );
    if (newRoot === this.root) {
      // if the roots didn't change, then the map is empty or  the values were === which
      // means that V1 is the same as V2.  In either case, can cast.
      return this as unknown as HashMap<K, V2>;
    } else {
      return new HashMap(this.cfg, newRoot, newSize);
    }
  }

  /** Remove entries from the HashMap that return false from a predicate
   *
   * @category Transformation
   *
   * @remarks
   * `filter` applies the function `f` to each value and key in the HashMap.  If `f` returns false, the
   * key is removed.
   * `filter` guarantees that if no values are removed, then the HashMap object instance is returned
   * unchanged.
   */
  filter(f: (v: V, k: K) => boolean): HashMap<K, V> {
    const [newRoot, newSize] = collectValues(
      (v, k) => (f(v, k) ? v : undefined),
      false,
      this.root
    );
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashMap(this.cfg, newRoot, newSize);
    }
  }

  /** Apply a function to the HashMap
   *
   * @category Transformation
   *
   * @remarks
   * Applies the provided function `f` to `this` and returns the result.  This is a convenience function
   * which allows you to continue to chain operations without having to create a new
   * temporary variable.
   */
  transform<U>(f: (s: HashMap<K, V>) => U): U {
    return f(this);
  }

  // TODO: partition(f: (v: V, k: K) => boolean): readonly [HashMap<K, V>, HashMap<K, V>]

  /** Returns a new HashMap which combines all entries in two HashMaps
   *
   * @category Bulk Modification
   *
   * @remarks
   * `union` produces a new HashMap which contains all the entries in both HashMaps.  If a
   * key appears in only one of the two maps, the value from the map is used.  If a key appears
   * in both maps, the provided merge function is used to determine the value.  If the merge function
   * is not specified, the value from the `other` HashMap provided as an argument is used and the
   * value from `this` is ignored.
   *
   * `union` guarantees that if the resulting HashMap is equal to `this`, then the HashMap object
   * instance is returned unchanged.
   */
  union(other: HashMap<K, V>, merge?: (vThis: V, vOther: V, k: K) => V): HashMap<K, V> {
    const [newRoot, intersectionSize] = union(
      this.cfg,
      merge ?? ((_, s) => s),
      this.root,
      other.root
    );
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashMap(this.cfg, newRoot, this.size + other.size - intersectionSize);
    }
  }

  /** Create a new HashMap which combines all entries in a sequence of HashMaps
   *
   * @category Bulk Modification
   *
   * @remarks
   * `HashMap.union` is the static version of {@link HashMap#union} and allows unioning more than two HashMaps
   * at once.  It produces a new HashMap which contains all the entries in all the HashMaps.  If a
   * key appears in only one of the maps, the value from that map is used.  If a key appears
   * in multiple maps, the provided merge function is used to determine the value.  The order of merging
   * is equivalent to the order of maps in the sequence.
   *
   * `union` guarantees that if the resulting HashMap is equal to the first non-empty HashMap in the sequence,
   * then the HashMap object instance is returned unchanged.
   */
  public static union<K extends HashKey, V extends NotUndefined>(
    merge: (v1: V, v2: V, k: K) => V,
    ...maps: readonly HashMap<K, V>[]
  ): HashMap<K, V> {
    const nonEmpty = maps.filter((m) => m.size > 0);
    if (nonEmpty.length === 0) {
      return HashMap.empty<K, V>();
    } else {
      let root = nonEmpty[0].root;
      let newSize = nonEmpty[0].size;
      for (let i = 1; i < nonEmpty.length; i++) {
        const m = nonEmpty[i];
        const [r, intersectionSize] = union(m.cfg, merge, root, m.root);
        root = r;
        newSize += m.size - intersectionSize;
      }
      if (root === nonEmpty[0].root) {
        return nonEmpty[0];
      } else {
        return new HashMap(nonEmpty[0].cfg, root, newSize);
      }
    }
  }

  /** Return a new HashMap which adds the entries.
   *
   * @category Bulk Modification
   *
   * @remarks
   * `append` is just a shorthand for a combination of {@link HashMap.from} and {@link HashMap#union}.  `union`
   * is very efficient at combining data structures, so the fastest way to bulk-add entries is to first create
   * a data structure of the entries to add and then union them into the existing data structure.  Thus, if you
   * already have a HashMap or {@link HashMap.build} is more ergonomic, you should just directly use {@link HashMap#union}.
   */
  append(items: Iterable<readonly [K, V & NotUndefined]>): HashMap<K, V> {
    return this.union(HashMap.from(items));
  }

  /** Returns a new HashMap which contains only entries whose keys are in both HashMaps
   *
   * @category Bulk Modification
   *
   * @remarks
   * `intersection` produces a new HashMap which contains all the entries which have keys in
   * both HashMaps.  For each such entry, the merge function is used to determine the resulting value.
   * If the merge function is not specified, the value from the `other` HashMap provided as an argument
   * is used and the value from `this` is ignored.
   *
   * `intersection` guarantees that if the resulting HashMap is equal to `this`, then the HashMap object
   * instance is returned unchanged.
   */
  intersection(
    other: HashMap<K, V>,
    merge?: (vThis: V, vOther: V, k: K) => V
  ): HashMap<K, V> {
    const [newRoot, size] = intersection(
      this.cfg,
      merge ?? ((_, s) => s),
      this.root,
      other.root
    );
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashMap(this.cfg, newRoot, size);
    }
  }

  /** Returns a new HashMap which contains only entries whose keys are in all HashMaps
   *
   * @category Bulk Modification
   *
   * @remarks
   * `HashMap.intersection` is a static version of {@link HashMap#intersection}, and produces a new HashMap
   * which contains the entries which have keys in all specified HashMaps.  For each such entry, the merge
   * function is used to determine the resulting value.
   *
   * `intersection` guarantees that if the resulting HashMap is equal to the first non-empty HashMap, then the HashMap object
   * instance is returned unchanged.
   */
  public static intersection<K extends HashKey, V extends NotUndefined>(
    merge: (v1: V, v2: V, k: K) => V,
    ...maps: readonly HashMap<K, V>[]
  ): HashMap<K, V> {
    if (maps.length === 0) {
      return HashMap.empty();
    } else {
      let root = maps[0].root;
      let newSize = 0;
      for (let i = 1; i < maps.length; i++) {
        const m = maps[i];
        const [r, intersectionSize] = intersection(m.cfg, merge, root, m.root);
        root = r;
        newSize += intersectionSize;
      }
      if (root === maps[0].root) {
        return maps[0];
      } else {
        return new HashMap(maps[0].cfg, root, newSize);
      }
    }
  }

  /** Returns a new HashMap which contains only keys which do not appear in the provided HashMap
   *
   * @category Bulk Modification
   *
   * @remarks
   * `difference` produces a new HashMap which contains all the entries in `this` where the key does
   * **not** exist in the provided `other` HashMap.  Can think of this as `this - other` where the subtraction
   * is removing all the keys in `other` from `this`.  The values of the `other` HashMap are ignored and
   * can be any value `V2`.
   *
   * `difference` guarantees that if no entries are removed from `this`, then the HashMap object
   * instance is returned unchanged.
   */
  difference<V2>(other: HashMap<K, V2>): HashMap<K, V> {
    const [newRoot, numRemoved] = difference(this.cfg, this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashMap(this.cfg, newRoot, this.size - numRemoved);
    }
  }

  /** Returns a new HashMap which contains only keys which do not appear in the provided HashSet
   *
   * @category Bulk Modification
   *
   * @remarks
   * `withoutKeys` produces a new HashMap which contains all the entries in `this` where the key does
   * **not** exist in the provided `keys` HashSet. `withoutKeys` guarantees that if no entries are
   * removed from `this`, then the HashMap object instance is returned unchanged.
   */
  withoutKeys(keys: HashSet<K>): HashMap<K, V> {
    const [newRoot, numRemoved] = difference(
      this.cfg,
      this.root,
      (keys as unknown as { root: HamtNode<K, unknown> }).root
    );
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashMap(this.cfg, newRoot, this.size - numRemoved);
    }
  }

  /** Return a new HashMap which adjusts all the provided keys with a specified modification function.
   *
   * @category Bulk Modification
   *
   * @remarks
   * `adjust` is passed a HashMap of keys to adjust associated to helper values of type `V2` (the type `V2` can be
   * anything and does not need to be related `V`).  For each key to modify, `adjust` then calls the `adjustVal` function with the current existing
   * value in the HashMap (or `undefined` if the key does not exist) and the helper value associated with the key.
   * The return value is set as the new value for the key, or removed if the return value is `undefined`.
   *
   * `adjust` is equivalent to the following code, but is much more efficient since `adjust` can perform the operation
   * in a single pass through the tree.
   *
   * ```ts
   * const m = this;
   * for (const [k, v2] of keysToAdjust) {
   *   const v = m.get(k);
   *   const newV = adjustVal(v, v2, k);
   *   if (newV === undefined) {
   *     m = m.delete(k);
   *   } else {
   *     m = m.set(k, newV);
   *   }
   * }
   * return m;
   * ```
   *
   * If the keys to adjust are only available in an array or some other data structure,
   * it is still very fast to use {@link HashMap.from} or {@link HashMap.build} to create the `keysToAdjust` map and
   * then pass it to `adjust`.  `adjust` is very efficient because it can overlap the structure of the two trees and
   * perform the merge in a single pass through both trees.
   */
  adjust<V2>(
    keysToAdjust: HashMap<K, V2>,
    adjustVal: (existingVal: V | undefined, helperVal: V2, k: K) => V | undefined
  ): HashMap<K, V> {
    const [newRoot, numRemoved] = adjust(
      this.cfg,
      adjustVal,
      this.root,
      keysToAdjust.root
    );
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashMap(this.cfg, newRoot, this.size - numRemoved);
    }
  }

  private cfg: HashConfig<K>;
  private root: HamtNode<K, V> | null;

  private constructor(cfg: HashConfig<K>, root: HamtNode<K, V> | null, size: number) {
    this.cfg = cfg;
    this.root = root;
    this.size = size;
  }
}
Object.defineProperty(HashMap.prototype, "@@__IMMUTABLE_KEYED__@@", { value: true });
