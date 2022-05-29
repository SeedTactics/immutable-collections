import { HashKey } from "./hashing.js";
import { ImMap } from "./immap.js";
import { CompareByProperty, compareByProperties, ToComparable } from "./comparison.js";

type JsMapKey = number | string | boolean;

export class LazySeq<T> {
  static ofIterable<T>(iter: Iterable<T>): LazySeq<T> {
    return new LazySeq(iter);
  }

  static ofIterator<T>(f: () => Iterator<T>): LazySeq<T> {
    return new LazySeq<T>({
      [Symbol.iterator]() {
        return f();
      },
    });
  }

  static ofObject<V>(obj: { [k: string]: V }): LazySeq<readonly [string, V]> {
    return LazySeq.ofIterator(function* () {
      for (const k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          yield [k, obj[k]];
        }
      }
    });
  }

  static ofRange(start: number, end: number, step?: number): LazySeq<number> {
    const s = step || 1;
    if (s > 0) {
      return LazySeq.ofIterator(function* () {
        for (let x = start; x < end; x += s) {
          yield x;
        }
      });
    } else if (s < 0) {
      return LazySeq.ofIterator(function* () {
        for (let x = start; x > end; x += s) {
          yield x;
        }
      });
    } else {
      throw new Error("step must be nonzero");
    }
  }

  [Symbol.iterator](): Iterator<T> {
    return this.iter[Symbol.iterator]();
  }

  aggregate<K, S>(
    key: (x: T) => K & JsMapKey,
    val: (x: T) => S,
    combine: (s1: S, s2: S) => S
  ): LazySeq<readonly [K, S]> {
    const m = new Map<K, S>();
    for (const x of this.iter) {
      const k = key(x);
      const v = m.get(k);
      if (v === undefined) {
        m.set(k, val(x));
      } else {
        m.set(k, combine(v, val(x)));
      }
    }
    return LazySeq.ofIterable(m);
  }

  allMatch(f: (x: T) => boolean): boolean {
    for (const x of this.iter) {
      if (!f(x)) {
        return false;
      }
    }
    return true;
  }

  anyMatch(f: (x: T) => boolean): boolean {
    for (const x of this.iter) {
      if (f(x)) {
        return true;
      }
    }
    return false;
  }

  append(x: T): LazySeq<T> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      yield* iter;
      yield x;
    });
  }

  chunk(size: number): LazySeq<ReadonlyArray<T>> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      let chunk: T[] = [];
      for (const x of iter) {
        chunk.push(x);
        if (chunk.length === size) {
          yield chunk;
          chunk = [];
        }
      }
      if (chunk.length > 0) {
        yield chunk;
      }
    });
  }

  concat(i: Iterable<T>): LazySeq<T> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      yield* iter;
      yield* i;
    });
  }

  distinct(this: LazySeq<T & (string | number | null | undefined)>): LazySeq<T> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      const s = new Set<T>();
      for (const x of iter) {
        if (!s.has(x)) {
          s.add(x);
          yield x;
        }
      }
    });
  }

  drop(n: number): LazySeq<T> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      let cnt = 0;
      for (const x of iter) {
        if (cnt >= n) {
          yield x;
        } else {
          cnt += 1;
        }
      }
    });
  }

  dropWhile(f: (x: T) => boolean): LazySeq<T> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      let dropping = true;
      for (const x of iter) {
        if (dropping) {
          if (!f(x)) {
            dropping = false;
            yield x;
          }
        } else {
          yield x;
        }
      }
    });
  }

  isEmpty(): boolean {
    const first = this.iter[Symbol.iterator]().next();
    return first.done === true;
  }

  filter(f: (x: T) => boolean): LazySeq<T> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      for (const x of iter) {
        if (f(x)) {
          yield x;
        }
      }
    });
  }

  find(f: (v: T) => boolean): T | undefined {
    for (const x of this.iter) {
      if (f(x)) {
        return x;
      }
    }
    return undefined;
  }

  flatMap<S>(f: (x: T) => Iterable<S>): LazySeq<S> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      for (const x of iter) {
        yield* f(x);
      }
    });
  }

  foldLeft<S>(zero: S, f: (soFar: S, cur: T) => S): S {
    let soFar = zero;
    for (const x of this.iter) {
      soFar = f(soFar, x);
    }
    return soFar;
  }

  groupBy<K>(
    f: (x: T) => K & JsMapKey,
    ...sort: ReadonlyArray<CompareByProperty<T>>
  ): LazySeq<readonly [K, ReadonlyArray<T>]> {
    const m = new Map<K, T[]>();
    for (const x of this.iter) {
      const k = f(x);
      let v = m.get(k);
      if (v === undefined) {
        v = [];
        m.set(k, v);
      }
      v.push(x);
    }
    if (sort.length > 0) {
      const sortF = compareByProperties(...sort);
      for (const v of m.values()) {
        v.sort(sortF);
      }
    }
    return LazySeq.ofIterable(m);
  }

  head(): T | undefined {
    const first = this.iter[Symbol.iterator]().next();
    if (first.done) {
      return undefined;
    } else {
      return first.value;
    }
  }

  length(): number {
    let cnt = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _ of this.iter) {
      cnt += 1;
    }
    return cnt;
  }

  map<S>(f: (x: T, idx: number) => S): LazySeq<S> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      let idx = 0;
      for (const x of iter) {
        yield f(x, idx);
        idx += 1;
      }
    });
  }

  collect<S>(f: (x: T) => S | null | undefined): LazySeq<S> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      for (const x of iter) {
        const y = f(x);
        if (y !== null && y !== undefined) {
          yield y;
        }
      }
    });
  }

  maxOn(...props: ReadonlyArray<ToComparable<T>>): T | undefined {
    const compare = compareByProperties<T>(...props);
    let ret: T | undefined = undefined;
    for (const x of this.iter) {
      if (ret === undefined) {
        ret = x;
      } else {
        if (compare(ret, x) <= 0) {
          ret = x;
        }
      }
    }
    return ret;
  }

  minOn(...props: ReadonlyArray<ToComparable<T>>): T | undefined {
    const compare = compareByProperties<T>(...props);
    let ret: T | undefined = undefined;
    for (const x of this.iter) {
      if (ret === undefined) {
        ret = x;
      } else {
        if (compare(ret, x) >= 0) {
          ret = x;
        }
      }
    }
    return ret;
  }

  prepend(x: T): LazySeq<T> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      yield x;
      yield* iter;
    });
  }

  prependAll(i: Iterable<T>): LazySeq<T> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      yield* i;
      yield* iter;
    });
  }

  sortWith(compare: (v1: T, v2: T) => number): LazySeq<T> {
    return LazySeq.ofIterable(Array.from(this.iter).sort(compare));
  }

  sort(...getKeys: Array<ToComparable<T> | CompareByProperty<T>>): LazySeq<T> {
    return LazySeq.ofIterable(Array.from(this.iter).sort(compareByProperties(...getKeys)));
  }

  sumOn(getNumber: (v: T) => number): number {
    let sum = 0;
    for (const x of this.iter) {
      sum += getNumber(x);
    }
    return sum;
  }

  tail(): LazySeq<T> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      let seenFirst = false;
      for (const x of iter) {
        if (seenFirst) {
          yield x;
        } else {
          seenFirst = true;
        }
      }
    });
  }

  take(n: number): LazySeq<T> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      let cnt = 0;
      for (const x of iter) {
        if (cnt >= n) {
          return;
        }
        yield x;
        cnt += 1;
      }
    });
  }

  takeWhile(f: (x: T) => boolean): LazySeq<T> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      for (const x of iter) {
        if (f(x)) {
          yield x;
        } else {
          return;
        }
      }
    });
  }

  zip<S>(other: Iterable<S>): LazySeq<readonly [T, S]> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      const i1 = iter[Symbol.iterator]();
      const i2 = other[Symbol.iterator]();
      while (true) {
        const n1 = i1.next();
        const n2 = i2.next();
        if (n1.done || n2.done) {
          return;
        }
        yield [n1.value, n2.value] as [T, S];
      }
    });
  }

  toMutableArray(): Array<T> {
    return Array.from(this.iter);
  }

  toRArray(): ReadonlyArray<T> {
    return Array.from(this.iter);
  }

  toSortedArray(
    getKey: ToComparable<T> | CompareByProperty<T>,
    ...getKeys: ReadonlyArray<ToComparable<T> | CompareByProperty<T>>
  ): ReadonlyArray<T> {
    return Array.from(this.iter).sort(compareByProperties(getKey, ...getKeys));
  }

  toImMap<K, S>(f: (x: T) => readonly [K & HashKey, S], merge?: (v1: S, v2: S) => S): ImMap<K & HashKey, S> {
    return ImMap.from(this.map(f), merge);
  }

  buildImMap<K>(key: (x: T) => K & HashKey): ImMap<K & HashKey, T>;
  buildImMap<K, S>(key: (x: T) => K & HashKey, val: (old: S | undefined, t: T) => S): ImMap<K & HashKey, S>;
  buildImMap<K, S>(key: (x: T) => K & HashKey, val?: (old: S | undefined, t: T) => S): ImMap<K & HashKey, S> {
    return ImMap.build(this.iter, key, val as (old: S | undefined, t: T) => S);
  }

  toMutableMap<K, S>(f: (x: T) => readonly [K & JsMapKey, S], merge?: (v1: S, v2: S) => S): Map<K, S> {
    const m = new Map<K, S>();
    for (const x of this.iter) {
      const [k, s] = f(x);
      if (merge !== undefined) {
        const old = m.get(k);
        if (old) {
          m.set(k, merge(old, s));
        } else {
          m.set(k, s);
        }
      } else {
        m.set(k, s);
      }
    }
    return m;
  }

  toRMap<K, S>(f: (x: T) => readonly [K & JsMapKey, S], merge?: (v1: S, v2: S) => S): ReadonlyMap<K, S> {
    return this.toMutableMap(f, merge);
  }

  toObject<S>(f: (x: T) => readonly [string, S], merge?: (v1: S, v2: S) => S): { [key: string]: S };
  toObject<S>(f: (x: T) => readonly [number, S], merge?: (v1: S, v2: S) => S): { [key: number]: S };
  toObject<S>(f: (x: T) => readonly [string | number, S], merge?: (v1: S, v2: S) => S): { [key: string | number]: S } {
    const m: { [key: string | number]: S } = {};
    for (const x of this.iter) {
      const [k, s] = f(x);
      if (merge !== undefined) {
        const old = m[k];
        if (old) {
          m[k] = merge(old, s);
        } else {
          m[k] = s;
        }
      } else {
        m[k] = s;
      }
    }
    return m;
  }

  toMutableSet<S>(converter: (x: T) => S & JsMapKey): Set<S> {
    const s = new Set<S>();
    for (const x of this.iter) {
      s.add(converter(x));
    }
    return s;
  }

  toRSet<S>(converter: (x: T) => S & JsMapKey): ReadonlySet<S> {
    return this.toMutableSet(converter);
  }

  toLookup<K>(key: (x: T) => K & HashKey): ImMap<K & HashKey, ReadonlyArray<T>>;
  toLookup<K, S>(key: (x: T) => K & HashKey, val: (x: T) => S): ImMap<K & HashKey, ReadonlyArray<S>>;
  toLookup<K, S>(key: (x: T) => K & HashKey, val?: (x: T) => S): ImMap<K & HashKey, ReadonlyArray<S>> {
    function merge(old: Array<S> | undefined, t: T): Array<S> {
      if (old) {
        old.push(val === undefined ? (t as unknown as S) : val(t));
        return old;
      } else {
        return [val === undefined ? (t as unknown as S) : val(t)];
      }
    }
    return ImMap.build(this.iter, key, merge);
  }

  toLookupMap<K1, K2>(
    key1: (x: T) => K1 & HashKey,
    key2: (x: T) => K2 & HashKey
  ): ImMap<K1 & HashKey, ImMap<K2 & HashKey, T>>;
  toLookupMap<K1, K2, S>(
    key1: (x: T) => K1 & HashKey,
    key2: (x: T) => K2 & HashKey,
    val: (x: T) => S,
    mergeVals?: (v1: S, v2: S) => S
  ): ImMap<K1 & HashKey, ImMap<K2 & HashKey, S>>;
  toLookupMap<K1, K2, S>(
    key1: (x: T) => K1 & HashKey,
    key2: (x: T) => K2 & HashKey,
    val?: (x: T) => S,
    mergeVals?: (v1: S, v2: S) => S
  ): ImMap<K1 & HashKey, ImMap<K2 & HashKey, T | S>> {
    // TODO: add dedicated function to ImMap to make this efficient
    function merge(old: ImMap<K2 & HashKey, T | S> | undefined, t: T): ImMap<K2 & HashKey, T | S> {
      if (old === undefined) {
        old = ImMap.empty<K2 & HashKey, T | S>();
      }
      if (val === undefined) {
        return old.set(key2(t), t);
      } else if (mergeVals === undefined) {
        return old.set(key2(t), val(t));
      } else {
        return old.modify(key2(t), (oldV) => (oldV === undefined ? val(t) : mergeVals(oldV as S, val(t))));
      }
    }
    return ImMap.build(this.iter, key1, merge);
  }

  toRLookup<K>(key: (x: T) => K): ReadonlyMap<K, ReadonlyArray<T>>;
  toRLookup<K, S>(key: (x: T) => K, val: (x: T) => S): ReadonlyMap<K, ReadonlyArray<S>>;
  toRLookup<K, S>(key: (x: T) => K, val?: (x: T) => S): ReadonlyMap<K, ReadonlyArray<T | S>> {
    const m = new Map<K, Array<T | S>>();
    for (const x of this.iter) {
      const k = key(x);
      const v = val === undefined ? x : val(x);
      const old = m.get(k);
      if (old !== undefined) {
        old.push(v);
      } else {
        m.set(k, [v]);
      }
    }
    return m;
  }

  transform<U>(f: (s: LazySeq<T>) => U): U {
    return f(this);
  }

  private constructor(private iter: Iterable<T>) {}
}
