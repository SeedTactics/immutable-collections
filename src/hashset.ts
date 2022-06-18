import { HashConfig, HashKey } from "./hashing.js";
import { LazySeq } from "./lazyseq.js";
import { mkHashConfig } from "./hashing.js";
import {
  fold,
  HamtNode,
  insert,
  intersection,
  iterate,
  lookup,
  MutableHamtNode,
  mutateInsert,
  remove,
  union,
} from "./hamt.js";
import type { HashMap } from "./hashmap.js";

function constTrue() {
  return true;
}

export class HashSet<T extends HashKey> implements ReadonlySet<T> {
  private cfg: HashConfig<T>;
  private root: HamtNode<T, unknown> | null;

  private constructor(cfg: HashConfig<T>, root: HamtNode<T, unknown> | null, size: number) {
    this.cfg = cfg;
    this.root = root;
    this.size = size;
  }

  // ReadonlySet interface

  readonly size: number;

  has(t: T): boolean {
    if (this.root === null) return false;
    return lookup(this.cfg, this.cfg.hash(t), 0, t, this.root) === true;
  }

  [Symbol.iterator](): IterableIterator<T> {
    return iterate(this.root, (t) => t);
  }

  entries(): IterableIterator<[T, T]> {
    return iterate(this.root, (t) => [t, t]);
  }

  keys(): IterableIterator<T> {
    return iterate(this.root, (t) => t);
  }

  values(): IterableIterator<T> {
    return iterate(this.root, (t) => t);
  }

  forEach(f: (val: T, val2: T, set: HashSet<T>) => void): void {
    fold(
      this.root,
      (_acc, t) => {
        f(t, t, this);
        return undefined;
      },
      undefined
    );
  }

  fold<R>(f: (acc: R, val: T) => R, zero: R): R {
    return fold(this.root, (acc, v) => f(acc, v), zero);
  }

  toLazySeq(): LazySeq<T> {
    return LazySeq.ofIterable(this.keys());
  }

  // Methods modifying the map

  add(t: T): HashSet<T> {
    const [newRoot, inserted] = insert(this.cfg, t, constTrue, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashSet(this.cfg, newRoot, this.size + (inserted ? 1 : 0));
    }
  }

  delete(t: T): HashSet<T> {
    const newRoot = remove(this.cfg, t, this.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashSet(this.cfg, newRoot, this.size - 1);
    }
  }

  append(items: Iterable<T>) {
    return this.union(HashSet.from(items));
  }

  union(other: HashSet<T>): HashSet<T> {
    const [newRoot, intersectionSize] = union(this.cfg, constTrue, this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashSet(this.cfg, newRoot, this.size + other.size - intersectionSize);
    }
  }

  intersection(other: HashSet<T>): HashSet<T> {
    const [newRoot, intersectionSize] = intersection(this.cfg, constTrue, this.root, other.root);
    if (newRoot === this.root) {
      return this;
    } else {
      return new HashSet(this.cfg, newRoot, intersectionSize);
    }
  }

  // TODO: difference

  // Creating new sets

  public static empty<T extends HashKey>(): HashSet<T> {
    return new HashSet(mkHashConfig(), null, 0);
  }

  public static ofKeys<K extends HashKey, V>(map: HashMap<K, V>) {
    // access private properties of HashMap
    const prvMap = map as unknown as { cfg: HashConfig<K>; root: HamtNode<K, V> | null; size: number };
    return new HashSet(prvMap.cfg, prvMap.root, prvMap.size);
  }

  public static from<T extends HashKey>(items: Iterable<T>): HashSet<T> {
    let root: MutableHamtNode<T, boolean> | null = null;
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

  public static build<T extends HashKey, R>(items: Iterable<R>, key: (v: R) => T): HashSet<T> {
    let root: MutableHamtNode<T, boolean> | null = null;
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

  public static intersection<T extends HashKey>(...sets: readonly HashSet<T>[]): HashSet<T> {
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
}
