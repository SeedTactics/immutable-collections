/* Copyright John Lenz, BSD license, see LICENSE file for details */

/** Interface allowing custom key objects in an OrderedMap
 *
 * @category Comparison Utils
 *
 * @remarks
 * If you wish to use a custom object as a key in a HashMap or OrderedMap, you must implement the `compare` function.
 * The `compare` function should return a negative number if `this < other`, return zero if `this` equals `other`, and
 * return a positive number if `this > other`.  A common technique is to use subtraction to compare numbers
 * and [String.localeCompare](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/localeCompare)
 * to compare srings.  Comparing multiple properties can either use a sequence of `if` statements or use `||` to combine.
 *
 * @example
 * ```ts
 * class SomeKey {
 *  public readonly a: number;
 *  public readonly b: string;
 *  constructor(a: number, b: string) {
 *    this.a = a;
 *    this.b = b;
 *  }
 *
 *  compare(other: SomeKey): number {
 *    return (this.a - other.a) || this.b.localeCompare(other.b);
 *  }
 * }
 * ```
 */
export type ComparableObj = {
  compare(other: ComparableObj): number;
};

export function isComparableObj(o: unknown): o is ComparableObj {
  return o !== null && typeof o === "object" && "compare" in o;
}

/** The possible types for a key in an OrderedMap
 *
 * @category Comparison Utils
 */
export type OrderedMapKey = string | number | boolean | Date | ComparableObj;

/** A function which converts or extracts a comparable value
 *
 * @category Comparison Utils
 *
 * @remarks
 * This is used primarily by {@link ../lazyseq#LazySeq} to extract comparable values from an object for grouping.
 */
export type ToComparableBase<T> =
  | ((t: T) => number | null)
  | ((t: T) => string | null)
  | ((t: T) => boolean | null)
  | ((t: T) => Date | null)
  | ((t: T) => ComparableObj | null);

/** A function which converts or extracts a comparable value and a direction
 *
 * @category Comparison Utils
 *
 * @remarks
 * This is used primarily by {@link ../lazyseq#LazySeq} to extract comparable values from an object for grouping,
 * while also allowing you to specify if the ordering should be in ascending or descending order.
 * For example, see {@link ../lazyseq#LazySeq.distinctAndSortBy}.
 */
export type ToComparable<T> =
  | { asc: ToComparableBase<T> }
  | { desc: ToComparableBase<T> }
  | ToComparableBase<T>;

export type ReturnOfComparable<T, F extends ToComparable<T>> = F extends {
  asc: (t: T) => infer R;
}
  ? R
  : F extends { desc: (t: T) => infer R }
  ? R
  : F extends (t: T) => infer R
  ? R
  : never;

export function evalComparable<T, F extends ToComparable<T>>(
  f: F,
  t: T,
): ReturnOfComparable<T, F> {
  if ("asc" in f) {
    return (f as { asc: ToComparableBase<T> }).asc(t) as ReturnOfComparable<T, F>;
  } else if ("desc" in f) {
    return (f as { desc: ToComparableBase<T> }).desc(t) as ReturnOfComparable<T, F>;
  } else {
    return f(t) as ReturnOfComparable<T, F>;
  }
}

/** Combine multiple comparable properties into a single comparison function
 *
 * @category Comparison Utils
 *
 * @remarks
 * `mkCompareByProperties` will return a comparison function for the type `T` which
 * compares multiple properties in order.  Each property is specified by an
 * extraction function which extracts the property from the type `T`.  The comparison
 * function will compare each property in order, returning as soon as a single property is
 * not equal.  Strings are compared using
 * [localeCompare](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/localeCompare).
 *
 * This function can optionally be used to implement {@link ComparableObj}, but typically
 * a direct implementation is shorter.  `mkCompareByProperties` is instead used primarily
 * by {@link ../lazyseq#LazySeq}.
 *
 * @example
 * ```ts
 * type Foo = {
 *   readonly someNum: number;
 *   readonly someStr: string;
 * }
 *
 * const compareFoo: (a: Foo, b: Foo) => -1 | 0 | 1 = mkCompareByProperties(
 *   f => f.someNum,
 *   { desc: f => f.someStr }
 * );
 *
 * console.log(compareFoo(
 *   { someNum: 1, someStr: "Hello"},
 *   { someNum: 2, someStr: "Hello"}
 * )); // prints -1
 * console.log(compareFoo(
 *   { someNum: 42, someStr: "AAA"},
 *   { someNum: 42, someStr: "ZZZ"}
 * )); // prints 1 due to descending ordering of the strings
 * ```
 */
export function mkCompareByProperties<T>(
  ...getKeys: ReadonlyArray<ToComparable<T>>
): (a: T, b: T) => -1 | 0 | 1 {
  return (x, y) => {
    for (const getKey of getKeys) {
      if ("desc" in getKey) {
        const a = getKey.desc(x);
        const b = getKey.desc(y);
        if (typeof a === "string" && typeof b === "string") {
          const cmp = a.localeCompare(b);
          if (cmp === 0) {
            continue;
          } else {
            return cmp < 0 ? 1 : -1;
          }
        } else if (isComparableObj(a) && b !== null) {
          const c = a.compare(b as ComparableObj);
          if (c === 0) {
            continue;
          } else {
            return c < 0 ? 1 : -1;
          }
        } else {
          if (a === b) {
            continue;
          } else if (a === null) {
            return -1;
          } else if (b === null) {
            return 1;
          } else {
            return a < b ? 1 : -1;
          }
        }
      } else {
        const f = "asc" in getKey ? getKey.asc : getKey;
        const a = f(x);
        const b = f(y);
        if (typeof a === "string" && typeof b === "string") {
          const cmp = a.localeCompare(b);
          if (cmp === 0) {
            continue;
          } else {
            return cmp < 0 ? -1 : 1;
          }
        } else if (isComparableObj(a) && b !== null) {
          const c = a.compare(b as ComparableObj);
          if (c === 0) {
            continue;
          } else {
            return c < 0 ? -1 : 1;
          }
        } else {
          if (a === b) {
            continue;
          } else if (a === null) {
            return 1;
          } else if (b === null) {
            return -1;
          } else {
            return a < b ? -1 : 1;
          }
        }
      }
    }
    return 0;
  };
}

export type ComparisionConfig<K> = {
  readonly compare: (a: K, b: K) => number;
};

type InternalComparisonConfig<K> = {
  -readonly [k in keyof ComparisionConfig<K>]: ComparisionConfig<K>[k];
};

export function boolCompare(a: boolean, b: boolean): number {
  return a === b ? 0 : a ? 1 : -1;
}

export function numCompare(a: number, b: number): number {
  return a - b;
}

export function stringCompare(a: string, b: string): number {
  return a.localeCompare(b);
}

export function dateCompare(a: Date, b: Date): number {
  return a.getTime() - b.getTime();
}

export function objCompare(a: ComparableObj, b: ComparableObj): number {
  return a.compare(b);
}

// We have a small hack here.  At the time of creation, we don't know the
// key type of the map.  We only know the type the first time a key/value is
// inserted.  Therefore, for the initial empty map, we use a map config
// which checks the type of the key and then replace the configuration with the correct one.

export function mkComparisonConfig<K extends OrderedMapKey>(): ComparisionConfig<K> {
  // eslint-disable-next-line prefer-const
  let m: InternalComparisonConfig<K>;

  function updateConfig(k: K): void {
    switch (typeof k) {
      case "object":
        if (k instanceof Date) {
          m.compare = dateCompare as unknown as (a: K, b: K) => number;
          return;
        } else if (isComparableObj(k)) {
          m.compare = objCompare as unknown as (a: K, b: K) => number;
          return;
        } else {
          throw new Error("key type must have compare method");
        }

      case "string":
        m.compare = stringCompare as unknown as (a: K, b: K) => number;
        return;

      case "number":
        m.compare = numCompare as unknown as (a: K, b: K) => number;
        return;

      case "boolean":
        m.compare = boolCompare as unknown as (a: K, b: K) => number;
        return;
    }
  }

  function firstCompare(x: K, y: K): number {
    updateConfig(x);
    return m.compare(x, y);
  }

  m = { compare: firstCompare };

  return m;
}
