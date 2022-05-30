import {
  collectValues,
  fold,
  HamtNode,
  insert,
  intersection,
  iterate,
  lookup,
  mapValues,
  MutableHamtNode,
  mutateInsert,
  remove,
  union,
} from "./hamt.js";
import { HashConfig, HashKey, mkHashConfig } from "./hashing.js";
import { LazySeq } from "./lazyseq.js";

// eslint-disable-next-line @typescript-eslint/ban-types
type NotUndefined = {} | null;

export class ImMap<K extends HashKey, V> implements ReadonlyMap<K, V> {
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
    return lookup(this.cfg, this.cfg.hash(k), 0, k, this.root);
  }

  has(k: K): boolean {
    return this.get(k) !== undefined;
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return iterate(this.root, (k, v) => [k, v]);
  }

  entries(): IterableIterator<[K, V]> {
    return iterate(this.root, (k, v) => [k, v]);
  }

  keys(): IterableIterator<K> {
    return iterate(this.root, (k) => k);
  }

  values(): IterableIterator<V> {
    return iterate(this.root, (_, v) => v);
  }

  forEach(f: (val: V, k: K, map: ImMap<K, V>) => void): void {
    fold(
      this.root,
      (_, v, k) => {
        f(v, k, this);
        return undefined;
      },
      undefined
    );
  }

  // Other read methods

  fold<T>(f: (acc: T, val: V, key: K) => T, zero: T): T {
    return fold(this.root, f, zero);
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

  // Methods modifying the map

  set(k: K, v: V): ImMap<K, V> {
    return this.modify(k, () => v);
  }

  modify(k: K, f: (existing: V | undefined) => V): ImMap<K, V> {
    const [newRoot, inserted] = insert(this.cfg, k, f, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new ImMap(this.cfg, newRoot, this.size + (inserted ? 1 : 0));
    }
  }

  delete(k: K): ImMap<K, V> {
    const newRoot = remove(this.cfg, k, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new ImMap(this.cfg, newRoot, this.size - 1);
    }
  }

  union(other: ImMap<K, V>, merge?: (vThis: V, vOther: V) => V): ImMap<K, V> {
    return ImMap.union(merge ?? ((_, s) => s), this, other);
  }

  append(items: Iterable<readonly [K, V]>): ImMap<K, V> {
    const snd: <T>(a: unknown, s: T) => T = (_, s) => s;
    return ImMap.union(snd, this, ImMap.from(items, snd));
  }

  mapValues(f: (v: V, k: K) => V): ImMap<K, V> {
    const newRoot = mapValues(this.root, f);
    if (newRoot === this.root) {
      return this;
    } else {
      return new ImMap(this.cfg, newRoot, this.size);
    }
  }

  collectValues(f: (v: V, k: K) => V | null | undefined): ImMap<K, V> {
    const [newRoot, newSize] = collectValues(this.root, f as (v: V, k: K) => V | undefined, true);
    if (newRoot === this.root) {
      return this;
    } else {
      return new ImMap(this.cfg, newRoot, newSize);
    }
  }

  filter(f: (v: V, k: K) => boolean): ImMap<K, V> {
    const [newRoot, newSize] = collectValues(this.root, (v, k) => (f(v, k) ? v : undefined), false);
    if (newRoot === this.root) {
      return this;
    } else {
      return new ImMap(this.cfg, newRoot, newSize);
    }
  }

  // Creating new maps

  public static empty<K extends HashKey, V extends NotUndefined>(): ImMap<K, V> {
    return new ImMap(mkHashConfig(), null, 0);
  }

  public static from<K extends HashKey, V extends NotUndefined>(
    items: Iterable<readonly [K, V]>,
    merge?: (v1: V, v2: V) => V
  ): ImMap<K, V> {
    let root: MutableHamtNode<K, V> | null = null;
    let size = 0;
    const cfg = mkHashConfig();

    let val: (old: V | undefined, v: V) => V;
    if (merge) {
      val = function val(old: V | undefined, v: V): V {
        if (old === undefined) {
          size++;
          return v;
        } else {
          return merge(old, v);
        }
      };
    } else {
      val = function (old, v: V): V {
        if (old === undefined) {
          size++;
        }
        return v;
      };
    }

    for (const [k, t] of items) {
      root = mutateInsert(cfg, k, t, val, root);
    }
    return new ImMap(cfg, root, size);
  }

  public static build<K extends HashKey, V extends NotUndefined>(items: Iterable<V>, key: (v: V) => K): ImMap<K, V>;
  public static build<T, K extends HashKey, V extends NotUndefined>(
    items: Iterable<T>,
    key: (v: T) => K,
    val: (old: V | undefined, t: T) => V
  ): ImMap<K, V>;
  public static build<T, K extends HashKey, V extends NotUndefined>(
    items: Iterable<T>,
    key: (t: T) => K,
    val?: (old: V | undefined, t: T) => V
  ): ImMap<K, V> {
    let root: MutableHamtNode<K, V> | null = null;
    let size = 0;
    const cfg = mkHashConfig();

    let getVal: (old: V | undefined, t: T) => V;
    if (val) {
      getVal = function getVal(old: V | undefined, t: T): V {
        if (old === undefined) {
          size++;
          return val(undefined, t);
        } else {
          return val(old, t);
        }
      };
    } else {
      getVal = function (old: V | undefined, t: T): V {
        if (old === undefined) {
          size++;
        }
        return t as unknown as V;
      };
    }

    for (const t of items) {
      root = mutateInsert(cfg, key(t), t, getVal, root);
    }
    return new ImMap(cfg, root, size);
  }

  public static union<K extends HashKey, V>(merge: (v1: V, v2: V) => V, ...maps: readonly ImMap<K, V>[]): ImMap<K, V> {
    const nonEmpty = maps.filter((m) => m.size > 0);
    if (nonEmpty.length === 0) {
      return ImMap.empty<K, V>();
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
        return new ImMap(nonEmpty[0].cfg, root, newSize);
      }
    }
  }

  public static intersection<K extends HashKey, V>(
    merge: (v1: V, v2: V) => V,
    ...maps: readonly ImMap<K, V>[]
  ): ImMap<K, V> {
    if (maps.length === 0) {
      return ImMap.empty();
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
        return new ImMap(maps[0].cfg, root, newSize);
      }
    }
  }

  protected static ["@@__IMMUTABLE_KEYED__@@"]: true;
}
