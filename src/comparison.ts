export type ComparableObj = {
  compare(other: ComparableObj): number;
};

export function isComparableObj(o: unknown): o is ComparableObj {
  return o !== null && typeof o === "object" && "compare" in o;
}

export type ToComparable<T> =
  | ((t: T) => number | null)
  | ((t: T) => string | null)
  | ((t: T) => boolean | null)
  | ((t: T) => Date | null)
  | ((t: T) => ComparableObj | null);

export type ToComparableDirection<T> = { asc: ToComparable<T> } | { desc: ToComparable<T> };

export function mkCompareByProperties<T>(
  ...getKeys: ReadonlyArray<ToComparable<T> | ToComparableDirection<T>>
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

export type ComparisionKey = string | number | boolean | Date | ComparableObj;

export type ComparisionConfig<K> = {
  readonly compare: (a: K, b: K) => number;
};

type InternalComparisonConfig<K> = {
  -readonly [k in keyof ComparisionConfig<K>]: ComparisionConfig<K>[k];
};

export function primCompare<T extends number | string | boolean | Date>(a: T, b: T): number {
  if (a === b) {
    return 0;
  } else if (a < b) {
    return -1;
  } else {
    return 1;
  }
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

export function mkComparisonConfig<K extends ComparisionKey>(): ComparisionConfig<K> {
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
          throw new Error("key type must have equals and hash methods");
        }

      case "string":
        m.compare = stringCompare as unknown as (a: K, b: K) => number;
        return;

      default:
        m.compare = primCompare as unknown as (a: K, b: K) => number;
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
