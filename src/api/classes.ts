/* Copyright John Lenz, BSD license, see LICENSE file for details */

/**
 * Class-based API for immutable-collections
 *
 * @remarks
 * This module is the main import of immutable-collections and implements the class-based API.
 * This API consists of the HashMap, HashSet, OrderedMap, OrderedSet, and LazySeq classes (along
 * with some utility functions).
 *
 * ```ts
 * import { HashMap } from "@seedtactics/immutable-collections";
 * const h = HashMap.from([ [1, "Hello"], [2, "World"] ]);
 * console.log(h.get(1)); // prints Hello
 * console.log(h.get(2)); // prints World
 * ```
 *
 * @module classes
 */

export { HashMap } from "./hashmap.js";
export { HashSet } from "./hashset.js";
export { OrderedMap } from "./orderedmap.js";
export { OrderedSet } from "./orderedset.js";
export { LazySeq } from "../lazyseq.js";

export {
  OrderedMapKey,
  ComparableObj,
  mkCompareByProperties,
  ToComparableBase,
  ToComparable,
} from "../data-structures/comparison.js";
export {
  HashKey,
  HashableObj,
  hashValues,
  ToHashable,
} from "../data-structures/hashing.js";
