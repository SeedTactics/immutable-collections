/* Copyright John Lenz, BSD license, see LICENSE file for details */

import {
  ComparableObj,
  ComparisonConfig,
  dateCompare,
  objCompare,
  numCompare,
  boolCompare,
  stringCompare,
} from "./comparison.js";

/** Interface allowing custom key objects in a HashMap
 *
 * @category Hash Utils
 *
 * @remarks
 * If you wish to use a custom object as a key in a HashMap, you must implement the `hash` function
 * defined in the HashableObj type and the `compare` function defined in the {@link ComparableObj} type.
 * The hash value must be a 32-bit integer.  The {@link hashValues} function can help implementing
 * the hash function.
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
 *  hash(): number {
 *    return hashValues(this.a, this.b);
 *  }
 *
 *  compare(other: SomeKey): number {
 *    return (this.a - other.a) || this.b.localeCompare(other.b);
 *  }
 * }
 * ```
 */
export type HashableObj = {
  hash(): number;
};

export function isHashableObj(k: unknown): k is HashableObj {
  return k !== null && typeof k === "object" && "hash" in k;
}

/** A function which converts or extracts a hashable value
 *
 * @category Hash Utils
 *
 * @remarks
 * This is used primarily by {@link ../lazyseq#LazySeq} to extract hashable values from an object for grouping.
 * For example, see {@link ../lazyseq#LazySeq.groupBy}.
 */
export type ToHashable<T> =
  | ((t: T) => number | null)
  | ((t: T) => string | null)
  | ((t: T) => boolean | null)
  | ((t: T) => Date | null)
  | ((t: T) => (HashableObj & ComparableObj) | null);

/** The possible types for a key in a HashMap
 *
 * @category Hash Utils
 */
export type HashKey = string | number | boolean | Date | (HashableObj & ComparableObj);

/** The configuration for a HashMap
 *
 * @category Hash Utils
 *
 * @remarks
 * This combines a {@link ./tree#ComparisonConfig} with a hash function for the key type.
 *
 * A `HashConfig` is passed to most functions manipulating the HAMT data structure.  You only need one
 * `HashConfig` per key type so you can store a single `HashConfig` in a global variable per key type.
 * The {@link hashValues} function can help implement the hash function if you do not have security
 * considerations.
 */
export type HashConfig<K> = ComparisonConfig<K> & {
  readonly hash: (v: K) => number;
};

type InternalHashConfig<K> = {
  -readonly [k in keyof HashConfig<K>]: HashConfig<K>[k];
};

// the tree uses the hash value in javascript bit operations, and javascript bit operations cast
// the number to a signed 32-bit integer.  Thus each hash function should return a number which
// is within the range of a signed 32-bit integer.

// https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function
// NOTE: NOT SECURE!!!!!
// Users must use something like highwayhash for secure https://github.com/google/highwayhash

function hash2Ints(h1: number, h2: number): number {
  // combines two 32-bit hashes into a 32-bit hash
  return (h1 * 16777619) ^ h2;
}

function stringHash(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash = hash2Ints(hash, str.charCodeAt(i));
  }
  return hash2Ints(hash, str.length);
}

function boolHash(a: boolean): number {
  return a ? 1 : 0;
}

function numHash(a: number): number {
  // numbers are in general a IEEE double
  if (Number.isInteger(a) && a >= -2_147_483_648 && a <= 2_147_483_647) {
    return a; // hash is just the number itself since it is a 32-bit signed integer
  } else if (Object.is(a, Infinity) || Object.is(a, NaN)) {
    return 0;
  } else {
    // convert the number to a 64-bit array and combine the two 32-bit halves
    const buff = new ArrayBuffer(8);
    new Float64Array(buff)[0] = a;
    const intarr = new Int32Array(buff);
    return hash2Ints(hash2Ints(2166136261, intarr[0]), intarr[1]);
  }
}

function dateHash(d: Date): number {
  return numHash(d.getTime());
}

/** Combine multiple hashable values into a single hash
 *
 * @category Hash Utils
 *
 * @remarks
 * Useful helper function to hash multiple values to a single hash.
 * This uses the [FNV-1 hash function](https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function), which is
 * **NOT** secure.  If you need a secure hash, use something like [highwayhash](https://github.com/google/highwayhash#third-party-implementations--bindings)
 * and implement a custom {@link HashableObj} interface.
 */
export function hashValues(
  ...vals: ReadonlyArray<
    string | number | boolean | Date | HashableObj | null | undefined
  >
): number {
  let hash = vals.length === 1 ? 0 : 2166136261;
  for (let i = 0; i < vals.length; i++) {
    const p = vals[i];
    if (p === null || p === undefined) {
      hash = hash2Ints(hash, 0);
    } else {
      switch (typeof p) {
        case "string":
          hash = hash2Ints(hash, stringHash(p));
          break;
        case "number":
          hash = hash2Ints(hash, numHash(p));
          break;
        case "boolean":
          hash = hash2Ints(hash, boolHash(p));
          break;
        default:
          if (p instanceof Date) {
            hash = hash2Ints(hash, numHash(p.getTime()));
          } else if (isHashableObj(p)) {
            hash = hash2Ints(hash, p.hash());
          } else {
            // typescript should prevent this from happening
            hash = hash2Ints(
              hash,
              stringHash((p as unknown as { toString: () => string }).toString()),
            );
          }
          break;
      }
    }
  }
  if (vals.length === 1) {
    return hash;
  } else {
    return hash2Ints(hash, vals.length);
  }
}

// We have a small hack here.  At the time of creation, we don't know the
// key type of the map.  We only know the type the first time a key/value is
// inserted.  Therefore, for the initial empty map, we use a map config
// for the keyEq and hash function which check the type of the key and then
// replace the configuration with the correct one.

/** Create a HashConfig based on the key type
 *
 * @category Hash Utils
 *
 * @remarks
 * This function is used to create a {@link HashConfig} based on the type of key.  It supports
 * numbers, strings, booleans, dates, and objects which implement the {@link HashableObj} interface.
 * Note that this uses {@link hashValues} and is thus NOT cryptographically secure.
 */
export function mkHashConfig<K extends HashKey>(): HashConfig<K> {
  // eslint-disable-next-line prefer-const
  let m: InternalHashConfig<K>;

  function updateConfig(k: K): void {
    switch (typeof k) {
      case "object":
        if (k instanceof Date) {
          m.compare = dateCompare as unknown as (k1: K, k2: K) => number;
          m.hash = dateHash as unknown as (k: K) => number;
          return;
        } else if (isHashableObj(k)) {
          m.compare = objCompare as unknown as (a: K, b: K) => number;
          m.hash = (k) => (k as HashableObj).hash();
          return;
        } else {
          throw new Error("key type must have compare and hash methods");
        }

      case "string":
        m.compare = stringCompare as unknown as (k1: K, k2: K) => number;
        // we just narrowed K to string, but typescript forgets this when
        // typing hash
        m.hash = stringHash as unknown as (k: K) => number;
        return;

      case "number":
        m.compare = numCompare as unknown as (k1: K, k2: K) => number;
        m.hash = numHash as unknown as (k: K) => number;
        return;

      case "boolean":
        m.compare = boolCompare as unknown as (k1: K, k2: K) => number;
        m.hash = boolHash as unknown as (k: K) => number;
        return;
    }
  }

  function firstCompare(k1: K, k2: K): number {
    updateConfig(k1);
    return m.compare(k1, k2);
  }
  function firstHash(k: K): number {
    updateConfig(k);
    return m.hash(k);
  }

  m = { compare: firstCompare, hash: firstHash };

  return m;
}
