/* Copyright John Lenz, BSD license, see LICENSE file for details */

export function deepFreeze<T extends object>(object: T): T {
  const propNames = Object.getOwnPropertyNames(object);
  for (const name of propNames) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const value = (object as any)[name];

    if (value && typeof value === "object") {
      deepFreeze(value);
    }
  }

  return Object.freeze(object);
}
