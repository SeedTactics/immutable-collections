/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { HashKey, hashValues, ToHashable } from "./data-structures/hashing.js";
import {
  mkCompareByProperties,
  ToComparable,
  OrderedMapKey,
  ReturnOfComparable,
  evalComparable,
} from "./data-structures/comparison.js";
import { HashMap } from "./api/hashmap.js";
import { HashSet } from "./api/hashset.js";
import { OrderedMap } from "./api/orderedmap.js";
import * as hamt from "./data-structures/hamt.js";
import * as tree from "./data-structures/tree.js";
import { OrderedSet } from "./api/orderedset.js";

type JsMapKey = number | string | boolean;

// eslint-disable-next-line @typescript-eslint/ban-types
type NotUndefined = {} | null;

type TupleOfHashProps<T, FS extends ToHashable<T>[]> = FS extends [(t: T) => infer R]
  ? R
  : {
      [k in keyof FS]: FS[k] extends (t: T) => infer R ? R : never;
    };

type TupleOfCmpProps<T, FS extends ToComparable<T>[]> = FS extends [ToComparable<T>]
  ? ReturnOfComparable<T, FS[0]>
  : {
      [k in keyof FS]: ReturnOfComparable<T, FS[k]>;
    };

/**
 * Class Wrapper Around Iterables
 *
 * @remarks
 * The `LazySeq<T>` class wraps a JavaScript [iterable](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols)
 * It provides a number of transformation functions that return new LazySeqs
 * along with several functions that convert the values inside the LazySeq into
 * a data structure such as a {@link HashMap}, {@link OrderedSet}, array, or
 * [JavaScript Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map).
 *
 * The general format for data manipulation is therefore to start with some data in a data
 * structure such as an array, object, HashMap, etc. Then, create a new LazySeq chain starting
 * from the initial data, call various transformation methods to map, group, filter, aggregate
 * the data, and finally terminate the chain by converting back to a data structure.
 * Because all the transformation methods are lazy, the new terminating data structure is
 * built directly from the transformed data in one pass.
 */
export class LazySeq<T> {
  /** Creates a new LazySeq from an Iterable
   *
   * @category Creation
   *
   */
  static of<T>(iter: Iterable<T>): LazySeq<T> {
    return new LazySeq(iter);
  }

  /** Creates a new LazySeq from a generator function
   *
   * @category Creation
   *
   * @remarks
   * Use this to create a LazySeq from a [generator function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*)
   * which yields values.  Note that since this is lazy, the generator function will not
   * be immediately called but only called once the LazySeq is iterated.
   *
   * @example
   * ```ts
   * const seq = LazySeq.ofIterator(function* () {
   *  yield 1;
   *  yield 2;
   *  yield 3;
   * });
   * ```
   */
  static ofIterator<T>(f: () => Iterator<T>): LazySeq<T> {
    return new LazySeq<T>({
      [Symbol.iterator]() {
        return f();
      },
    });
  }

  /** Creates a new LazySeq consisting of the keys and values in an object
   *
   * @category Creation
   *
   * @remarks
   * This restricts to only the keys that are [own](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/hasOwnProperty)
   * properties of the object.
   */
  static ofObject<V>(obj: { [k: string]: V }): LazySeq<readonly [string, V]> {
    return LazySeq.ofIterator(function* () {
      for (const k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          yield [k, obj[k]];
        }
      }
    });
  }

  /** Creates a new LazySeq consisting of a sequence of numbers
   *
   * @category Creation
   *
   * @remarks
   * This creates a sequence of numbers from `start` to `end` (exclusive) with a
   * step size of `step`, which defaults to 1.  The step size can be negative.
   */
  static ofRange(start: number, end: number, step?: number): LazySeq<number> {
    const s = step || 1;
    if (s > 0) {
      return LazySeq.ofIterator(function* () {
        for (let x = start; x < end; x += s) {
          yield x;
        }
      });
    } else {
      return LazySeq.ofIterator(function* () {
        for (let x = start; x > end; x += s) {
          yield x;
        }
      });
    }
  }

  /** Iterates the items in the LazySeq
   *
   * @category Transformation
   *
   * @remarks
   * This is the default iteration when using `for .. of` directly on the `LazySeq`.
   */
  [Symbol.iterator](): Iterator<T> {
    return this.iter[Symbol.iterator]();
  }

  /** Groups and combines the items in the LazySeq
   *
   * @category Transformation
   *
   * @remarks
   * aggregate strictly processes each element in the LazySeq.  For each element,
   * it computes a key using the `key` function and a value using the `val` function.
   * If an existing key is found, the value is combined with the existing value using
   * the `combine` function.
   *
   * While not visible in the public API, internally this uses a JavaScript Map to store
   * the keys and values so the key must be a number, string, or boolean.  To support
   * additional key types, use the {@link LazySeq#buildHashMap} or {@link LazySeq#buildOrderedMap}.
   */
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
    return LazySeq.of(m);
  }

  /** Returns true if all elements in the LazySeq match a given condition
   *
   * @category Transformation
   *
   * @remarks
   * Returns true on the empty LazySeq.
   */
  allMatch(f: (x: T) => boolean): boolean {
    for (const x of this.iter) {
      if (!f(x)) {
        return false;
      }
    }
    return true;
  }

  /** Returns true if any element in the LazySeq matches the given condition
   *
   * @category Transformation
   *
   * @remarks
   * Returns false on the empty LazySeq.
   */
  anyMatch(f: (x: T) => boolean): boolean {
    for (const x of this.iter) {
      if (f(x)) {
        return true;
      }
    }
    return false;
  }

  /** Lazily appends a single value to the end of the LazySeq
   *
   * @category Transformation
   *
   */
  append(x: T): LazySeq<T> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      yield* iter;
      yield x;
    });
  }

  /** Groups the elements in the LazySeq into chunks of a given size
   *
   * @category Transformation
   *
   * @remarks
   * This strictly iterates the elements in the LazySeq and groups them into
   * chunks of the given size.  The last chunk may be smaller than the
   * given size and will contain the remaining elements.
   */
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

  /** Lazily concat all elements in the provided Iterable to the end of the LazySeq
   *
   * @category Transformation
   */
  concat(i: Iterable<T>): LazySeq<T> {
    const iter = this.iter;
    return LazySeq.ofIterator(function* () {
      yield* iter;
      yield* i;
    });
  }

  /** Strictly return a new LazySeq where each element appears exactly once
   *
   * @category Transformation
   *
   * @remarks
   * Internally, this uses a JavaScript Set to store the elements so the
   * elements must be a number or string.  To support additional types,
   * use the {@link LazySeq#distinctBy} method.
   */
  distinct(this: LazySeq<T & (string | number | null)>): LazySeq<T> {
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

  distinctBy(prop: ToHashable<T>, ...props: Array<ToHashable<T>>): LazySeq<T> {
    props.unshift(prop);
    const iter = this.iter;
    const cfg = {
      hash: (x: T) => hashValues(...props.map((f) => f(x))),
      compare: mkCompareByProperties(...props),
    };
    return LazySeq.ofIterator(function* () {
      let s = null;
      let inserted = false;
      function constTrue(old: boolean | undefined): true {
        inserted = old === undefined;
        return true;
      }
      for (const x of iter) {
        s = hamt.mutateInsert(cfg, x, true, constTrue, s);
        if (inserted) {
          yield x;
        }
      }
    });
  }

  distinctAndSortBy(prop: ToComparable<T>, ...props: Array<ToComparable<T>>): LazySeq<T> {
    props.unshift(prop);
    const cfg = {
      compare: mkCompareByProperties(...props),
    };
    let s: tree.MutableTreeNode<T, T> | null = null;
    function fst(old: T | undefined, x: T): T {
      return old === undefined ? x : old;
    }
    for (const x of this.iter) {
      s = tree.mutateInsert(cfg, x, x, fst, s);
    }
    return LazySeq.ofIterator(() => tree.iterateAsc((k) => k, s));
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

  filter<S extends T>(f: (x: T) => x is S): LazySeq<S>;
  filter(f: (x: T) => boolean): LazySeq<T>;
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

  groupBy<PropFn extends ToHashable<T>, PropFns extends ToHashable<T>[]>(
    propFn: PropFn,
    ...fs: PropFns
  ): LazySeq<[TupleOfHashProps<T, [PropFn, ...PropFns]>, ReadonlyArray<T>]> {
    fs.unshift(propFn);
    const cfg = {
      hash: (x: T) => hashValues(...fs.map((f) => f(x))),
      compare: mkCompareByProperties(...fs),
    };

    let s: hamt.MutableHamtNode<T, Array<T>> | null = null;
    function appendVal(old: Array<T> | undefined, x: T): Array<T> {
      if (old === undefined) {
        return [x];
      } else {
        old.push(x);
        return old;
      }
    }
    for (const x of this.iter) {
      s = hamt.mutateInsert(cfg, x, x, appendVal, s);
    }
    return LazySeq.ofIterator(() =>
      hamt.iterate<
        T,
        Array<T>,
        [TupleOfHashProps<T, [PropFn, ...PropFns]>, ReadonlyArray<T>]
      >((t, ts) => {
        if (fs.length === 1) {
          return [fs[0](t) as TupleOfHashProps<T, [PropFn, ...PropFns]>, ts];
        } else {
          return [fs.map((f) => f(t)) as TupleOfHashProps<T, [PropFn, ...PropFns]>, ts];
        }
      }, s)
    );
  }

  orderedGroupBy<PropFn extends ToComparable<T>, PropFns extends ToComparable<T>[]>(
    propfn: PropFn,
    ...fns: PropFns
  ): LazySeq<[TupleOfCmpProps<T, [PropFn, ...PropFns]>, ReadonlyArray<T>]> {
    fns.unshift(propfn);
    const cfg = {
      compare: mkCompareByProperties(...fns),
    };

    let s: tree.MutableTreeNode<T, Array<T>> | null = null;
    function appendVal(old: Array<T> | undefined, x: T): Array<T> {
      if (old === undefined) {
        return [x];
      } else {
        old.push(x);
        return old;
      }
    }
    for (const x of this.iter) {
      s = tree.mutateInsert(cfg, x, x, appendVal, s);
    }
    return LazySeq.ofIterator(() =>
      tree.iterateAsc<
        T,
        Array<T>,
        [TupleOfCmpProps<T, [PropFn, ...PropFns]>, ReadonlyArray<T>]
      >((t, ts) => {
        if (fns.length === 1) {
          return [
            evalComparable(fns[0], t) as TupleOfCmpProps<T, [PropFn, ...PropFns]>,
            ts,
          ];
        } else {
          return [
            fns.map((f) => evalComparable(f, t)) as TupleOfCmpProps<
              T,
              [PropFn, ...PropFns]
            >,
            ts,
          ];
        }
      }, s)
    );
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

  maxBy(prop: ToComparable<T>, ...props: ReadonlyArray<ToComparable<T>>): T | undefined {
    const compare = mkCompareByProperties<T>(prop, ...props);
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

  minBy(prop: ToComparable<T>, ...props: ReadonlyArray<ToComparable<T>>): T | undefined {
    const compare = mkCompareByProperties<T>(prop, ...props);
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
    return LazySeq.of(Array.from(this.iter).sort(compare));
  }

  sortBy(prop: ToComparable<T>, ...props: ReadonlyArray<ToComparable<T>>): LazySeq<T> {
    return LazySeq.of(Array.from(this.iter).sort(mkCompareByProperties(prop, ...props)));
  }

  sumBy(getNumber: (v: T) => number): number {
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
    prop: ToComparable<T>,
    ...props: ReadonlyArray<ToComparable<T>>
  ): ReadonlyArray<T> {
    return Array.from(this.iter).sort(mkCompareByProperties(prop, ...props));
  }

  toHashMap<K, S extends NotUndefined>(
    f: (x: T) => readonly [K & HashKey, S],
    merge?: (v1: S, v2: S) => S
  ): HashMap<K & HashKey, S> {
    return HashMap.from(this.map(f), merge);
  }

  buildHashMap<K>(key: (x: T) => K & HashKey): HashMap<K & HashKey, T>;
  buildHashMap<K, S extends NotUndefined>(
    key: (x: T) => K & HashKey,
    val: (old: S | undefined, t: T) => S
  ): HashMap<K & HashKey, S>;
  buildHashMap<K, S extends NotUndefined>(
    key: (x: T) => K & HashKey,
    val?: (old: S | undefined, t: T) => S
  ): HashMap<K & HashKey, S> {
    return HashMap.build(this.iter, key, val as (old: S | undefined, t: T) => S);
  }

  toOrderedMap<K, S extends NotUndefined>(
    f: (x: T) => readonly [K & OrderedMapKey, S],
    merge?: (v1: S, v2: S) => S
  ): OrderedMap<K & OrderedMapKey, S> {
    return OrderedMap.from(this.map(f), merge);
  }

  buildOrderedMap<K>(key: (x: T) => K & OrderedMapKey): OrderedMap<K & OrderedMapKey, T>;
  buildOrderedMap<K, S extends NotUndefined>(
    key: (x: T) => K & OrderedMapKey,
    val: (old: S | undefined, t: T) => S
  ): OrderedMap<K & OrderedMapKey, S>;
  buildOrderedMap<K, S extends NotUndefined>(
    key: (x: T) => K & OrderedMapKey,
    val?: (old: S | undefined, t: T) => S
  ): OrderedMap<K & OrderedMapKey, S> {
    return OrderedMap.build(this.iter, key, val as (old: S | undefined, t: T) => S);
  }

  toMutableMap<K, S>(
    f: (x: T) => readonly [K & JsMapKey, S],
    merge?: (v1: S, v2: S) => S
  ): Map<K, S> {
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

  toRMap<K, S>(
    f: (x: T) => readonly [K & JsMapKey, S],
    merge?: (v1: S, v2: S) => S
  ): ReadonlyMap<K, S> {
    return this.toMutableMap(f, merge);
  }

  toObject<S>(
    f: (x: T) => readonly [string, S],
    merge?: (v1: S, v2: S) => S
  ): { [key: string]: S };
  toObject<S>(
    f: (x: T) => readonly [number, S],
    merge?: (v1: S, v2: S) => S
  ): { [key: number]: S };
  toObject<S>(
    f: (x: T) => readonly [string | number, S],
    merge?: (v1: S, v2: S) => S
  ): { [key: string | number]: S } {
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

  toHashSet<S>(converter: (x: T) => S & HashKey): HashSet<S & HashKey> {
    return HashSet.build(this.iter, converter);
  }

  toOrderedSet<S>(converter: (x: T) => S & OrderedMapKey): OrderedSet<S & OrderedMapKey> {
    return OrderedSet.build(this.iter, converter);
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

  toLookup<K>(key: (x: T) => K & HashKey): HashMap<K & HashKey, ReadonlyArray<T>>;
  toLookup<K, S>(
    key: (x: T) => K & HashKey,
    val: (x: T) => S
  ): HashMap<K & HashKey, ReadonlyArray<S>>;
  toLookup<K, S>(
    key: (x: T) => K & HashKey,
    val?: (x: T) => S
  ): HashMap<K & HashKey, ReadonlyArray<S>> {
    let merge: (old: Array<S> | undefined, t: T) => Array<S>;
    if (val === undefined) {
      merge = (old, t) => {
        if (old === undefined) {
          return [t as unknown as S];
        } else {
          return [...old, t as unknown as S];
        }
      };
    } else {
      merge = (old, t) => {
        if (old === undefined) {
          return [val(t)];
        } else {
          return [...old, val(t)];
        }
      };
    }
    return HashMap.build(this.iter, key, merge);
  }

  toOrderedLookup<K>(
    key: (x: T) => K & OrderedMapKey
  ): OrderedMap<K & OrderedMapKey, ReadonlyArray<T>>;
  toOrderedLookup<K, S>(
    key: (x: T) => K & OrderedMapKey,
    val: (x: T) => S
  ): OrderedMap<K & OrderedMapKey, ReadonlyArray<S>>;
  toOrderedLookup<K, S>(
    key: (x: T) => K & OrderedMapKey,
    val?: (x: T) => S
  ): OrderedMap<K & OrderedMapKey, ReadonlyArray<S>> {
    let merge: (old: Array<S> | undefined, t: T) => Array<S>;
    if (val === undefined) {
      merge = (old, t) => {
        if (old === undefined) {
          return [t as unknown as S];
        } else {
          return [...old, t as unknown as S];
        }
      };
    } else {
      merge = (old, t) => {
        if (old === undefined) {
          return [val(t)];
        } else {
          return [...old, val(t)];
        }
      };
    }
    return OrderedMap.build(this.iter, key, merge);
  }

  toLookupMap<K1, K2>(
    key1: (x: T) => K1 & HashKey,
    key2: (x: T) => K2 & HashKey
  ): HashMap<K1 & HashKey, HashMap<K2 & HashKey, T>>;
  toLookupMap<K1, K2, S extends NotUndefined>(
    key1: (x: T) => K1 & HashKey,
    key2: (x: T) => K2 & HashKey,
    val: (x: T) => S,
    mergeVals?: (v1: S, v2: S) => S
  ): HashMap<K1 & HashKey, HashMap<K2 & HashKey, S>>;
  toLookupMap<K1, K2, S extends NotUndefined>(
    key1: (x: T) => K1 & HashKey,
    key2: (x: T) => K2 & HashKey,
    val?: (x: T) => S,
    mergeVals?: (v1: S, v2: S) => S
  ): HashMap<K1 & HashKey, HashMap<K2 & HashKey, S>> {
    let merge: (
      old: HashMap<K2 & HashKey, S> | undefined,
      t: T
    ) => HashMap<K2 & HashKey, S>;
    if (val === undefined) {
      merge = (old, t) => (old ?? HashMap.empty()).set(key2(t), t as unknown as S);
    } else if (mergeVals === undefined) {
      merge = (old, t) => (old ?? HashMap.empty()).set(key2(t), val(t));
    } else {
      merge = (old, t) =>
        (old ?? HashMap.empty()).alter(key2(t), (oldV) =>
          oldV === undefined ? val(t) : mergeVals(oldV as unknown as S, val(t))
        );
    }

    return HashMap.build(this.iter, key1, merge);
  }

  toLookupOrderedMap<K1, K2>(
    key1: (x: T) => K1 & OrderedMapKey,
    key2: (x: T) => K2 & OrderedMapKey
  ): OrderedMap<K1 & OrderedMapKey, OrderedMap<K2 & OrderedMapKey, T>>;
  toLookupOrderedMap<K1, K2, S>(
    key1: (x: T) => K1 & OrderedMapKey,
    key2: (x: T) => K2 & OrderedMapKey,
    val: (x: T) => S,
    mergeVals?: (v1: S, v2: S) => S
  ): OrderedMap<K1 & OrderedMapKey, OrderedMap<K2 & OrderedMapKey, S>>;
  toLookupOrderedMap<K1, K2, S extends NotUndefined>(
    key1: (x: T) => K1 & OrderedMapKey,
    key2: (x: T) => K2 & OrderedMapKey,
    val?: (x: T) => S,
    mergeVals?: (v1: S, v2: S) => S
  ): OrderedMap<K1 & OrderedMapKey, OrderedMap<K2 & OrderedMapKey, S>> {
    let merge: (
      old: OrderedMap<K2 & OrderedMapKey, S> | undefined,
      t: T
    ) => OrderedMap<K2 & OrderedMapKey, S>;
    if (val === undefined) {
      merge = (old, t) => (old ?? OrderedMap.empty()).set(key2(t), t as unknown as S);
    } else if (mergeVals === undefined) {
      merge = (old, t) => (old ?? OrderedMap.empty()).set(key2(t), val(t));
    } else {
      merge = (old, t) =>
        (old ?? OrderedMap.empty()).alter(key2(t), (oldV) =>
          oldV === undefined ? val(t) : mergeVals(oldV as unknown as S, val(t))
        );
    }
    return OrderedMap.build(this.iter, key1, merge);
  }

  toRLookup<K>(key: (x: T) => K): ReadonlyMap<K, ReadonlyArray<T>>;
  toRLookup<K, S>(key: (x: T) => K, val: (x: T) => S): ReadonlyMap<K, ReadonlyArray<S>>;
  toRLookup<K, S>(
    key: (x: T) => K,
    val?: (x: T) => S
  ): ReadonlyMap<K, ReadonlyArray<T | S>> {
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
