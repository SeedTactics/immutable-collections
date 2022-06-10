import { LazySeq } from "./lazyseq.js";
import { ComparisionConfig, mkComparisonConfig, OrderedMapKey } from "./comparison.js";
import { TreeNode } from "./rotations.js";
import { foldl, foldr, insert, iterateAsc, iterateDesc, lookup, remove } from "./tree.js";

// eslint-disable-next-line @typescript-eslint/ban-types
type NotUndefined = {} | null;

export class OrderedMap<K extends OrderedMapKey, V> implements ReadonlyMap<K, V> {
  private cfg: ComparisionConfig<K>;
  private root: TreeNode<K, V> | undefined;

  private constructor(cfg: ComparisionConfig<K>, root: TreeNode<K, V> | undefined) {
    this.cfg = cfg;
    this.root = root;
  }

  // ReadonlyMap interface
  get size() {
    return this.root === undefined ? 0 : this.root.size;
  }

  get(k: K): V | undefined {
    if (this.root === null) return undefined;
    return lookup(this.cfg, k, this.root);
  }

  has(k: K): boolean {
    return this.get(k) !== undefined;
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return iterateAsc(this.root, (k, v) => [k, v]);
  }

  entries(): IterableIterator<[K, V]> {
    return iterateAsc(this.root, (k, v) => [k, v]);
  }

  keys(): IterableIterator<K> {
    return iterateAsc(this.root, (k) => k);
  }

  values(): IterableIterator<V> {
    return iterateAsc(this.root, (_, v) => v);
  }

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

  // Other read methods

  foldl<T>(f: (acc: T, key: K, val: V) => T, zero: T): T {
    return foldl(f, zero, this.root);
  }

  foldr<T>(f: (key: K, val: V, acc: T) => T, zero: T): T {
    return foldr(f, zero, this.root);
  }

  toAscLazySeq(): LazySeq<readonly [K, V]> {
    return LazySeq.ofIterable(this.entries());
  }

  keysToAscLazySeq(): LazySeq<K> {
    return LazySeq.ofIterable(this.keys());
  }

  valuesToAscLazySeq(): LazySeq<V> {
    return LazySeq.ofIterable(this.values());
  }

  toDescLazySeq(): LazySeq<readonly [K, V]> {
    return LazySeq.ofIterable(iterateDesc(this.root, (k, v) => [k, v]));
  }

  keysToDescLazySeq(): LazySeq<K> {
    return LazySeq.ofIterable(iterateDesc(this.root, (k) => k));
  }

  valuesToDescLazySeq(): LazySeq<V> {
    return LazySeq.ofIterable(iterateDesc(this.root, (_, v) => v));
  }

  // Methods modifying the map

  set(k: K, v: V): OrderedMap<K, V> {
    return this.modify(k, () => v);
  }

  modify(k: K, f: (existing: V | undefined) => V): OrderedMap<K, V> {
    const newRoot = insert(this.cfg, k, f, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  delete(k: K): OrderedMap<K, V> {
    const newRoot = remove(this.cfg, k, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  /* TODO: union, append, mapValues, collectValues, filter */

  // Creating new maps

  public static empty<K extends OrderedMapKey, V extends NotUndefined>(): OrderedMap<K, V> {
    return new OrderedMap(mkComparisonConfig(), undefined);
  }

  /* TODO: from, build, union, intersection */

  protected static ["@@__IMMUTABLE_KEYED__@@"]: true;
}
