/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { LazySeq } from "../lazyseq.js";
import { ComparisionConfig, mkComparisonConfig, OrderedMapKey } from "../data-structures/comparison.js";
import { TreeNode } from "../data-structures/rotations.js";
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
} from "../data-structures/tree.js";

// eslint-disable-next-line @typescript-eslint/ban-types
type NotUndefined = {} | null;

function constUndefined() {
  return undefined;
}

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
    return lookup(this.cfg, k, this.root);
  }

  has(k: K): boolean {
    return lookup(this.cfg, k, this.root) !== undefined;
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
    const newRoot = alter(this.cfg, k, () => v, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  alter(k: K, f: (existing: V | undefined) => V | undefined): OrderedMap<K, V> {
    const newRoot = alter(this.cfg, k, f, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  delete(k: K): OrderedMap<K, V> {
    const newRoot = alter(this.cfg, k, constUndefined, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  // TODO: partition(f: (v: V, k: K) => boolean): readonly [OrderedMap<K, V>, OrderedMap<K, V>]

  // TODO: indexing access: findIndex, lookupIndex, elemAt, take, drop, splitAt, updateAt, deleteAt

  // TODO: min/max values: lookupMin, lookupMax, deleteMin, deleteMax, updateMin, updateMax, minView, maxView

  mapValues<V2>(f: (v: V, k: K) => V2): OrderedMap<K, V2> {
    const newRoot = mapValues(f, this.root);
    if (newRoot === this.root) {
      return this as unknown as OrderedMap<K, V2>;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  collectValues<V2>(f: (v: V, k: K) => V2 | null | undefined): OrderedMap<K, V2> {
    const newRoot = collectValues(f as (v: V, k: K) => V2 | undefined, true, this.root);
    if (newRoot === this.root) {
      return this as unknown as OrderedMap<K, V2>;
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

  split(k: K): { readonly below: OrderedMap<K, V>; readonly val: V | undefined; readonly above: OrderedMap<K, V> } {
    const s = split(this.cfg, k, this.root);
    return { below: new OrderedMap(this.cfg, s.below), val: s.val, above: new OrderedMap(this.cfg, s.above) };
  }

  union(other: OrderedMap<K, V>, merge?: (vThis: V, vOther: V, k: K) => V): OrderedMap<K, V> {
    const newRoot = union(this.cfg, merge ?? ((_, s) => s), this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  intersection(other: OrderedMap<K, V>, merge?: (vThis: V, vOther: V, k: K) => V): OrderedMap<K, V> {
    const newRoot = intersection(this.cfg, merge ?? ((_, s) => s), this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  difference<V2>(other: OrderedMap<K, V2>): OrderedMap<K, V> {
    const newRoot = difference(this.cfg, this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedMap(this.cfg, newRoot);
    }
  }

  // TODO: withoutKeys(other: OrderedSet<K>): OrderedMap<K, V>  can just use difference once OrderedSet is defined

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

  public static intersection<K extends OrderedMapKey, V>(
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
}

Object.defineProperty(OrderedMap.prototype, "@@__IMMUTABLE_KEYED__@@", { value: true });
