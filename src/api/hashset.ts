/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { HashConfig, HashKey } from "../data-structures/hashing.js";
import { LazySeq } from "../lazyseq.js";
import { mkHashConfig } from "../data-structures/hashing.js";
import {
  collectValues,
  difference,
  fold,
  Node,
  insert,
  intersection,
  iterate,
  lookup,
  MutableNode,
  mutateInsert,
  remove,
  union,
  adjust,
} from "../data-structures/hamt.js";
import type { HashMap } from "./hashmap.js";

function constTrue() {
  return true;
}

/**
 * Immutable Hash Set
 *
 * @remarks
 * The `HashSet<T>` class stores numbers, strings, booleans, dates, or custom objects which implement the
 * {@link ./classes#HashableObj} and {@link ./classes#ComparableObj} interface.
 *
 * The HashSet is immutable, which means that no changes or mutations are allowed directly to the HashSet.
 * Instead, modification operations such as {@link HashSet.delete} return a new HashSet which contains the
 * result of the modification.  The original HashSet is unchanged and can continue to be accessed and used.
 * The HashSet implements this efficiently using structural sharing and does not require a full copy.
 */
export class HashSet<T extends HashKey> {
  /** Static method to create a new empty HashSet
   *
   * @category Creating Hash Sets
   *
   * @remarks
   * The item type must extend {@link ./classes#HashKey}, which consists of strings, numbers, dates, booleans, or a custom
   * user-defined object which implement the {@link ./classes#HashableObj} and {@link ./classes#ComparableObj} interfaces.
   * These interfaces allows you to create complex keys which are made up of multiple properties.
   *
   * While you can start with an empty `HashSet` and then use {@link HashSet.add} to add entries, it
   * is more efficient to create the HashSet in bulk using either the static {@link HashSet.from} or {@link HashSet.build}
   * or using various methods on {@link ./lazyseq#LazySeq} to convert a `LazySeq` to a `HashSet`.
   */
  public static empty<T extends HashKey>(): HashSet<T> {
    return new HashSet(mkHashConfig(), null, 0);
  }

  /** Static method to produce a HashSet of the keys in a HashMap
   *
   * @category Creating Hash Sets
   *
   * @remarks
   * Creates a HashSet consisting of all the keys in the given {@link ./hashmap#HashMap}.
   * This function is O(1) and very fast because the backing data structure is reused.
   */
  public static ofKeys<K extends HashKey, V>(map: HashMap<K, V>): HashSet<K> {
    // access private properties of HashMap
    const prvMap = map as unknown as {
      cfg: HashConfig<K>;
      root: Node<K, V> | null;
      size: number;
    };
    return new HashSet(prvMap.cfg, prvMap.root, prvMap.size);
  }

  /** Efficiently create a new HashSet from a collection of items
   *
   * @category Creating Hash Sets
   */
  public static from<T extends HashKey>(items: Iterable<T>): HashSet<T> {
    let root: MutableNode<T, boolean> | null = null;
    let size = 0;
    const cfg = mkHashConfig();

    function val(old: boolean | undefined) {
      if (old === undefined) {
        size++;
      }
      return true;
    }

    for (const t of items) {
      root = mutateInsert(cfg, t, undefined, val, root);
    }
    return new HashSet(cfg, root, size);
  }

  /** Efficiently create a new HashSet from a collection of items and a key extraction function
   *
   * @category Creating Hash Sets
   *
   * @remarks
   * `build` efficiently creates a new HashSet by applying the given function to each item in the collection.
   */
  public static build<T extends HashKey, R>(
    items: Iterable<R>,
    key: (v: R) => T,
  ): HashSet<T> {
    let root: MutableNode<T, boolean> | null = null;
    let size = 0;
    const cfg = mkHashConfig();

    function val(old: boolean | undefined) {
      if (old === undefined) {
        size++;
      }
      return true;
    }

    for (const t of items) {
      root = mutateInsert(cfg, key(t), undefined, val, root);
    }

    return new HashSet(cfg, root, size);
  }

  /** size is a readonly property containing the number of entries in the HashSet.
   *
   * @category IReadOnlySet interface
   */
  readonly size: number;

  /** Returns true if the item is in the HashSet
   *
   * @category IReadOnlySet interface
   */
  has(t: T): boolean {
    if (this.root === null) return false;
    return lookup(this.cfg, t, this.root) !== undefined;
  }

  /** Iterates the items in the HashSet
   *
   * @category IReadOnlySet interface
   *
   * @remarks
   * This is the default iteration when using `for .. of` directly on the `HashSet`.  It iterates
   * all the items, but the order of iteration is an implementation detail and cannot be relied upon.
   */
  [Symbol.iterator](): SetIterator<T> {
    return iterate((t) => t, this.root);
  }

  /** Iterates the items in the HashSet
   *
   * @category IReadOnlySet interface
   *
   * @remarks
   * This provides an iterator to iterate all the items in the HashSet.  Each item is iterated as a length-2 array with the item appearing
   * twice.  (This matches the builtin [Set.entries](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/entries)
   * method.)  The order of iteration is an implementation detail and cannot be relied upon.
   */
  entries(): SetIterator<[T, T]> {
    return iterate((t) => [t, t], this.root);
  }

  /** Iterates the items in the HashSet
   *
   * @category IReadOnlySet interface
   *
   * @remarks
   * This provides an iterator to iterate all the items in the HashSet.  The order of iteration is an implementation detail and cannot be relied upon.
   * Both `keys` and `values` are equivalent for a `HashSet`.
   */
  keys(): SetIterator<T> {
    return iterate((t) => t, this.root);
  }

  /** Iterates the items in the HashSet
   *
   * @category IReadOnlySet interface
   *
   * @remarks
   * This provides an iterator to iterate all the items in the HashSet.  The order of iteration is an implementation detail and cannot be relied upon.
   * Both `keys` and `values` are equivalent for a `HashSet`.
   */
  values(): SetIterator<T> {
    return iterate((t) => t, this.root);
  }

  /** Applys a function to each item in the HashSet
   *
   * @category IReadOnlySet interface
   *
   * @remarks
   * This applies the function `f` to each item in the hashmap.  The item is provided twice (so as to match the builtin
   * [Set.forEach](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/forEach) method).
   * The order of iteration implementation detail and cannot be relied upon.
   */
  forEach(f: (val: T, val2: T, set: HashSet<T>) => void): void {
    fold(
      (_acc, t) => {
        f(t, t, this);
        return undefined;
      },
      undefined,
      this.root,
    );
  }

  /** Reduce all the items in the HashSet to a single value
   *
   * @category Iteration
   */
  fold<R>(f: (acc: R, val: T) => R, zero: R): R {
    return fold((acc, v) => f(acc, v), zero, this.root);
  }

  /** Creates a LazySeq which iterates all the items in the HashSet
   *
   * @category Iteration
   */
  toLazySeq(): LazySeq<T> {
    const root = this.root;
    return LazySeq.ofIterator(() => iterate((k) => k, root));
  }

  /** Return a new HashSet with the given item added
   *
   * @category Add and Delete
   *
   * @remarks
   * If the item already exists, then the HashSet object instance is returned unchanged.
   */
  add(t: T): HashSet<T> {
    const [newRoot, inserted] = insert(this.cfg, t, constTrue, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashSet(this.cfg, newRoot, this.size + (inserted ? 1 : 0));
    }
  }

  /** Return a new HashSet with the given item removed
   *
   * @category Add and Delete
   *
   * @remarks
   * If the item does not exist, then the HashSet object instance is returned unchanged.
   */
  delete(t: T): HashSet<T> {
    const newRoot = remove(this.cfg, t, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashSet(this.cfg, newRoot, this.size - 1);
    }
  }

  /** Returns a new HashSet which combines all entries in two HashSets
   *
   * @category Set Operations
   *
   * @remarks
   * `union` produces a new HashSet which contains all the items in both HashSets.
   * `union` guarantees that if the resulting HashSet is equal to `this`, then the HashSet object
   * instance is returned unchanged.
   */
  union(other: HashSet<T>): HashSet<T> {
    const [newRoot, intersectionSize] = union(this.cfg, constTrue, this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashSet(this.cfg, newRoot, this.size + other.size - intersectionSize);
    }
  }

  /** Create a new HashSet which combines all entries in a sequence of HashSets
   *
   * @category Set Operations
   *
   * @remarks
   * `HashSet.union` is the static version of {@link HashSet.union} and allows unioning more than two HashSets
   * at once.  It produces a new HashSet which contains all the entries in all the HashSets.
   * `union` guarantees that if the resulting HashSet is equal to the first non-empty HashSet in the sequence,
   * then the HashSet object instance is returned unchanged.
   */
  public static union<T extends HashKey>(...sets: readonly HashSet<T>[]): HashSet<T> {
    const nonEmpty = sets.filter((s) => s.size > 0);
    if (nonEmpty.length === 0) {
      return HashSet.empty();
    } else {
      let root = nonEmpty[0].root;
      let newSize = nonEmpty[0].size;
      for (let i = 1; i < nonEmpty.length; i++) {
        const m = nonEmpty[i];
        const [r, intersectionSize] = union(m.cfg, constTrue, root, m.root);
        root = r;
        newSize += m.size - intersectionSize;
      }
      if (root === nonEmpty[0].root) {
        return nonEmpty[0];
      } else {
        return new HashSet(nonEmpty[0].cfg, root, newSize);
      }
    }
  }

  /** Return a new HashSet which adds the entries.
   *
   * @category Set Operations
   *
   * @remarks
   * `append` is just a shorthand for a combination of {@link HashSet.from} and {@link HashSet.union}.  `union`
   * is very efficient at combining data structures, so the fastest way to bulk-add entries is to first create
   * a data structure of the entries to add and then union them into the existing data structure.  Thus, if you
   * already have a HashSet, HashMap, or {@link HashSet.build} is more ergonomic, you should just directly use {@link HashSet.union}.
   */
  append(items: Iterable<T>): HashSet<T> {
    return this.union(HashSet.from(items));
  }

  /** Returns a new HashSet which contains only items which appear in both HashSets
   *
   * @category Set Operations
   *
   * @remarks
   * `intersection` produces a new HashSet which contains all the items which appear in both HashSets.
   * `intersection` guarantees that if the resulting HashSet is equal to `this`, then the HashSet object
   * instance is returned unchanged.
   */
  intersection(other: HashSet<T>): HashSet<T> {
    const [newRoot, intersectionSize] = intersection(
      this.cfg,
      constTrue,
      this.root,
      other.root,
    );
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashSet(this.cfg, newRoot, intersectionSize);
    }
  }

  /** Returns a new HashSet which contains only items who appear in all HashSets
   *
   * @category Set Operations
   *
   * @remarks
   * `HashSet.intersection` is a static version of {@link HashSet.intersection}, and produces a new HashSet
   * which contains the items which appear in all specified HashSets.
   * `intersection` guarantees that if the resulting HashSet is equal to the first HashSet, then the HashSet object
   * instance is returned unchanged.
   */
  public static intersection<T extends HashKey>(
    ...sets: readonly HashSet<T>[]
  ): HashSet<T> {
    if (sets.length === 0) {
      return HashSet.empty();
    } else {
      let root = sets[0].root;
      let newSize = 0;
      for (let i = 1; i < sets.length; i++) {
        const m = sets[i];
        const [r, intersectionSize] = intersection(m.cfg, constTrue, root, m.root);
        root = r;
        newSize += intersectionSize;
      }
      if (root === sets[0].root) {
        return sets[0];
      } else {
        return new HashSet(sets[0].cfg, root, newSize);
      }
    }
  }

  /** Returns a new HashSet which contains items which appear in this HashMap but NOT in the provided HashSet
   *
   * @category Set Operations
   *
   * @remarks
   * `difference` produces a new HashSet which contains all the items which appear in `this` HashSet,
   * except all the items from the `other` HashSet are removed.  `difference` can be thought of as subtracting: `this - other`.
   * `difference` guarantees that if the resulting HashSet is equal to `this`, then the HashSet object
   * instance is returned unchanged.
   */
  difference(other: HashSet<T>): HashSet<T> {
    const [newRoot, numRemoved] = difference(this.cfg, this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashSet(this.cfg, newRoot, this.size - numRemoved);
    }
  }

  /** Returns a HashSet which contains only items which appear in exactly one of the two sets
   *
   * @category Set Operations
   *
   * @remarks
   * symmetricDifference produces a new set which contains all the items
   * appear in exactly one of this and other. If this or other are empty, the non-empty
   * set is returned unchanged.
   */
  symmetricDifference(other: HashSet<T>): HashSet<T> {
    const [newRoot, numRemoved] = adjust(
      this.cfg,
      (old) => (old === undefined ? true : undefined),
      this.root,
      other.root,
    );
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashSet(this.cfg, newRoot, this.size - numRemoved);
    }
  }

  /** Remove items from the HashSet that return false from a predicate
   *
   * @category Transformation
   *
   * @remarks
   * `filter` applies the function `f` to each item in the HashMap.  If `f` returns false, the
   * item is removed. `filter` guarantees that if no values are removed, then the HashSet object instance is returned
   * unchanged.
   */
  filter(f: (k: T) => boolean): HashSet<T> {
    const [newRoot, newSize] = collectValues(
      (v, k) => (f(k) ? v : undefined),
      false,
      this.root,
    );
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashSet(this.cfg, newRoot, newSize);
    }
  }

  /** Apply a function to the HashSet
   *
   * @category Transformation
   *
   * @remarks
   * Applies the provided function `f` to `this` and returns the result.  This is a convenience function
   * which allows you to continue to chain operations without having to create a new
   * temporary variable.
   */
  transform<U>(f: (s: HashSet<T>) => U): U {
    return f(this);
  }

  /** Returns true if each item of this exists in largerSet
   *
   * @category Set Operations
   *
   * @remarks
   * isSubsetOf checks if this is a subset of largerSet, that is, if every item in this is also in largerSet.
   */
  isSubsetOf(largerSet: HashSet<T>): boolean {
    if (this.size > largerSet.size) return false;
    for (const k of this) {
      if (!largerSet.has(k)) return false;
    }
    return true;
  }

  /** Returns true if each item of smallerSet exists in this
   *
   * @category Set Operations
   *
   * @remarks
   * isSupersetOf checks if this is a superset of smallerSet, that is, if every item in
   * smallerSet also exists in this.
   */
  isSupersetOf(smallerSet: HashSet<T>): boolean {
    return smallerSet.isSubsetOf(this);
  }

  /** Returns true if each item exists in exactly one of the two sets
   *
   * @category Set Operations
   *
   * @remarks
   * isDisjointFrom checks if this is disjoint from other, that is,
   * the intersection is empty.
   */
  isDisjointFrom(other: HashSet<T>): boolean {
    if (this.size <= other.size) {
      for (const k of this) {
        if (other.has(k)) return false;
      }
    } else {
      for (const k of other) {
        if (this.has(k)) return false;
      }
    }
    return true;
  }

  // Creating new sets

  private cfg: HashConfig<T>;
  private root: Node<T, unknown> | null;

  private constructor(cfg: HashConfig<T>, root: Node<T, unknown> | null, size: number) {
    this.cfg = cfg;
    this.root = root;
    this.size = size;
  }
}
Object.defineProperty(HashSet.prototype, "@@__IMMUTABLE_SET__@@", { value: true });
