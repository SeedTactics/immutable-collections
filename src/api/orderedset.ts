/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { ComparisionConfig, mkComparisonConfig, OrderedMapKey } from "../data-structures/comparison.js";
import {
  alter,
  build,
  collectValues,
  difference,
  foldl,
  foldr,
  intersection,
  iterateAsc,
  iterateDesc,
  lookup,
  lookupMax,
  lookupMin,
  maxView,
  minView,
  partition,
  split,
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

export class OrderedSet<T extends OrderedMapKey> implements ReadonlySet<T> {
  private cfg: ComparisionConfig<T>;
  private root: TreeNode<T, unknown> | null;

  private constructor(cfg: ComparisionConfig<T>, root: TreeNode<T, unknown> | null) {
    this.cfg = cfg;
    this.root = root;
  }

  // ReadonlySet interface

  get size(): number {
    return this.root === null ? 0 : this.root.size;
  }

  has(t: T): boolean {
    if (this.root === null) return false;
    return lookup(this.cfg, t, this.root) !== undefined;
  }

  [Symbol.iterator](): IterableIterator<T> {
    return iterateAsc((k) => k, this.root);
  }

  entries(): IterableIterator<[T, T]> {
    return iterateAsc((t) => [t, t], this.root);
  }

  keys(): IterableIterator<T> {
    return iterateAsc((t) => t, this.root);
  }

  values(): IterableIterator<T> {
    return iterateAsc((t) => t, this.root);
  }

  forEach(f: (val: T, val2: T, set: OrderedSet<T>) => void): void {
    foldl(
      (_acc, t) => {
        f(t, t, this);
        return undefined;
      },
      undefined,
      this.root
    );
  }

  // Other iteration

  foldl<R>(f: (acc: R, t: T) => R, zero: R): R {
    return foldl((acc, v) => f(acc, v), zero, this.root);
  }

  foldr<R>(f: (t: T, acc: R) => R, zero: R): R {
    return foldr((t, _, acc) => f(t, acc), zero, this.root);
  }

  toAscLazySeq(): LazySeq<T> {
    const root = this.root;
    return LazySeq.ofIterator(() => iterateAsc((k) => k, root));
  }

  toDescLazySeq(): LazySeq<T> {
    const root = this.root;
    return LazySeq.ofIterator(() => iterateDesc((k) => k, root));
  }

  // Methods modifying the set

  add(t: T): OrderedSet<T> {
    const newRoot = alter(this.cfg, t, constTrue, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedSet(this.cfg, newRoot);
    }
  }

  delete(t: T): OrderedSet<T> {
    const newRoot = alter(this.cfg, t, constUndefined, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedSet(this.cfg, newRoot);
    }
  }

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

  filter(f: (t: T) => boolean): OrderedSet<T> {
    const root = collectValues((_, t) => (f(t) ? true : undefined), false, this.root);
    if (root === this.root) {
      return this;
    } else {
      return new OrderedSet(this.cfg, root);
    }
  }

  split(t: T): { readonly below: OrderedSet<T>; readonly present: boolean; readonly above: OrderedSet<T> } {
    const s = split(this.cfg, t, this.root);
    return {
      below: new OrderedSet(this.cfg, s.below),
      present: s.val !== undefined,
      above: new OrderedSet(this.cfg, s.above),
    };
  }

  lookupMin(): T | undefined {
    if (this.root === null) return undefined;
    return lookupMin(this.root)[0];
  }

  lookupMax(): T | undefined {
    if (this.root === null) return undefined;
    return lookupMax(this.root)[0];
  }

  deleteMin(): OrderedSet<T> {
    if (this.root === null) return this;
    const m = minView(this.root);
    return new OrderedSet(this.cfg, m.rest);
  }

  deleteMax(): OrderedSet<T> {
    if (this.root === null) return this;
    const m = maxView(this.root);
    return new OrderedSet(this.cfg, m.rest);
  }

  minView(): { readonly min: T; readonly rest: OrderedSet<T> } | undefined {
    if (this.root === null) {
      return undefined;
    } else {
      const m = minView(this.root);
      return { min: m.k, rest: new OrderedSet(this.cfg, m.rest) };
    }
  }

  maxView(): { readonly max: T; readonly rest: OrderedSet<T> } | undefined {
    if (this.root === null) {
      return undefined;
    } else {
      const m = maxView(this.root);
      return { max: m.k, rest: new OrderedSet(this.cfg, m.rest) };
    }
  }

  union(other: OrderedSet<T>): OrderedSet<T> {
    const newRoot = union(this.cfg, constTrue, this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedSet(this.cfg, newRoot);
    }
  }

  intersection(other: OrderedSet<T>): OrderedSet<T> {
    const newRoot = intersection(this.cfg, constTrue, this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedSet(this.cfg, newRoot);
    }
  }

  difference(other: OrderedSet<T>): OrderedSet<T> {
    const newRoot = difference(this.cfg, this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new OrderedSet(this.cfg, newRoot);
    }
  }

  // Creating new sets

  public static empty<T extends OrderedMapKey>(): OrderedSet<T> {
    return new OrderedSet(mkComparisonConfig(), null);
  }

  public static ofKeys<K extends OrderedMapKey, V>(map: OrderedMap<K, V>): OrderedSet<K> {
    // access private properties of OrderedMap
    const prvMap = map as unknown as { cfg: ComparisionConfig<K>; root: TreeNode<K, V> | null };
    return new OrderedSet(prvMap.cfg, prvMap.root);
  }

  public static from<T extends OrderedMapKey>(items: Iterable<T>): OrderedSet<T> {
    const cfg = mkComparisonConfig();
    return new OrderedSet(
      cfg,
      build(cfg, items, (x) => x, constTrue)
    );
  }

  public static build<T extends OrderedMapKey, R>(items: Iterable<R>, key: (v: R) => T): OrderedSet<T> {
    const cfg = mkComparisonConfig();
    return new OrderedSet(cfg, build(cfg, items, key, constTrue));
  }

  public static union<T extends OrderedMapKey>(...sets: readonly OrderedSet<T>[]): OrderedSet<T> {
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

  public static intersection<T extends OrderedMapKey>(...sets: readonly OrderedSet<T>[]): OrderedSet<T> {
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
}

Object.defineProperty(OrderedSet.prototype, "@@__IMMUTABLE_KEYED__@@", { value: true });
