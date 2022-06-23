/* Copyright John Lenz, BSD license, see LICENSE file for details */

import {
  ComparableObj,
  ComparisionConfig,
  dateCompare,
  objCompare,
  numCompare,
  boolCompare,
  stringCompare,
} from "./comparison.js";

export type HashableObj = {
  hash(): number;
};

export function isHashableObj(k: unknown): k is HashableObj {
  return k !== null && typeof k === "object" && "hash" in k;
}

export type HashKey = string | number | boolean | Date | (HashableObj & ComparableObj);

export type HashConfig<K> = ComparisionConfig<K> & {
  readonly hash: (v: K) => number;
};

type InternalHashConfig<K> = {
  -readonly [k in keyof HashConfig<K>]: HashConfig<K>[k];
};

// the tree uses the hash value in javascript bit operations, and javascript bit operations cast
// the number to a signed 32-bit integer.  Thus each hash function should return a number which
// is within the range of a signed 32-bit integer.

function hash2Ints(h1: number, h2: number): number {
  // combines two 32-bit hashes into a 32-bit hash
  return (h1 * 16777619) ^ h2;
}

function stringHash(str: string): number {
  let hash = 0;
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
    return hash2Ints(intarr[0], intarr[1]);
  }
}

function dateHash(d: Date): number {
  return numHash(d.getTime());
}

export function hashValues(...vals: ReadonlyArray<string | number | boolean | Date | HashableObj | null | undefined>) {
  let hash = 0;
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
            hash = hash2Ints(hash, stringHash((p as unknown as object).toString()));
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
