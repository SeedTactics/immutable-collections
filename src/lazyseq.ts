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

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
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
 * A class-wrapper around iterables
 *
 * @remarks
 * The `LazySeq<T>` class stores an [iterable](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#The_iterable_protocol)
 * of type `T` and provides a number of methods to transform the iterable.
 * The general format for data manipulation is to start with some data in
 * a data structure such as an array, object, {@link ./api/hashmap#HashMap}, etc. Create a new
 * LazySeq chain starting from the initial data, call various transformation
 * methods to map, group, filter, aggregate the data, and finally terminate the
 * chain by converting back to a data structure. Because most of the transformation
 * methods are lazy, the new terminating data structure can be built directly from the
 * transformed data in one pass.
 */
export class LazySeq<T> {
  /** Creates a new LazySeq from any Iterable
   *
   * @category Static Creation Methods
   */
  static of<T>(iter: Iterable<T>): LazySeq<T> {
    return new LazySeq(iter);
  }

  /** Creates a new LazySeq from any iterator
   *
   * @category Static Creation Methods
   *
   * @remarks
   * Like the [iterator protocol](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#The_iterator_protocol),
   * the iterator function is called each time the LazySeq is iterated.  Typically, you would use zero-argument
   * [generator function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*) to create the iterator.
   *
   * @example
   * ```typescript
   * const oddNums = LazySeq.ofIterator(function* () {
   *   for (let i = 1; i < 10; i += 2) {
   *     yield i;
   *   }
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

  /** Creates a new LazySeq from the keys and values of an object
   *
   * @category Static Creation Methods
   *
   * @remarks
   * Only the [own properties](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/hasOwnProperty) of the object are included.
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

  /** Creates a new LazySeq of numbers with a given start, end, and step
   *
   * @category Static Creation Methods
   *
   * @remarks
   * The range is inclusive of the start and exclusive of the end.  The step defaults to 1 and can be negative.
   * Note there is no infinite loop prevention, so make sure the step is not zero.
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

  /** Iterates the entries in the LazySeq
   *
   * @category Transformation
   *
   * @remarks
   * This is the default iteration when using `for .. of` directly on the `LazySeq`.
   */
  [Symbol.iterator](): Iterator<T> {
    return this.#iter[Symbol.iterator]();
  }

  /** Strictly combines entries which map to the same key
   *
   * @category Transformation
   *
   * @remarks
   * `aggregate` strictly transforms each entry in the LazySeq using the provided
   * `key` and `val` functions.  Entries which map to the same key are then combined
   * with the `combine` function.  Internally, this uses a javascript Map so the keys
   * must be strings or numbers.
   *
   * For more complex keys, use instead {@link LazySeq.toHashMap}, {@link LazySeq.buildHashMap}, {@link LazySeq.toOrderedMap}, or
   * {@link LazySeq.buildOrderedMap}.
   */
  aggregate<K, S>(
    key: (x: T) => K & JsMapKey,
    val: (x: T) => S,
    combine: (s1: S, s2: S) => S,
  ): LazySeq<readonly [K, S]> {
    const m = new Map<K, S>();
    for (const x of this.#iter) {
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

  /** Lazily appends the given value to the end of the LazySeq
   *
   * @category Transformation
   */
  append(x: T): LazySeq<T> {
    const iter = this.#iter;
    return LazySeq.ofIterator(function* () {
      yield* iter;
      yield x;
    });
  }

  /** Lazily splits the LazySeq into chunks of the given size
   *
   * @category Transformation
   *
   * @remarks
   * Each chunk except the final chunk will have exactly `size` entries.
   */
  chunk(size: number): LazySeq<ReadonlyArray<T>> {
    const iter = this.#iter;
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

  /** Lazily adds the specified iterable to the end of the LazySeq
   *
   * @category Transformation
   *
   * @remarks
   * In other words, when iterated the resulting LazySeq will first yield the
   * entries in the input LazySeq and then the entries in the iterable passed into `concat`.
   *
   * @example
   * ```typescript
   * const nums = LazySeq.of([1, 2, 3]).concat([4, 5, 6]);
   * for (const x of nums) {
   *  console.log(x);
   * });
   * // the above prints 1, 2, 3, 4, 5, 6
   * ```
   */
  concat(i: Iterable<T>): LazySeq<T> {
    const iter = this.#iter;
    return LazySeq.ofIterator(function* () {
      yield* iter;
      yield* i;
    });
  }

  /** Strictly calculates only the distinct entries in the LazySeq
   *
   * @category Transformation
   *
   * @remarks
   * Internally, this uses a javascript Set so the entries must be strings or numbers.
   * For more complex entries, use instead {@link LazySeq.distinctBy}, {@link LazySeq.toHashSet}
   * or {@link LazySeq.toOrderedSet}.
   */
  distinct(this: LazySeq<T & JsMapKey>): LazySeq<T> {
    const iter = this.#iter;
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

  /** Strictly calculates only the entries with distinct properties in the LazySeq
   *
   * @category Transformation
   *
   * @remarks
   * This method is given one or more property-extraction functions.  `distinctBy` then
   * calculates the distinct entries in the LazySeq based on the tuple of those properties
   * using a {@link ./api/hashmap#HashMap} internally, so properties must be {@link ./api/classes#ToHashable}.
   *
   * `distinctBy` and {@link LazySeq.toHashMap} are very similar; the main difference is that when
   * you have multiple properties you want to use, `distinctBy` internally handles creating a
   * custom key tuple.
   *
   * See also {@link LazySeq.distinctAndSortBy} if you want to sort the entries by the properties.
   */
  distinctBy(prop: ToHashable<T>, ...props: Array<ToHashable<T>>): LazySeq<T> {
    props.unshift(prop);
    const iter = this.#iter;
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

  /** Strictly calculates only the entries with distinct properties in the LazySeq and yields them in sorted order
   *
   * @category Transformation
   *
   * @remarks
   * This method is given one or more property-extraction functions.  `distinctAndSortBy` then
   * inserts them internally into a {@link ./api/orderedmap#OrderedMap} and yields them in ascending order.
   * Thus, all properties must implement {@link ./api/classes#ToComparable}.
   *
   * `distinctAndSortBy` and {@link LazySeq.toOrderedMap} are very similar; the main difference is that when
   * you have multiple properties you want to use, `distinctAndSortBy` internally handles creating a
   * custom key tuple.
   */
  distinctAndSortBy(prop: ToComparable<T>, ...props: Array<ToComparable<T>>): LazySeq<T> {
    props.unshift(prop);
    const cfg = {
      compare: mkCompareByProperties(...props),
    };
    let s: tree.MutableTreeNode<T, T> | null = null;
    function fst(old: T | undefined, x: T): T {
      return old === undefined ? x : old;
    }
    for (const x of this.#iter) {
      s = tree.mutateInsert(cfg, x, x, fst, s);
    }
    return LazySeq.ofIterator(() => tree.iterateAsc((k) => k, s));
  }

  /** Lazily skips over a given number of entries in the LazySeq
   *
   * @category Transformation
   *
   * @remarks
   * When the resulting LazySeq is iterated, the first `n` entries will be skipped.  If `n` is
   * larger than the total number of entries, the resulting LazySeq will be empty.
   */
  drop(n: number): LazySeq<T> {
    const iter = this.#iter;
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

  /** Lazily skips over entries until the specified predicate is false
   *
   * @category Transformation
   *
   * @remarks
   * When the resulting LazySeq is iterated, each entry is passed to the predicate function.
   * If an entry returns true, it is skipped.  If an entry returns false, it is yielded and
   * from then on the remainder of the entries are yielded unchanged.
   * Thus, only the initial prefix of entries for which the predicate returns true are skipped.
   */
  dropWhile(f: (x: T) => boolean): LazySeq<T> {
    const iter = this.#iter;
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

  /** Lazily filters the entries in the LazySeq to be only those returning true from a predicate function
   *
   * @category Transformation
   *
   * @remarks
   * This type signature using a [type predicate](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates)
   * to allow the correct type after filtering to be inferred.
   *
   * @example
   * ```typescript
   * function isFish(pet: Fish | Bird): pet is Fish {
   *   return (pet as Fish).swim !== undefined;
   *  }
   *
   * const animals: LazySeq<Fish | Bird> = LazySeq.of([sunfish, penguin, goldfish, albatross]);
   * const fish = animals.filter(isFish); // the type will be correctly inferred to be LazySeq<Fish>
   * ```
   */
  filter<S extends T>(f: (x: T) => x is S): LazySeq<S>;

  /** Lazily filters the entries in the LazySeq to be only those returning true from a predicate function
   *
   * @category Transformation
   */
  filter(f: (x: T) => boolean): LazySeq<T>;

  /** @internal */
  filter(f: (x: T) => boolean): LazySeq<T> {
    const iter = this.#iter;
    return LazySeq.ofIterator(function* () {
      for (const x of iter) {
        if (f(x)) {
          yield x;
        }
      }
    });
  }

  /** Lazily map each entry to multiple values and flatten all the resulting values into a single sequence
   *
   * @category Transformation
   */
  flatMap<S>(f: (x: T) => Iterable<S>): LazySeq<S> {
    const iter = this.#iter;
    return LazySeq.ofIterator(function* () {
      for (const x of iter) {
        yield* f(x);
      }
    });
  }

  /** Strictly group the values by one or more properties and yield the resulting groups
   *
   * @category Transformation
   *
   * @remarks
   * `groupBy` takes one or more property-extraction functions and groups the values by the
   * tuple of these properties.  For each tuple of properties, all values which have the same
   * tuple are combined into an array.  Internally, this uses a {@link ./api/hashmap#HashMap} so
   * the resulting groups appear in any order and thus properties must be hashable.
   * Use {@link LazySeq.orderedGroupBy} if the properties can only be compared but not hashed.
   *
   * This function is very similar to {@link LazySeq.toLookup}, but the main advantage of `groupBy`
   * is that you do not need to create a custom key class for a tuple of multiple properties.
   *
   * The `TupleOfHashProps` type is a helper type which extracts the type of each property and creates
   * a tuple of those types.
   *
   * @example
   * ```typescript
   * const seq = LazySeq.of([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
   * const groups = seq.groupBy(x => x % 2, x => x % 3);
   * // groups will consist of the following
   * // the first element of each group is the tuple of [x % 2, x % 3] and the second is the array of values
   * //   [ [0, 0], [6, 12] ]
   * //   [ [0, 1], [4, 10] ]
   * //   [ [0, 2], [2, 8] ]
   * //   [ [1, 0], [3, 9] ]
   * //   [ [1, 1], [1, 7] ]
   * //   [ [1, 2], [5, 11] ]
   * ```
   */
  groupBy<PropFn extends ToHashable<T>, PropFns extends ToHashable<T>[]>(
    propFn: PropFn,
    ...fs: PropFns
  ): LazySeq<[TupleOfHashProps<T, [PropFn, ...PropFns]>, ReadonlyArray<T>]> {
    fs.unshift(propFn);
    const cfg = {
      hash: (x: T) => hashValues(...fs.map((f) => f(x))),
      compare: mkCompareByProperties(...fs),
    };

    let s: hamt.MutableNode<T, Array<T>> | null = null;
    function appendVal(old: Array<T> | undefined, x: T): Array<T> {
      if (old === undefined) {
        return [x];
      } else {
        old.push(x);
        return old;
      }
    }
    for (const x of this.#iter) {
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
      }, s),
    );
  }

  /** Strictly group the values by one or more properties and yield the resulting groups
   *
   * @category Transformation
   *
   * @remarks
   * `orderedGroupBy` takes one or more property-extraction functions and groups the values by the
   * tuple of these properties.  For each tuple of properties, all values which have the same
   * tuple are combined into an array.  Internally, this uses an {@link ./api/orderedmap#OrderedMap} so
   * the resulting groups will appear in ascending order of key.
   *
   * This function is very similar to {@link LazySeq.toOrderedLookup}, but the main advantage of `orderedGroupBy`
   * is that you do not need to create a custom key class for a tuple of multiple properties.
   *
   * The `TupleOfCmpProps` type is a helper type which extracts the type of each property and creates
   * a tuple of those types.
   */
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
    for (const x of this.#iter) {
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
      }, s),
    );
  }

  /** Lazily apply a function to each entry in a LazySeq
   *
   * @category Transformation
   *
   * @remarks
   * Each element of the LazySeq is applied to the provided function `f`, along with
   * the zero-based index of the element.
   */
  map<S>(f: (x: T, idx: number) => S): LazySeq<S> {
    const iter = this.#iter;
    return LazySeq.ofIterator(function* () {
      let idx = 0;
      for (const x of iter) {
        yield f(x, idx);
        idx += 1;
      }
    });
  }

  /** Lazily apply a function to each entry in a LazySeq and only include those which are not null or undefined
   *
   * @category Transformation
   *
   * @remarks
   * Each element of the LazySeq is applied to the provided function `f`.  If the result is not null or
   * undefined, it is included in the resulting LazySeq.
   */
  collect<S>(f: (x: T) => S | null | undefined): LazySeq<S> {
    const iter = this.#iter;
    return LazySeq.ofIterator(function* () {
      for (const x of iter) {
        const y = f(x);
        if (y !== null && y !== undefined) {
          yield y;
        }
      }
    });
  }

  /** Lazily prepend the given value to the beginning of the LazySeq
   *
   * @category Transformation
   */
  prepend(x: T): LazySeq<T> {
    const iter = this.#iter;
    return LazySeq.ofIterator(function* () {
      yield x;
      yield* iter;
    });
  }

  /** Lazily adds the specified iterable to the beginning of the LazySeq
   *
   * @category Transformation
   *
   * @remarks
   * In other words, when iterated the resulting LazySeq will first yield the
   * entries in the iterable passed to `prependAll` and then after that yield the
   * entries in the LazySeq.
   */
  prependAll(i: Iterable<T>): LazySeq<T> {
    const iter = this.#iter;
    return LazySeq.ofIterator(function* () {
      yield* i;
      yield* iter;
    });
  }

  /** Strictly sort the values in the LazySeq using the provided comparison function
   *
   * @category Transformation
   *
   * @remarks
   * This produces a new sorted LazySeq and thus is intended to be used in the middle of a chain of
   * transformations.  If you want to terminate the LazySeq into a sorted data structure, use
   * {@link LazySeq.toSortedArray} or {@link LazySeq.toOrderedMap}.
   */
  sortWith(compare: (v1: T, v2: T) => number): LazySeq<T> {
    return LazySeq.of(Array.from(this.#iter).sort(compare));
  }

  /** Strictly sort the values in the LazySeq by the provided properties
   *
   * @category Transformation
   *
   * @remarks
   * `sortBy` takes one or more property-extraction functions.  The values are applied to each property-extraction
   * function and then sorted by the tuple of resulting properties.
   * This produces a new sorted LazySeq and thus is intended to be used in the middle of a chain of
   * transformations.  If you want to terminate the LazySeq into a sorted data structure, use
   * {@link LazySeq.toSortedArray} or {@link LazySeq.toOrderedMap}.
   */
  sortBy(prop: ToComparable<T>, ...props: ReadonlyArray<ToComparable<T>>): LazySeq<T> {
    return LazySeq.of(Array.from(this.#iter).sort(mkCompareByProperties(prop, ...props)));
  }

  /** Lazily create a LazySeq which iterates all but the first entry
   *
   * @category Transformation
   *
   * @remarks
   * If the LazySeq is empty, the resulting LazySeq will also be empty.  If the LazySeq is not empty,
   * all but the first entry will be included in the resulting LazySeq.
   *
   * @example
   * ```typescript
   * const s = LazySeq.of([1, 2, 3, 4, 5]);
   * for (const x of s.tail()) {
   *   console.log(x);
   * }
   * // prints 2, 3, 4, 5
   * ```
   */
  tail(): LazySeq<T> {
    const iter = this.#iter;
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

  /** Lazily take the initial specified number of entries in the LazySeq and ignore the rest
   *
   * @category Transformation
   *
   * @remarks
   * When the resulting LazySeq is iterated, the first `n` entries will be yielded.  If `n` is
   * larger than the total number of entries, the entire LazySeq will be yielded.  Any entries
   * beyond the first `n` will be ignored.
   */
  take(n: number): LazySeq<T> {
    const iter = this.#iter;
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

  /** Lazily takes entries while the specified predicate is true
   *
   * @category Transformation
   *
   * @remarks
   * When the resulting LazySeq is iterated, each entry is passed to the predicate function.
   * If an entry returns true, it is yielded.  As soon as an entry returns false, it
   * is not yielded and no more entries are processed.
   */
  takeWhile(f: (x: T) => boolean): LazySeq<T> {
    const iter = this.#iter;
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

  /** Lazily combine the LazySeq with an iterable entry by entry into tuples of size 2
   *
   * @category Transformation
   *
   * @remarks
   * Both the LazySeq and the iterable are jointly iterated element-by-element.  The elements
   * are combined into a tuple of size 2.  As soon as one of the iterators is exhausted, the
   * iteration ends and any remaining elements in the other iterator are ignored.
   *
   * @example
   * ```typescript
   * const s1 = LazySeq.of([1, 2, 3]);
   * const s2 = LazySeq.of(['a', 'b', 'c']);
   * const s3 = s1.zip(s2);
   * for (const [x, y] of s3) {
   *   console.log(x, y);
   * }
   * // prints 3 lines:
   * // 1 a
   * // 2 b
   * // 3 c
   * ```
   */
  zip<S>(other: Iterable<S>): LazySeq<readonly [T, S]> {
    const iter = this.#iter;
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

  /** Check if all entries in the LazySeq return true from the provided function
   *
   * @category Query
   *
   * @remarks
   * If the LazySeq is empty, this function returns true.
   */
  every(f: (x: T) => boolean): boolean {
    for (const x of this.#iter) {
      if (!f(x)) {
        return false;
      }
    }
    return true;
  }

  /** Check if any entry in the LazySeq return true from the provided function
   *
   * @category Query
   *
   * @remarks
   * If the LazySeq is empty, this function returns false.
   */
  some(f: (x: T) => boolean): boolean {
    for (const x of this.#iter) {
      if (f(x)) {
        return true;
      }
    }
    return false;
  }

  /** Returns true if the LazySeq is empty
   *
   * @category Query
   */
  isEmpty(): boolean {
    const first = this.#iter[Symbol.iterator]().next();
    return first.done === true;
  }

  /** Search for an entry which returns true when provided to `f`.
   *
   * @category Query
   *
   * @remarks
   * If found, the element is returned.  Otherwise, `undefined` is returned.
   */
  find(f: (v: T) => boolean): T | undefined {
    for (const x of this.#iter) {
      if (f(x)) {
        return x;
      }
    }
    return undefined;
  }

  /** Returns the first entry of the LazySeq or undefined if the LazySeq is empty.
   *
   * @category Query
   */
  head(): T | undefined {
    const first = this.#iter[Symbol.iterator]().next();
    if (first.done) {
      return undefined;
    } else {
      return first.value;
    }
  }

  /** Returns the length of the LazySeq
   *
   * @category Query
   */
  length(): number {
    let cnt = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _ of this.#iter) {
      cnt += 1;
    }
    return cnt;
  }

  /** Returns the maximum value in the LazySeq
   *
   * @category Query
   *
   * @remarks
   * If the LazySeq is empty, `undefined` is returned.  Otherwise, each function passed to `maxBy`
   * is applied to each entry in the LazySeq and the entry with the maximum value is returned.
   */
  maxBy(prop: ToComparable<T>, ...props: ReadonlyArray<ToComparable<T>>): T | undefined {
    const compare = mkCompareByProperties<T>(prop, ...props);
    let ret: T | undefined = undefined;
    for (const x of this.#iter) {
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

  /** Returns the minimum value in the LazySeq
   *
   * @category Query
   *
   * @remarks
   * If the LazySeq is empty, `undefined` is returned.  Otherwise, each function passed to `minBy`
   * is applied to each entry in the LazySeq and the entry with the minimum value is returned.
   */
  minBy(prop: ToComparable<T>, ...props: ReadonlyArray<ToComparable<T>>): T | undefined {
    const compare = mkCompareByProperties<T>(prop, ...props);
    let ret: T | undefined = undefined;
    for (const x of this.#iter) {
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

  /** Sums up the entries in the LazySeq
   *
   * @category Query
   *
   * @remarks
   * Applies the passed function to each entry in the LazySeq and sums up the results.
   * If the LazySeq is empty, 0 is returned.
   */
  sumBy(getNumber: (v: T) => number): number {
    let sum = 0;
    for (const x of this.#iter) {
      sum += getNumber(x);
    }
    return sum;
  }

  /** Converts the LazySeq to a readonly array
   *
   * @category Conversion
   */
  toRArray(): ReadonlyArray<T> {
    return Array.from(this.#iter);
  }

  /** Converts the LazySeq to an Array
   *
   * @category Conversion
   *
   * @remarks
   * In the spirit of immutability, you should prefer {@link LazySeq.toRArray} which returns a readonly array.
   */
  toMutableArray(): Array<T> {
    return Array.from(this.#iter);
  }

  /** Sorts the entries in the LazySeq and returns a readonly array
   *
   * @category Conversion
   *
   * @remarks
   * The entries are sorted by the properties returned by the passed functions.
   */
  toSortedArray(
    prop: ToComparable<T>,
    ...props: ReadonlyArray<ToComparable<T>>
  ): ReadonlyArray<T> {
    return Array.from(this.#iter).sort(mkCompareByProperties(prop, ...props));
  }

  /** Converts the entries in the LazySeq to a HashMap
   *
   * @category Conversion
   *
   * @remarks
   * This is a convenience function for {@link ./api/hashmap#HashMap.from} which creates a HashMap from a function
   * which converts the entries in the LazySeq to a tuple of a key and a value.  When a duplicate key is
   * found, the provided merge function is used to determine the value; see the docs for
   * {@link ./api/hashmap#HashMap.from} for details.  If you don't wish to merge values, {@link LazySeq.toLookup} and
   * {@link LazySeq.toLookupMap} keep all the duplicate values.
   */
  toHashMap<K, S extends NotUndefined>(
    f: (x: T) => readonly [K & HashKey, S],
    merge?: (v1: S, v2: S) => S,
  ): HashMap<K & HashKey, S> {
    return HashMap.from(this.map(f), merge);
  }

  /** Converts the entries in the LazySeq to a HashMap
   *
   * @category Conversion
   *
   * @remarks
   * This is a convenience function for {@link ./api/hashmap#HashMap.build} which creates a HashMap from a
   * key extraction function. With duplicate keys, the later value is used.  See the docs for {@link ./api/hashmap#HashMap.build} for details.
   * If you don't wish to overwrite values, {@link LazySeq.toLookup} and
   * {@link LazySeq.toLookupMap} keep all the duplicate values.
   */
  buildHashMap<K>(key: (x: T) => K & HashKey): HashMap<K & HashKey, T>;

  /** Converts the entries in the LazySeq to a HashMap
   *
   * @category Conversion
   *
   * @remarks
   * This is a convenience function for {@link ./api/hashmap#HashMap.build} which creates a HashMap from a
   * key extraction function and a value extraction function.  See the docs for
   * {@link ./api/hashmap#HashMap.build} for details.  If you don't wish to merge values, {@link LazySeq.toLookup} and
   * {@link LazySeq.toLookupMap} keep all the duplicate values.
   */
  buildHashMap<K, S extends NotUndefined>(
    key: (x: T) => K & HashKey,
    val: (old: S | undefined, t: T) => S,
  ): HashMap<K & HashKey, S>;

  /** @internal */
  buildHashMap<K, S extends NotUndefined>(
    key: (x: T) => K & HashKey,
    val?: (old: S | undefined, t: T) => S,
  ): HashMap<K & HashKey, S> {
    return HashMap.build(this.#iter, key, val as (old: S | undefined, t: T) => S);
  }

  /** Converts the entries in the LazySeq to an OrderedMap
   *
   * @category Conversion
   *
   * @remarks
   * This is a convenience function for {@link ./api/orderedmap#OrderedMap.from} which creates an OrderedMap from a function
   * which converts the entries in the LazySeq to a tuple of a key and a value.  When a duplicate key is
   * found, the provided merge function is used to determine the value; see the docs for
   * {@link ./api/orderedmap#OrderedMap.from} for details.
   * If you don't wish to overwrite values, {@link LazySeq.toOrderedLookup} and
   * {@link LazySeq.toOrderedLookup} keep all the duplicate values.
   */
  toOrderedMap<K, S extends NotUndefined>(
    f: (x: T) => readonly [K & OrderedMapKey, S],
    merge?: (v1: S, v2: S) => S,
  ): OrderedMap<K & OrderedMapKey, S> {
    return OrderedMap.from(this.map(f), merge);
  }

  /** Converts the entries in the LazySeq to an OrderedMap
   *
   * @category Conversion
   *
   * @remarks
   * This is a convenience function for {@link ./api/orderedmap#OrderedMap.build} which creates an OrderedMap from a
   * key extraction function.  When a duplicate key is found, the value is overwritten with the later value.
   * See the docs for {@link ./api/orderedmap#OrderedMap.build} for details.
   * If you don't wish to overwrite values, {@link LazySeq.toOrderedLookup} and
   * {@link LazySeq.toLookupOrderedMap} keep all the duplicate values.
   */
  buildOrderedMap<K>(key: (x: T) => K & OrderedMapKey): OrderedMap<K & OrderedMapKey, T>;

  /** Converts the entries in the LazySeq to an OrderedMap
   *
   * @category Conversion
   *
   * @remarks
   * This is a convenience function for {@link ./api/orderedmap#OrderedMap.build} which creates an OrderedMap from a
   * key extraction function and a value extraction function.  See the docs for
   * {@link ./api/orderedmap#OrderedMap.build} for details.
   * If you don't wish to merge values, {@link LazySeq.toOrderedLookup} and
   * {@link LazySeq.toLookupOrderedMap} keep all the duplicate values.
   */
  buildOrderedMap<K, S extends NotUndefined>(
    key: (x: T) => K & OrderedMapKey,
    val: (old: S | undefined, t: T) => S,
  ): OrderedMap<K & OrderedMapKey, S>;

  /** @internal */
  buildOrderedMap<K, S extends NotUndefined>(
    key: (x: T) => K & OrderedMapKey,
    val?: (old: S | undefined, t: T) => S,
  ): OrderedMap<K & OrderedMapKey, S> {
    return OrderedMap.build(this.#iter, key, val as (old: S | undefined, t: T) => S);
  }

  /** Converts the entries of the LazySeq to a readonly JS Map
   *
   * @category Conversion
   *
   * @remarks
   * This function builds a [JS Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) from the entries in the LazySeq.
   * Each entry in the LazySeq is convered to a tuple of key and value using the provided function.  If a duplicate key is found, the provided merge
   * function is called to determine the value for the key.  If no merge function is provided, the last value for the key is used.
   * If you don't wish to merge values, {@link LazySeq.toRLookup} keeps all the duplicate values.
   */
  toRMap<K, S>(
    f: (x: T) => readonly [K & JsMapKey, S],
    merge?: (v1: S, v2: S) => S,
  ): ReadonlyMap<K, S> {
    return this.toMutableMap(f, merge);
  }

  /** Converts the entries of the LazySeq to a JS Map
   *
   * @category Conversion
   *
   * @remarks
   * This function builds a [JS Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) from the entries in the LazySeq.
   * Each entry in the LazySeq is convered to a tuple of key and value using the provided function.  If a duplicate key is found, the provided merge
   * function is called to determine the value for the key.  If no merge function is provided, the last value for the key is used.
   *
   * In the spirit of immutability, {@link LazySeq.toRMap} is preferred over this function unless neccisary.
   */
  toMutableMap<K, S>(
    f: (x: T) => readonly [K & JsMapKey, S],
    merge?: (v1: S, v2: S) => S,
  ): Map<K, S> {
    const m = new Map<K, S>();
    for (const x of this.#iter) {
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

  /** Converts the entries of the LazySeq to a JS Object
   *
   * @category Conversion
   *
   * @remarks
   * This function builds a javascript object from the entries in the LazySeq.
   * Each entry in the LazySeq is convered to a tuple of key and value using the provided function.  If a duplicate key is found, the provided merge
   * function is called to determine the value for the key.  If no merge function is provided, the last value for the key is used.
   */
  toObject<S>(
    f: (x: T) => readonly [string, S],
    merge?: (v1: S, v2: S) => S,
  ): { [key: string]: S };

  /** Converts the entries of the LazySeq to a JS Object
   *
   * @category Conversion
   *
   * @remarks
   * This function builds a javascript object from the entries in the LazySeq.
   * Each entry in the LazySeq is convered to a tuple of key and value using the provided function.  If a duplicate key is found, the provided merge
   * function is called to determine the value for the key.  If no merge function is provided, the last value for the key is used.
   */
  toObject<S>(
    f: (x: T) => readonly [number, S],
    merge?: (v1: S, v2: S) => S,
  ): { [key: number]: S };

  /** @internal */
  toObject<S>(
    f: (x: T) => readonly [string | number, S],
    merge?: (v1: S, v2: S) => S,
  ): { [key: string | number]: S } {
    const m: { [key: string | number]: S } = {};
    for (const x of this.#iter) {
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

  /** Converts the entries in the LazySeq to a HashSet
   *
   * @category Conversion
   *
   * @remarks
   * This is a convenience function for {@link ./api/hashset#HashSet.build} which creates a HashSet from a function
   * which converts the entries in the LazySeq to a hashable value.
   */
  toHashSet<S>(converter: (x: T) => S & HashKey): HashSet<S & HashKey> {
    return HashSet.build(this.#iter, converter);
  }

  /** Converts the entries in the LazySeq to an OrderedSet
   *
   * @category Conversion
   *
   * @remarks
   * This is a convenience function for {@link ./api/orderedset#OrderedSet.build} which creates an OrderedSet from a function
   * which converts the entries in the LazySeq to an orderable value.
   */
  toOrderedSet<S>(converter: (x: T) => S & OrderedMapKey): OrderedSet<S & OrderedMapKey> {
    return OrderedSet.build(this.#iter, converter);
  }

  /** Converts the entries in the LazySeq to a JS Set
   *
   * @category Conversion
   *
   * @remarks
   * `toRSet` converts the entries in the LazySeq to a readonly
   * [JS Set](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set).
   */
  toRSet<S>(converter: (x: T) => S & JsMapKey): ReadonlySet<S> {
    return this.toMutableSet(converter);
  }

  /** Converts the entries in the LazySeq to a JS Set
   *
   * @category Conversion
   *
   * @remarks
   * `toRSet` converts the entries in the LazySeq to a mutable
   * [JS Set](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set).
   * In the spirit of immutability, {@link LazySeq.toRSet} is preferred over this function unless neccisary.
   */
  toMutableSet<S>(converter: (x: T) => S & JsMapKey): Set<S> {
    const s = new Set<S>();
    for (const x of this.#iter) {
      s.add(converter(x));
    }
    return s;
  }

  /** Reduce all the entries in the LazySeq to a single value
   *
   * @category Conversion
   *
   * @remarks
   * `fold` reduces all the entries in the LazySeq to a single value using the provided function.  The function
   * combines elements in order from the LazySeq, with the first element being combined with the zero value, and
   * then the result of that combination is combined with the second element, and so on.
   */
  fold<S>(zero: S, f: (soFar: S, cur: T) => S): S {
    let soFar = zero;
    for (const x of this.#iter) {
      soFar = f(soFar, x);
    }
    return soFar;
  }

  /** Reduce all the entries in the LazySeq to a single value
   *
   * @category Conversion
   *
   * @remarks
   * `reduce` works the same as [Array.reduce](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce).
   * When given with no initial value, the accumulator is initialized to the first element of the LazySeq and the combining function
   * is called starting with the second value.  An error is thrown if the LazySeq is empty.
   */
  reduce(f: (soFar: T, cur: T) => T): T;

  /** Reduce all the entries in the LazySeq to a single value
   *
   * @category Conversion
   *
   * @remarks
   * `reduce` works the same as [Array.reduce](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/reduce)
   * and when givin an initial value is the same as {@link LazySeq.fold}.  The initial value is combined with the first element, the result
   * of that combination is combined with the second element, and so on.
   */
  reduce<S>(f: (soFar: S, cur: T) => S, initialValue: S): S;

  /** @internal */
  reduce<S>(f: (soFar: S, cur: T) => S, initialValue?: S): S {
    if (initialValue === undefined) {
      let first = true;
      let soFar: S | undefined = undefined;
      for (const x of this.#iter) {
        if (first) {
          first = false;
          soFar = x as unknown as S;
        } else {
          soFar = f(soFar as S, x);
        }
      }
      if (first) {
        throw new Error("Empty sequence");
      } else {
        return soFar as S;
      }
    } else {
      return this.fold(initialValue, f);
    }
  }

  /** Apply a function to the LazySeq
   *
   * @category Conversion
   *
   * @remarks
   * Applies the provided function `f` to `this` and returns the result.  This is a convenience function
   * which allows you to continue to chain operations without having to create a new
   * temporary variable.
   */
  transform<U>(f: (s: LazySeq<T>) => U): U {
    return f(this);
  }

  /** Group entries in the LazySeq by a key, returning a HashMap with an array of values
   *
   * @category Grouping
   *
   * @remarks
   * The key function is used to extract a key for each entry and then entries are grouped by a key.  All the values that
   * have the same key are collected into an array and returned in a {@link ./api/hashmap#HashMap}.
   */
  toLookup<K>(key: (x: T) => K & HashKey): HashMap<K & HashKey, ReadonlyArray<T>>;

  /** Group entries in the LazySeq by a key, returning a HashMap with an array of values
   *
   * @category Grouping
   *
   * @remarks
   * Each element in the LazySeq is converted to a key and a value using the provided functions.
   * The keys are used to group the values into an array and the result is returned in a {@link ./api/hashmap#HashMap}.
   */
  toLookup<K, S>(
    key: (x: T) => K & HashKey,
    val: (x: T) => S,
  ): HashMap<K & HashKey, ReadonlyArray<S>>;

  /** @internal */
  toLookup<K, S>(
    key: (x: T) => K & HashKey,
    val?: (x: T) => S,
  ): HashMap<K & HashKey, ReadonlyArray<S>> {
    let merge: (old: Array<S> | undefined, t: T) => Array<S>;
    if (val === undefined) {
      merge = (old, t) => {
        if (old === undefined) {
          return [t as unknown as S];
        } else {
          old.push(t as unknown as S);
          return old;
        }
      };
    } else {
      merge = (old, t) => {
        if (old === undefined) {
          return [val(t)];
        } else {
          old.push(val(t));
          return old;
        }
      };
    }
    return HashMap.build(this.#iter, key, merge);
  }

  /** Group entries in the LazySeq by a key, returning an OrderedMap with an array of values
   *
   * @category Grouping
   *
   * @remarks
   * The key function is used to extract a key for each entry and then entries are grouped by a key.  All the values that
   * have the same key are collected into an array and returned in an {@link ./api/orderedmap#OrderedMap}.
   */
  toOrderedLookup<K>(
    key: (x: T) => K & OrderedMapKey,
  ): OrderedMap<K & OrderedMapKey, ReadonlyArray<T>>;

  /** Group entries in the LazySeq by a key, returning an OrderedMap with an array of values
   *
   * @category Grouping
   *
   * @remarks
   * Each element in the LazySeq is converted to a key and a value using the provided functions.
   * The keys are used to group the values into an array and the result is returned in an {@link ./api/orderedmap#OrderedMap}.
   */
  toOrderedLookup<K, S>(
    key: (x: T) => K & OrderedMapKey,
    val: (x: T) => S,
  ): OrderedMap<K & OrderedMapKey, ReadonlyArray<S>>;

  /** @internal */
  toOrderedLookup<K, S>(
    key: (x: T) => K & OrderedMapKey,
    val?: (x: T) => S,
  ): OrderedMap<K & OrderedMapKey, ReadonlyArray<S>> {
    let merge: (old: Array<S> | undefined, t: T) => Array<S>;
    if (val === undefined) {
      merge = (old, t) => {
        if (old === undefined) {
          return [t as unknown as S];
        } else {
          old.push(t as unknown as S);
          return old;
        }
      };
    } else {
      merge = (old, t) => {
        if (old === undefined) {
          return [val(t)];
        } else {
          old.push(val(t));
          return old;
        }
      };
    }
    return OrderedMap.build(this.#iter, key, merge);
  }

  /** Group entries in the LazySeq by two keys, returning a HashMap of HashMaps
   *
   * @category Grouping
   *
   * @remarks
   * All entries in the LazySeq are first grouped by `key1`.  For each `key1`, all the values that share the same `key1`
   * are then grouped by `key2`.  Entries with the same `key1` and `key2` overwrite previous entries with the same keys
   * (see the more general `toLookupMap` for a version with a merge function).  The result is a {@link ./api/hashmap#HashMap} of
   * {@link ./api/hashmap#HashMap}s.
   */
  toLookupMap<K1, K2>(
    key1: (x: T) => K1 & HashKey,
    key2: (x: T) => K2 & HashKey,
  ): HashMap<K1 & HashKey, HashMap<K2 & HashKey, T>>;

  /** Group entries in the LazySeq by two keys, returning a HashMap of HashMaps
   *
   * @category Grouping
   *
   * @remarks
   * All entries in the LazySeq are passed to the provided functions to extract a `key1`, `key2`, and value.
   * They are then first grouped by `key1`.  For each `key1`, all the values that share the same `key1`
   * are then grouped by `key2`.  Entries with the same `key1` and `key2` are either merged using the `mergeVals` function
   * if it is provided, otherwise values later in the LazySeq overwrite previous values with the same keys.
   * The result is a {@link ./api/hashmap#HashMap} of {@link ./api/hashmap#HashMap}s.
   */
  toLookupMap<K1, K2, S extends NotUndefined>(
    key1: (x: T) => K1 & HashKey,
    key2: (x: T) => K2 & HashKey,
    val: (x: T) => S,
    mergeVals?: (v1: S, v2: S) => S,
  ): HashMap<K1 & HashKey, HashMap<K2 & HashKey, S>>;

  /** @internal */
  toLookupMap<K1, K2, S extends NotUndefined>(
    key1: (x: T) => K1 & HashKey,
    key2: (x: T) => K2 & HashKey,
    val?: (x: T) => S,
    mergeVals?: (v1: S, v2: S) => S,
  ): HashMap<K1 & HashKey, HashMap<K2 & HashKey, S>> {
    let merge: (
      old: HashMap<K2 & HashKey, S> | undefined,
      t: T,
    ) => HashMap<K2 & HashKey, S>;
    if (val === undefined) {
      merge = (old, t) => (old ?? HashMap.empty()).set(key2(t), t as unknown as S);
    } else if (mergeVals === undefined) {
      merge = (old, t) => (old ?? HashMap.empty()).set(key2(t), val(t));
    } else {
      merge = (old, t) =>
        (old ?? HashMap.empty()).alter(key2(t), (oldV) =>
          oldV === undefined ? val(t) : mergeVals(oldV as unknown as S, val(t)),
        );
    }

    return HashMap.build(this.#iter, key1, merge);
  }

  /** Group entries in the LazySeq by two keys, returning an OrderedMap of OrderedMaps
   *
   * @category Grouping
   *
   * @remarks
   * All entries in the LazySeq are first grouped by `key1`.  For each `key1`, all the values that share the same `key1`
   * are then grouped by `key2`.  Entries with the same `key1` and `key2` overwrite previous entries with the same keys
   * (see the more general `toLookupOrderedMap` for a version with a merge function).  The result is an {@link ./api/orderedmap#OrderedMap} of
   * {@link ./api/orderedmap#OrderedMap}s.
   */
  toLookupOrderedMap<K1, K2>(
    key1: (x: T) => K1 & OrderedMapKey,
    key2: (x: T) => K2 & OrderedMapKey,
  ): OrderedMap<K1 & OrderedMapKey, OrderedMap<K2 & OrderedMapKey, T>>;

  /** Group entries in the LazySeq by two keys, returning an OrderedMap of OrderedMaps
   *
   * @category Grouping
   *
   * @remarks
   * All entries in the LazySeq are passed to the provided functions to extract a `key1`, `key2`, and value.
   * They are then first grouped by `key1`.  For each `key1`, all the values that share the same `key1`
   * are then grouped by `key2`.  Entries with the same `key1` and `key2` are either merged using the `mergeVals` function
   * if it is provided, otherwise values later in the LazySeq overwrite previous values with the same keys.
   * The result is a {@link ./api/orderedmap#OrderedMap} of {@link ./api/orderedmap#OrderedMap}s.
   */
  toLookupOrderedMap<K1, K2, S>(
    key1: (x: T) => K1 & OrderedMapKey,
    key2: (x: T) => K2 & OrderedMapKey,
    val: (x: T) => S,
    mergeVals?: (v1: S, v2: S) => S,
  ): OrderedMap<K1 & OrderedMapKey, OrderedMap<K2 & OrderedMapKey, S>>;

  /** @internal */
  toLookupOrderedMap<K1, K2, S extends NotUndefined>(
    key1: (x: T) => K1 & OrderedMapKey,
    key2: (x: T) => K2 & OrderedMapKey,
    val?: (x: T) => S,
    mergeVals?: (v1: S, v2: S) => S,
  ): OrderedMap<K1 & OrderedMapKey, OrderedMap<K2 & OrderedMapKey, S>> {
    let merge: (
      old: OrderedMap<K2 & OrderedMapKey, S> | undefined,
      t: T,
    ) => OrderedMap<K2 & OrderedMapKey, S>;
    if (val === undefined) {
      merge = (old, t) => (old ?? OrderedMap.empty()).set(key2(t), t as unknown as S);
    } else if (mergeVals === undefined) {
      merge = (old, t) => (old ?? OrderedMap.empty()).set(key2(t), val(t));
    } else {
      merge = (old, t) =>
        (old ?? OrderedMap.empty()).alter(key2(t), (oldV) =>
          oldV === undefined ? val(t) : mergeVals(oldV as unknown as S, val(t)),
        );
    }
    return OrderedMap.build(this.#iter, key1, merge);
  }

  /** Group entries in the LazySeq by a key, returning a Javascript Map with an array of values
   *
   * @category Grouping
   *
   * @remarks
   * The key function is used to extract a key for each entry and then entries are grouped by a key.  All the values that
   * have the same key are collected into an array and returned in an [JS Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map).
   */
  toRLookup<K>(key: (x: T) => K): ReadonlyMap<K, ReadonlyArray<T>>;

  /** Group entries in the LazySeq by a key, returning a Javascript Map with an array of values
   *
   * @category Grouping
   *
   * @remarks
   * Each element in the LazySeq is converted to a key and a value using the provided functions.
   * The keys are used to group the values into an array and the result is returned in an
   * [JS Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map).
   */
  toRLookup<K, S>(key: (x: T) => K, val: (x: T) => S): ReadonlyMap<K, ReadonlyArray<S>>;

  /** @internal */
  toRLookup<K, S>(
    key: (x: T) => K,
    val?: (x: T) => S,
  ): ReadonlyMap<K, ReadonlyArray<T | S>> {
    const m = new Map<K, Array<T | S>>();
    for (const x of this.#iter) {
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

  /** @internal */
  #iter: Iterable<T>;

  private constructor(iter: Iterable<T>) {
    this.#iter = iter;
  }
}
