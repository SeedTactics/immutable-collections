import { LazySeq } from "./lazyseq.js";
import { ComparisionConfig, mkComparisonConfig, OrderedMapKey } from "./comparison.js";
import { TreeNode } from "./rotations.js";
import {
  build,
  collectValues,
  foldl,
  foldr,
  from,
  insert,
  intersection,
  iterateAsc,
  iterateDesc,
  lookup,
  mapValues,
  remove,
  split,
  SplitResult,
  union,
} from "./tree.js";

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

  mapValues(f: (v: V, k: K) => V): OrderedMap<K, V> {
    const newRoot = mapValues(f, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  collectValues(f: (v: V, k: K) => V | null | undefined): OrderedMap<K, V> {
    const newRoot = collectValues(f as (v: V, k: K) => V | undefined, true, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  filter(f: (v: V, k: K) => boolean): OrderedMap<K, V> {
    const newRoot = collectValues((v, k) => (f(v, k) ? v : undefined), false, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  split(k: K): SplitResult<K, V> {
    return split(this.cfg, k, this.root);
  }

  union(other: OrderedMap<K, V>, merge?: (vThis: V, vOther: V) => V): OrderedMap<K, V> {
    const newRoot = union(this.cfg, merge ?? ((_, s) => s), this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  // Creating new maps

  public static empty<K extends OrderedMapKey, V extends NotUndefined>(): OrderedMap<K, V> {
    return new OrderedMap(mkComparisonConfig(), undefined);
  }

  public static from<K extends OrderedMapKey, V extends NotUndefined>(
    items: Iterable<readonly [K, V]>,
    merge?: (v1: V, v2: V) => V
  ): OrderedMap<K, V> {
    const cfg = mkComparisonConfig();
    return new OrderedMap(cfg, from(cfg, items, merge));
  }

  public static build<K extends OrderedMapKey, V extends NotUndefined>(
    items: Iterable<V>,
    key: (v: V) => K
  ): OrderedMap<K, V>;
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

  public static union<K extends OrderedMapKey, V>(
    merge: (v1: V, v2: V) => V,
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

  public static intersection<K extends OrderedMapKey, V>(
    merge: (v1: V, v2: V) => V,
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

  protected static ["@@__IMMUTABLE_KEYED__@@"]: true;
}
