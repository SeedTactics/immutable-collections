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

export class HashMap<K extends HashKey, V> implements ReadonlyMap<K, V> {
  private cfg: HashConfig<K>;
  private root: HamtNode<K, V> | null;

  private constructor(cfg: HashConfig<K>, root: HamtNode<K, V> | null, size: number) {
    this.cfg = cfg;
    this.root = root;
    this.size = size;
  }

  // ReadonlyMap interface
  readonly size: number;

  get(k: K): V | undefined {
    if (this.root === null) return undefined;
    return lookup(this.cfg, k, this.root);
  }

  has(k: K): boolean {
    return this.get(k) !== undefined;
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return iterate((k, v) => [k, v], this.root);
  }

  entries(): IterableIterator<[K, V]> {
    return iterate((k, v) => [k, v], this.root);
  }

  keys(): IterableIterator<K> {
    return iterate((k) => k, this.root);
  }

  values(): IterableIterator<V> {
    return iterate((_, v) => v, this.root);
  }

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

  // Other read methods

  fold<T>(f: (acc: T, key: K, val: V) => T, zero: T): T {
    return fold(f, zero, this.root);
  }

  toLazySeq(): LazySeq<readonly [K, V]> {
    return LazySeq.ofIterable(this.entries());
  }

  keysToLazySeq(): LazySeq<K> {
    return LazySeq.ofIterable(this.keys());
  }

  valuesToLazySeq(): LazySeq<V> {
    return LazySeq.ofIterable(this.values());
  }

  keySet(): HashSet<K> {
    return HashSet.ofKeys(this);
  }

  // Methods modifying the map

  set(k: K, v: V): HashMap<K, V> {
    return this.modify(k, () => v);
  }

  modify(k: K, f: (existing: V | undefined) => V): HashMap<K, V> {
    const [newRoot, inserted] = insert(this.cfg, k, f, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashMap(this.cfg, newRoot, this.size + (inserted ? 1 : 0));
    }
  }

  delete(k: K): HashMap<K, V> {
    const newRoot = remove(this.cfg, k, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashMap(this.cfg, newRoot, this.size - 1);
    }
  }

  alter(k: K, f: (existing: V | undefined) => V | undefined): HashMap<K, V> {
    const [newRoot, sizeChange] = alter(this.cfg, k, f, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashMap(this.cfg, newRoot, this.size + sizeChange);
    }
  }

  // TODO: partition(f: (v: V, k: K) => boolean): readonly [HashMap<K, V>, HashMap<K, V>]

  union(other: HashMap<K, V>, merge?: (vThis: V, vOther: V, k: K) => V): HashMap<K, V> {
    const [newRoot, intersectionSize] = union(this.cfg, merge ?? ((_, s) => s), this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashMap(this.cfg, newRoot, this.size + other.size - intersectionSize);
    }
  }

  intersection(other: HashMap<K, V>, merge?: (vThis: V, vOther: V, k: K) => V): HashMap<K, V> {
    const [newRoot, size] = intersection(this.cfg, merge ?? ((_, s) => s), this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashMap(this.cfg, newRoot, size);
    }
  }

  difference<V2>(other: HashMap<K, V2>): HashMap<K, V> {
    const [newRoot, numRemoved] = difference(this.cfg, this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashMap(this.cfg, newRoot, this.size - numRemoved);
    }
  }

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

  adjust<V2>(
    keysToAdjust: HashMap<K, V2>,
    adjustVal: (existingVal: V | undefined, helperVal: V2, k: K) => V | undefined
  ): HashMap<K, V> {
    const [newRoot, numRemoved] = adjust(this.cfg, adjustVal, this.root, keysToAdjust.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashMap(this.cfg, newRoot, this.size - numRemoved);
    }
  }

  append(items: Iterable<readonly [K, V]>): HashMap<K, V> {
    return this.union(HashMap.from(items));
  }

  mapValues<V2>(f: (v: V, k: K) => V2): HashMap<K, V2> {
    const newRoot = mapValues(f, this.root);
    if (newRoot === this.root) {
      // if the roots didn't change, then the map is empty or  the values were === which
      // means that V1 is the same as V2.  In either case, can cast.
      return this as unknown as HashMap<K, V2>;
    } else {
      return new HashMap(this.cfg, newRoot, this.size);
    }
  }

  collectValues<V2>(f: (v: V, k: K) => V2 | null | undefined): HashMap<K, V2> {
    const [newRoot, newSize] = collectValues(f as (v: V, k: K) => V2 | undefined, true, this.root);
    if (newRoot === this.root) {
      // if the roots didn't change, then the map is empty or  the values were === which
      // means that V1 is the same as V2.  In either case, can cast.
      return this as unknown as HashMap<K, V2>;
    } else {
      return new HashMap(this.cfg, newRoot, newSize);
    }
  }

  filter(f: (v: V, k: K) => boolean): HashMap<K, V> {
    const [newRoot, newSize] = collectValues((v, k) => (f(v, k) ? v : undefined), false, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashMap(this.cfg, newRoot, newSize);
    }
  }

  // Creating new maps

  public static empty<K extends HashKey, V extends NotUndefined>(): HashMap<K, V> {
    return new HashMap(mkHashConfig(), null, 0);
  }

  public static from<K extends HashKey, V extends NotUndefined>(
    items: Iterable<readonly [K, V]>,
    merge?: (v1: V, v2: V) => V
  ): HashMap<K, V> {
    const cfg = mkHashConfig();
    const [root, size] = from(cfg, items, merge);
    return new HashMap(cfg, root, size);
  }

  public static build<K extends HashKey, V extends NotUndefined>(items: Iterable<V>, key: (v: V) => K): HashMap<K, V>;
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

  public static union<K extends HashKey, V>(
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

  public static intersection<K extends HashKey, V>(
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
}
Object.defineProperty(HashMap.prototype, "@@__IMMUTABLE_KEYED__@@", { value: true });
