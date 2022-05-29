export type ToComparable<T> =
  | ((t: T) => number | null)
  | ((t: T) => string | null)
  | ((t: T) => boolean | null)
  | ((t: T) => Date | null);

export type CompareByProperty<T> = { asc: ToComparable<T> } | { desc: ToComparable<T> };

export function compareByProperties<T>(
  ...getKeys: ReadonlyArray<ToComparable<T> | CompareByProperty<T>>
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
