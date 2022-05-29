export type HashKeyObj = {
  equals(other: unknown): boolean;
  hashPrimitives(): ReadonlyArray<HashKey | Date | null | undefined>;
};

export function isHashKeyObj(k: unknown): k is HashKeyObj {
  return k !== null && typeof k === "object" && "hashPrimitives" in k && "equals" in k;
}

export type HashKey = string | number | boolean | Date | HashKeyObj;

export type HashConfig<K> = {
  readonly keyEq: (a: K, b: K) => boolean;
  readonly hash: (v: K) => number;
};

type InternalHashConfig<K> = {
  -readonly [k in keyof HashConfig<K>]: HashConfig<K>[k];
};

function primEq(a: unknown, b: unknown): boolean {
  return a === b;
}

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

function objHash(a: HashKeyObj): number {
  const prims = a.hashPrimitives();
  let hash = 0;
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i];
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
            hash = hash2Ints(hash, p.getTime());
          } else if (isHashKeyObj(p)) {
            hash = hash2Ints(hash, objHash(p));
          } else {
            // typescript should prevent this from happening
            hash = hash2Ints(hash, stringHash((p as unknown as object).toString()));
          }
          break;
      }
    }
  }
  if (prims.length === 1) {
    return hash;
  } else {
    return hash2Ints(hash, prims.length);
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
          m.keyEq = primEq;
          m.hash = dateHash as unknown as (k: K) => number;
          return;
        } else if (isHashKeyObj(k)) {
          // the key types passed to _config.keyEq and _config.hash are equal
          // to the type K which we just narrowed, but typescript doesn't know
          // about the narrowing when typing keyEq and hash
          m.keyEq = (j1, j2) => (j1 as unknown as HashKeyObj).equals(j2);
          m.hash = objHash as unknown as (k: K) => number;
          return;
        } else {
          throw new Error("key type must have equals and hash methods");
        }

      case "string":
        m.keyEq = primEq;
        // we just narrowed K to string, but typescript forgets this when
        // typing hash
        m.hash = stringHash as unknown as (k: K) => number;
        return;

      case "boolean":
        m.keyEq = primEq;
        m.hash = boolHash as unknown as (k: K) => number;
        return;

      case "number":
        m.keyEq = primEq;
        m.hash = numHash as unknown as (k: K) => number;
        return;
    }
  }

  function firstKeyEq(k1: K, k2: K): boolean {
    updateConfig(k1);
    return m.keyEq(k1, k2);
  }
  function firstHash(k: K): number {
    updateConfig(k);
    return m.hash(k);
  }

  m = { keyEq: firstKeyEq, hash: firstHash };

  return m;
}
