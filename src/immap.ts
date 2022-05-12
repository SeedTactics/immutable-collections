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

  set(k: K & HashKey, v: V): ImMap<K, V> {
    const [newRoot, inserted] = insert(this.cfg, k, () => v, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new ImMap(this.cfg, newRoot, this.size + (inserted ? 1 : 0));
    }
  }

  modify(k: K & HashKey, f: (v: V | undefined) => V): ImMap<K, V> {
    const [newRoot, inserted] = insert(this.cfg, k, f, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new ImMap(this.cfg, newRoot, this.size + (inserted ? 1 : 0));
    }
  }

  delete(k: K & HashKey): ImMap<K, V> {
    const [newRoot, deleted] = remove(this.cfg, k, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new ImMap(this.cfg, newRoot, this.size + (deleted ? -1 : 0));
    }
  }

  append(items: Iterable<readonly [K & HashKey, V]>, merge?: (v1: V, v2: V) => V): ImMap<K, V> {
    let newRoot = this.root;
    let newSize = this.size;
    for (const [k, v] of items) {
      const [r, inserted] = insert(this.cfg, k, (old) => (old && merge ? merge(old, v) : v), newRoot);
      newRoot = r;
      if (inserted) newSize++;
    }
    if (newRoot === this.root) {
      return this;
    } else {
      return new ImMap(this.cfg, newRoot, newSize);
    }
  }

  // Creating new maps

  public static empty<K extends HashKey, V>(): ImMap<K, V> {
    return new ImMap(mkHashConfig<K & HashKey>(), null, 0);
  }

  public static from<K extends HashKey, V>(items: Iterable<readonly [K, V]>, merge?: (v1: V, v2: V) => V): ImMap<K, V> {
    let root: MutableHamtNode<K, V> | null = null;
    let size = 0;
    const cfg = mkHashConfig<K>();
    let val: (old: V | undefined, v: V) => V;
    if (merge) {
      val = function val(old: V | undefined, v: V): V {
        return old ? merge(old, v) : v;
      };
    } else {
      val = function (_old, v: V): V {
        return v;
      };
    }
    for (const [k, t] of items) {
      // https://github.com/microsoft/TypeScript/issues/43047
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const rootAlias = root as MutableHamtNode<K, V> | null;
      const [r, inserted] = mutateInsert(cfg, k, t, val, rootAlias);
      if (inserted) size++;
      root = r;
    }
    return new ImMap(cfg, root, size);
  }

  public static build<K extends HashKey, V>(items: Iterable<V>, key: (v: V) => K): ImMap<K, V>;
  public static build<T, K extends HashKey, V>(
    items: Iterable<T>,
    key: (v: T) => K,
    val: (old: V | undefined, t: T) => V
  ): ImMap<K, V>;
  public static build<T, K extends HashKey, V>(
    items: Iterable<T>,
    key: (t: T) => K,
    val?: (old: V | undefined, t: T) => V
  ): ImMap<K, V> {
    let root: MutableHamtNode<K, V> | null = null;
    let size = 0;
    const cfg = mkHashConfig<K>();
    const getVal = val ?? ((_, t) => t as unknown as V);
    for (const t of items) {
      // https://github.com/microsoft/TypeScript/issues/43047
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const rootAlias = root as MutableHamtNode<K, V> | null;
      const [r, inserted] = mutateInsert(cfg, key(t), t, getVal, rootAlias);
      if (inserted) size++;
      root = r;
    }
    return new ImMap(cfg, root, size);
  }

  //mapValues<U>(f: (v: V, k: K) => U): ImMap<K, U>;
  //collectValues(f: (v: V, k: K) => V | null | undefined): IMap<K, V>;
}

export function unionImMaps<K extends HashKey, V>(
  merge: (v1: V, v2: V) => V,
  ...maps: readonly ImMap<K, V>[]
): ImMap<K, V> {
  let m = maps[0];
  for (let i = 1; i < maps.length; i++) {
    m = maps[i].fold(
      (leftVals, rightVals, k) => leftVals.modify(k, (old) => (old === undefined ? rightVals : merge(old, rightVals))),
      m
    );
  }
  return m;
}
