/* Copyright John Lenz, BSD license, see LICENSE file for details */

import {
  ComparisonConfig,
  mkComparisonConfig,
  OrderedMapKey,
} from "../data-structures/comparison.js";
import {
  alter,
  build,
  collectValues,
  difference,
  foldl,
  foldr,
  intersection,
  isDisjoint,
  isKeySubset,
  iterateAsc,
  iterateDesc,
  lookup,
  lookupMax,
  lookupMin,
  maxView,
  minView,
  partition,
  split,
  symmetricDifference,
  TreeNode,
  union,
} from "../data-structures/tree.js";
import { LazySeq } from "../lazyseq.js";
import type { OrderedMap } from "./orderedmap.js";

function constTrue() {
  return true;
}

function constUndefined() {
  return undefined;
}

/**
 * Immutable Ordered Set
 *
 * @remarks
 * The `OrderedSet<T>` class stores numbers, strings, booleans, dates, or custom objects which implement the
 * {@link ./classes#ComparableObj} interface.
 *
 * The OrderedSet is immutable, which means that no changes or mutations are allowed directly to the OrderedSet.
 * Instead, modification operations such as {@link OrderedSet.add} return a new OrderedSet which contains the
 * result of the modification.  The original OrderedSet is unchanged and can continue to be accessed and used.
 * The OrderedSet implements this efficiently using structural sharing and does not require a full copy; indeed,
 * the {@link OrderedSet.delete} method will copy at most `O(log n)` entries.
 */
export class OrderedSet<T extends OrderedMapKey> {
  /** Static method to create a new empty OrderedSet
   *
   * @category Creating Ordered Sets
   *
   * @remarks
   * The key type must extend {@link ./classes#OrderedMapKey}, which consists of strings, numbers, dates, booleans, or a custom
   * user-defined object which implements the {@link ./classes#ComparableObj} interface.
   *
   * While you can start with an empty `OrderedSet` and then use {@link OrderedSet.add} to add entries, it
   * is more efficient to create the OrderedSet in bulk using either the static {@link OrderedSet.from} or {@link OrderedSet.build}
   * or using various methods on {@link ./lazyseq#LazySeq} to convert a `LazySeq` to an `OrderedSet`.
   */
  public static empty<T extends OrderedMapKey>(): OrderedSet<T> {
    return new OrderedSet(mkComparisonConfig(), null);
  }

  /** Static method to produce an OrderedSet of the keys in an OrderedMap
   *
   * @category Creating Ordered Sets
   *
   * @remarks
   * Creates an OrderedSet consisting of all the keys in the given {@link ./orderedmap#OrderedMap}.
   * This function is O(1) and very fast because the backing data structure is reused.
   */
  public static ofKeys<K extends OrderedMapKey, V>(map: OrderedMap<K, V>): OrderedSet<K> {
    // access private properties of OrderedMap
    const prvMap = map as unknown as {
      cfg: ComparisonConfig<K>;
      root: TreeNode<K, V> | null;
    };
    return new OrderedSet(prvMap.cfg, prvMap.root);
  }

  /** Efficiently create a new OrderedSet from a collection of items
   *
   * @category Creating Ordered Sets
   *
   * @remarks
   * Runs in time O(n log n)
   */
  public static from<T extends OrderedMapKey>(items: Iterable<T>): OrderedSet<T> {
    const cfg = mkComparisonConfig();
    return new OrderedSet(
      cfg,
      build(cfg, items, (x) => x, constTrue),
    );
  }

  /** Efficiently create a new set from a collection of values and an item extraction function
   *
   * @category Creating Ordered Sets
   *
   * @remarks
   * `build` efficiently creates a new OrderedSet by applying the given function to each thing in the
   * `things` collection.
   *
   * Runs in time O(n log n)
   */
  public static build<T extends OrderedMapKey, R>(
    things: Iterable<R>,
    item: (v: R) => T,
  ): OrderedSet<T> {
    const cfg = mkComparisonConfig();
    return new OrderedSet(cfg, build(cfg, things, item, constTrue));
  }

  /** size is a readonly property containing the number of items in the set.
   *
   * @category IReadOnlySet interface
   */
  get size(): number {
    return this.root === null ? 0 : this.root.size;
  }

  /** Returns true if the item is in the set
   *
   * @category IReadOnlySet interface
   *
   * @remarks
   * Runs in time O(log n)
   */
  has(t: T): boolean {
    if (this.root === null) return false;
    return lookup(this.cfg, t, this.root) !== undefined;
  }

  /** Iterates the items in the set
   *
   * @category IReadOnlySet interface
   *
   * @remarks
   * This is the default iteration when using `for .. of` directly on the `OrderedSet`.  It iterates
   * all the items in ascending order.
   */
  [Symbol.iterator](): SetIterator<T> {
    return iterateAsc((k) => k, this.root);
  }

  /** Iterates the items in the OrderedSet
   *
   * @category IReadOnlySet interface
   *
   * @remarks
   * This provides an iterator to iterate all the items in the OrderedSet.  Each item is iterated as a length-2 array with the item appearing
   * twice.  (This matches the builtin [Set.entries](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/entries)
   * method.)  The items are iterated in ascending order.
   */
  entries(): SetIterator<[T, T]> {
    return iterateAsc((t) => [t, t], this.root);
  }

  /** Iterates the items in the set
   *
   * @category IReadOnlySet interface
   *
   * @remarks
   * This provides an iterator to iterate all the items in the OrderedSet. Items
   * are iterated in ascending order. Both `keys` and `values` are equivalent for an OrderedSet.
   */
  keys(): SetIterator<T> {
    return iterateAsc((t) => t, this.root);
  }

  /** Iterates the items in the set
   *
   * @category IReadOnlySet interface
   *
   * @remarks
   * This provides an iterator to iterate all the items in the OrderedSet. Items
   * are iterated in ascending order. Both `keys` and `values` are equivalent for an OrderedSet.
   */
  values(): SetIterator<T> {
    return iterateAsc((t) => t, this.root);
  }

  /** Applys a function to each item in the OrderedSet
   *
   * @category IReadOnlySet interface
   *
   * @remarks
   * This applies the function `f` to each item in the set.  The item is provided twice (so as to match the builtin
   * [Set.forEach](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/forEach) method).
   * The items are iterated in ascending order.
   */
  forEach(f: (val: T, val2: T, set: OrderedSet<T>) => void): void {
    foldl(
      (_acc, t) => {
        f(t, t, this);
        return undefined;
      },
      undefined,
      this.root,
    );
  }

  /** Reduce all the entries in the OrderedSet to a single value
   *
   * @category Iteration
   *
   * @remarks
   * The letter-l in `foldl` stands for left.  Thinking of all the items as an ascending list, `foldl` starts
   * combining items from the left side.  Thus, the smallest item is combined with the zero value,
   * which is then combined with the next smallest item, and so on.
   */
  foldl<R>(f: (acc: R, t: T) => R, zero: R): R {
    return foldl((acc, v) => f(acc, v), zero, this.root);
  }

  /** Reduce all the entries in the OrderedSet to a single value
   *
   * @category Iteration
   *
   * @remarks
   * The letter-r in `foldr` stands for right.  Thinking of all the items as an ascending list, `foldr` starts
   * combining items from the right side.  Thus, the largest item is combined with the zero value,
   * which is then combined with the second-to-largest item, and so on.
   */
  foldr<R>(f: (t: T, acc: R) => R, zero: R): R {
    return foldr((t, _, acc) => f(t, acc), zero, this.root);
  }

  /** Creates a LazySeq which iterates all the items in the OrderedSet in ascending order
   *
   * @category Iteration
   */
  toAscLazySeq(): LazySeq<T> {
    const root = this.root;
    return LazySeq.ofIterator(() => iterateAsc((k) => k, root));
  }

  /** Creates a LazySeq which iterates all the items in the OrderedSet in descending order
   *
   * @category Iteration
   */
  toDescLazySeq(): LazySeq<T> {
    const root = this.root;
    return LazySeq.ofIterator(() => iterateDesc((k) => k, root));
  }

  /** Return a new OrderedSet with the given item added
   *
   * @category Add and Delete
   *
   * @remarks
   * If the item already exists, then the OrderedSet object instance is returned unchanged.
   * Runs in time O(log n)
   */
  add(t: T): OrderedSet<T> {
    const newRoot = alter(this.cfg, t, constTrue, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedSet(this.cfg, newRoot);
    }
  }

  /** Return a new OrderedSet with the given item removed
   *
   * @category Add and Delete
   *
   * @remarks
   * If the item does not exist, then the OrderedSet object instance is returned unchanged.
   * Runs in time O(log n)
   */
  delete(t: T): OrderedSet<T> {
    const newRoot = alter(this.cfg, t, constUndefined, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedSet(this.cfg, newRoot);
    }
  }

  /** Split an OrderedSet into two OrderedSets based on a function
   *
   * @category Transformation
   *
   * @remarks
   * The function `f` is applied to each item.  The entries for which `f` returns `true`
   * are placed in one OrderedSet and entries for which `f` returns false are placed in the other.
   * The two sets are returned as a tuple, with the `true` set returned as the first
   * element of the tuple.
   *
   * If the function `f` returns `true` for all entries, then the first OrderedSet object instance
   * is guaranteed to be === to the `this` object instance.  Similar for if `f` returns `false` for
   * all entries.
   *
   * This runs in O(n) time.
   */
  partition(f: (t: T) => boolean): [OrderedSet<T>, OrderedSet<T>] {
    const [trueRoot, falseRoot] = partition(f, this.root);
    if (trueRoot === this.root) {
      return [this, new OrderedSet(this.cfg, null)];
    } else if (falseRoot === this.root) {
      return [new OrderedSet(this.cfg, null), this];
    } else {
      return [new OrderedSet(this.cfg, trueRoot), new OrderedSet(this.cfg, falseRoot)];
    }
  }

  /** Remove entries from the set that return false from a predicate
   *
   * @category Transformation
   *
   * @remarks
   * `filter` applies the function `f` to each value and key in the OrderedSet.  If `f` returns false, the
   * key is removed.
   * `filter` guarantees that if no values are removed, then the OrderedSet object instance is returned
   * unchanged.
   *
   * This runs in O(n) time.
   */
  filter(f: (t: T) => boolean): OrderedSet<T> {
    const root = collectValues((_, t) => (f(t) ? true : undefined), false, this.root);
    if (root === this.root) {
      return this;
    } else {
      return new OrderedSet(this.cfg, root);
    }
  }

  /** Split an OrderedSet into the items below and above a given item
   *
   * @category Transformation
   *
   * @remarks
   * `split` returns an object with three properties.  `below` is an OrderedSet with all the items
   * which are less than the provided item `t`.  `present` is a boolean which specifies if the item `t`
   * exists in the set or not.
   * Finally, the `above` property consists of all the items in the OrderedSet which are greater than `t`.
   *
   * This runs in time O(log n)
   */
  split(t: T): {
    readonly below: OrderedSet<T>;
    readonly present: boolean;
    readonly above: OrderedSet<T>;
  } {
    const s = split(this.cfg, t, this.root);
    return {
      below: new OrderedSet(this.cfg, s.below),
      present: s.val !== undefined,
      above: new OrderedSet(this.cfg, s.above),
    };
  }

  /** Apply a function to the OrderedSet
   *
   * @category Transformation
   *
   * @remarks
   * Applies the provided function `f` to `this` and returns the result.  This is a convenience function
   * which allows you to continue to chain operations without having to create a new
   * temporary variable.
   */
  transform<U>(f: (s: OrderedSet<T>) => U): U {
    return f(this);
  }

  /** Find the minimum item in the set
   *
   * @category Min/Max Items
   *
   * @remarks
   * In O(log n) time, find the minimum item.  Returns undefined if the OrderedSet is empty.
   */
  lookupMin(): T | undefined {
    if (this.root === null) return undefined;
    return lookupMin(this.root)[0];
  }

  /** Find the maximum item in the set
   *
   * @category Min/Max Items
   *
   * @remarks
   * In O(log n) time, find the maximum item.  Returns undefined if the OrderedSet is empty.
   */
  lookupMax(): T | undefined {
    if (this.root === null) return undefined;
    return lookupMax(this.root)[0];
  }

  /** Removes the minimum item in the set
   *
   * @category Min/Max Items
   *
   * @remarks
   * In O(log n) time, return a new OrderedSet with the the minimum item removed.
   */
  deleteMin(): OrderedSet<T> {
    if (this.root === null) return this;
    const m = minView(this.root);
    return new OrderedSet(this.cfg, m.rest);
  }

  /** Removes the maximum item in the set
   *
   * @category Min/Max Items
   *
   * @remarks
   * In O(log n) time, return a new OrderedSet with the the maximum item removed.
   */
  deleteMax(): OrderedSet<T> {
    if (this.root === null) return this;
    const m = maxView(this.root);
    return new OrderedSet(this.cfg, m.rest);
  }

  /** Lookup and remove the minimum item
   *
   * @category Min/Max Items
   *
   * @remarks
   * In O(log n) time, find and remove the minimum item.  The minimum item
   * and the result of removing the minimum item are returned.  If the original OrderedSet is empty,
   * undefined is returned.
   */
  minView(): { readonly min: T; readonly rest: OrderedSet<T> } | undefined {
    if (this.root === null) {
      return undefined;
    } else {
      const m = minView(this.root);
      return { min: m.k, rest: new OrderedSet(this.cfg, m.rest) };
    }
  }

  /** Lookup and remove the maximum item
   *
   * @category Min/Max Items
   *
   * @remarks
   * In O(log n) time, find and remove the maximum item.  The maximum item
   * and the result of removing the maximum item are returned.  If the original OrderedSet is empty,
   * undefined is returned.
   */
  maxView(): { readonly max: T; readonly rest: OrderedSet<T> } | undefined {
    if (this.root === null) {
      return undefined;
    } else {
      const m = maxView(this.root);
      return { max: m.k, rest: new OrderedSet(this.cfg, m.rest) };
    }
  }

  /** Returns a new set which combines all entries in two sets
   *
   * @category Set Operations
   *
   * @remarks
   * `union` produces a new OrderedSet which contains all the items in both OrderedSets.
   * `union` guarantees that if the resulting OrderedSet is equal to `this`, then the OrderedSet object
   * instance is returned unchanged.
   *
   * Runs in time O(m log(n/m)) where m is the size of the smaller set and n is the size of the larger set.
   */
  union(other: OrderedSet<T>): OrderedSet<T> {
    const newRoot = union(this.cfg, constTrue, this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedSet(this.cfg, newRoot);
    }
  }

  /** Create a new OrderedSet which combines all entries in a sequence of OrderedSets
   *
   * @category Set Operations
   *
   * @remarks
   * `OrderedSet.union` is the static version of {@link OrderedSet.union} and allows unioning more than two sets
   * at once.  It produces a new OrderedSet which contains all the entries in all the OrderedSets.
   *
   * `union` guarantees that if the resulting OrderedSet is equal to the first non-empty OrderedSet in the sequence,
   * then the OrderedSet object instance is returned unchanged.
   */
  public static union<T extends OrderedMapKey>(
    ...sets: readonly OrderedSet<T>[]
  ): OrderedSet<T> {
    const nonEmpty = sets.filter((s) => s.size > 0);
    if (nonEmpty.length === 0) {
      return OrderedSet.empty();
    } else {
      let root = nonEmpty[0].root;
      for (let i = 1; i < nonEmpty.length; i++) {
        const m = nonEmpty[i];
        root = union(m.cfg, constTrue, root, m.root);
      }
      if (root === nonEmpty[0].root) {
        return nonEmpty[0];
      } else {
        return new OrderedSet(nonEmpty[0].cfg, root);
      }
    }
  }

  /** Returns a new set which contains only items which appear in both sets
   *
   * @category Set Operations
   *
   * @remarks
   * `intersection` produces a new OrderedSet which contains all the items which appear in both OrderedSets.
   * `intersection` guarantees that if the resulting OrderedSet is equal to `this`, then the OrderedSet object
   * instance is returned unchanged.
   *
   * Runs in time O(m log(n/m)) where m is the size of the smaller set and n is the size of the larger set.
   */
  intersection(other: OrderedSet<T>): OrderedSet<T> {
    const newRoot = intersection(this.cfg, constTrue, this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedSet(this.cfg, newRoot);
    }
  }

  /** Returns a new set which contains only items who appear in all sets
   *
   * @category Set Operations
   *
   * @remarks
   * `OrderedSet.intersection` is a static version of {@link OrderedSet.intersection}, and produces a new OrderedSet
   * which contains the items which appear in all specified OrderedSet.
   *
   * `intersection` guarantees that if the resulting OrderedSet is equal to the first OrderedSet, then the OrderedSet object
   * instance is returned unchanged.
   */
  public static intersection<T extends OrderedMapKey>(
    ...sets: readonly OrderedSet<T>[]
  ): OrderedSet<T> {
    if (sets.length === 0) {
      return OrderedSet.empty();
    } else {
      let root = sets[0].root;
      for (let i = 1; i < sets.length; i++) {
        const m = sets[i];
        root = intersection(m.cfg, constTrue, root, m.root);
      }
      if (root === sets[0].root) {
        return sets[0];
      } else {
        return new OrderedSet(sets[0].cfg, root);
      }
    }
  }

  /** Returns a new set which contains items which appear this but NOT in the provided set
   *
   * @category Set Operations
   *
   * @remarks
   * `difference` produces a new OrderedSet which contains all the items which appear in `this` OrderedSet,
   * except all the items from the `other` OrderedSet are removed.  `difference` can be thought of as subtracting: `this - other`.
   * `difference` guarantees that if the resulting OrderedSet is equal to `this`, then the OrderedSet object
   * instance is returned unchanged.
   *
   * Runs in time O(m log(n/m)) where m is the size of the smaller set and n is the size of the larger set.
   */
  difference(other: OrderedSet<T>): OrderedSet<T> {
    const newRoot = difference(this.cfg, this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedSet(this.cfg, newRoot);
    }
  }

  /** Returns an OrderedSet which contains only items which appear in exactly one of the two sets
   *
   * @category Set Operations
   *
   * @remarks
   * symmetricDifference produces a new set which contains all the items
   * appear in exactly one of this and other. If this or other are empty, the non-empty
   * set is returned unchanged.
   *
   * Runs in time O(m log(n/m)) where m is the size of the smaller set and n is the size of the larger set.
   */
  symmetricDifference(other: OrderedSet<T>): OrderedSet<T> {
    const newRoot = symmetricDifference(this.cfg, this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedSet(this.cfg, newRoot);
    }
  }

  /** Returns true if each item of this exists in largerSet
   *
   * @category Set Operations
   *
   * @remarks
   * isSubsetOf checks if this is a subset of largerSet, that is, if every item in this is also in largerSet.
   *
   * Runs in time O(m log(n/m)) where m is the size of this and n is the size of largerSet.
   */
  isSubsetOf(largerSet: OrderedSet<T>): boolean {
    return isKeySubset(this.cfg, this.root, largerSet.root);
  }

  /** Returns true if each item of smallerSet exists in this
   *
   * @category Set Operations
   *
   * @remarks
   * isSupersetOf checks if this is a superset of smallerSet, that is, if every item in
   * smallerSet also exists in this.
   *
   * Runs in time O(m log(n/m)) where m is the size of smallerSet and n is the size of this.
   */
  isSupersetOf(smallerSet: OrderedSet<T>): boolean {
    return isKeySubset(this.cfg, smallerSet.root, this.root);
  }

  /** Returns true if each item exists in exactly one of the two sets
   *
   * @category Set Operations
   *
   * @remarks
   * isDisjointFrom checks if this is disjoint from other, that is,
   * the intersection is empty.
   *
   * Runs in time O(m log(n/m)) where m is the size of this and n is the size of other.
   */
  isDisjointFrom(other: OrderedSet<T>): boolean {
    return isDisjoint(this.cfg, this.root, other.root);
  }

  private cfg: ComparisonConfig<T>;
  private root: TreeNode<T, unknown> | null;

  private constructor(cfg: ComparisonConfig<T>, root: TreeNode<T, unknown> | null) {
    this.cfg = cfg;
    this.root = root;
  }
}

Object.defineProperty(OrderedSet.prototype, "@@__IMMUTABLE_KEYED__@@", { value: true });
