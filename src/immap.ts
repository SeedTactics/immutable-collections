import { fold, HamtNode, insert, iterate, lookup, MutableHamtNode, mutateInsert, remove } from "./hamt.js";
import { HashConfig, HashKey, mkHashConfig } from "./hashing.js";
import { LazySeq } from "./lazyseq.js";

export class ImMap<K, V> implements ReadonlyMap<K, V> {
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

  append(items: Iterable<readonly [K, V]>) {
    const snd: <T>(a: unknown, s: T) => T = (_, s) => s;
    return ImMap.union(snd, this, ImMap.from(items, snd, this.cfg));
  }

  union(other: ImMap<K, V>, merge?: (v1: V, v2: V) => V): ImMap<K, V> {
    return ImMap.union(merge ?? ((_, s) => s), this, other);
  }

  // Creating new maps

  public static empty<K extends HashKey, V>(): ImMap<K, V>;
  public static empty<K, V>(cfg: HashConfig<K>): ImMap<K, V>;
  public static empty<K, V>(cfg?: HashConfig<K>): ImMap<K, V> {
    return new ImMap(cfg ?? (mkHashConfig<K & HashKey>() as HashConfig<K>), null, 0);
  }

  public static from<K extends HashKey, V>(items: Iterable<readonly [K, V]>, merge?: (v1: V, v2: V) => V): ImMap<K, V>;
  public static from<K, V>(
    items: Iterable<readonly [K, V]>,
    merge: (v1: V, v2: V) => V,
    cfg: HashConfig<K>
  ): ImMap<K, V>;
  public static from<K, V>(
    items: Iterable<readonly [K, V]>,
    merge?: (v1: V, v2: V) => V,
    cfg?: HashConfig<K>
  ): ImMap<K, V> {
    let root: MutableHamtNode<K, V> | null = null;
    let size = 0;
    cfg = cfg ?? (mkHashConfig<K & HashKey>() as HashConfig<K>);

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

  public static build<K extends HashKey, V>(items: Iterable<V>, key: (v: V) => K): ImMap<K, V>;
  public static build<T, K extends HashKey, V>(
    items: Iterable<T>,
    key: (v: T) => K,
    val: (old: V | undefined, t: T) => V
  ): ImMap<K, V>;
  public static build<T, K, V>(
    items: Iterable<T>,
    key: (v: T) => K,
    val: (old: V | undefined, t: T) => V,
    cfg: HashConfig<K>
  ): ImMap<K, V>;
  public static build<T, K, V>(
    items: Iterable<T>,
    key: (t: T) => K,
    val?: (old: V | undefined, t: T) => V,
    cfg?: HashConfig<K>
  ): ImMap<K, V> {
    let root: MutableHamtNode<K, V> | null = null;
    let size = 0;
    cfg = cfg ?? (mkHashConfig<K & HashKey>() as HashConfig<K>);

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

  public static union<K, V>(merge: (v1: V, v2: V) => V, ...maps: readonly ImMap<K, V>[]): ImMap<K, V> {
    // TODO: add custom hamt method which optimizes this
    const nonEmpty = maps.filter((m) => m.size > 0);
    if (nonEmpty.length === 0) {
      return ImMap.empty(maps[0]?.cfg);
    } else {
      let m = nonEmpty[0];
      for (let i = 1; i < nonEmpty.length; i++) {
        for (const [k, v] of nonEmpty[i]) {
          m = m.modify(k, (old) => merge(old ?? v, v));
        }
      }
      return m;
    }
  }

  //mapValues<U>(f: (v: V, k: K) => U): ImMap<K, U>;
  //collectValues(f: (v: V, k: K) => V | null | undefined): IMap<K, V>;

  protected static ["@@__IMMUTABLE_KEYED__@@"]: true;
}
