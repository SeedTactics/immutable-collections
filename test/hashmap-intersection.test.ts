/* Copyright John Lenz, BSD license, see LICENSE file for details */
/* eslint-disable @typescript-eslint/no-unused-expressions */

import { expect, describe, it } from "vitest";
import { HashMap } from "../src/api/hashmap.js";
import {
  CollidingKey,
  createKeyWithSameHash,
  createKeyWithSamePrefix,
  randomCollisionKey,
} from "./collision-key.js";
import { deepFreeze } from "./deepfreeze.js";
import {
  combineNullableStr,
  createMap,
  expectEqual,
  randomNullableStr,
} from "./hashmap.test.js";

describe("HashMap Intersection", () => {
  it("returns an empty map from an empty intersection", () => {
    const m = HashMap.intersection<number, string>((a, b) => a + b);
    expect(m.size === 0);
    expect(Array.from(m)).to.be.empty;
  });

  it("returns the map directly from an intersection", () => {
    const { imMap } = createMap(50, randomCollisionKey);

    const m = HashMap.intersection((a, b) => a + b, imMap);
    expect(m).to.equal(imMap);
  });

  it("returns unchanged when intersecting with itself", () => {
    const { imMap } = createMap(50, randomCollisionKey);
    const m = imMap.intersection(imMap);
    expect(m).to.equal(imMap);
  });

  it("returns empty if one side is empty from an intersection", () => {
    const { imMap } = createMap(50, randomCollisionKey);

    let empty = HashMap.intersection(
      (a, b) => a + b,
      imMap,
      HashMap.empty<CollidingKey, string>(),
    );
    expectEqual(empty, new Map());

    empty = imMap.intersection(HashMap.empty<CollidingKey, string>());
    expectEqual(empty, new Map());

    empty = HashMap.empty<CollidingKey, string>().intersection(imMap);
    expectEqual(empty, new Map());
  });

  it("intersects two maps", () => {
    function* intersectionValues(): Generator<
      | { map1K: CollidingKey; map1V: string | null }
      | { map2K: CollidingKey; map2V: string | null }
      | { both: CollidingKey; val1: string | null; val2: string | null }
    > {
      // want a bunch of keys in both maps
      for (let i = 0; i < 2000; i++) {
        const k = randomCollisionKey();
        yield { both: k, val1: randomNullableStr(), val2: randomNullableStr() };
      }

      // want a bunch of keys in distinct in each map
      for (let i = 0; i < 2000; i++) {
        yield { map1K: randomCollisionKey(), map1V: randomNullableStr() };
        yield { map2K: randomCollisionKey(), map2V: randomNullableStr() };
      }

      for (let i = 0; i < 500; i++) {
        // some keys with the same hash but distinct
        const [k1, k2] = createKeyWithSameHash(2);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map2K: k2, map2V: randomNullableStr() };
      }

      for (let i = 0; i < 500; i++) {
        // some keys with the same hash and a collision and overlap in imMap1
        const [k1, k2, k3] = createKeyWithSameHash(3);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map1K: k2, map1V: randomNullableStr() };
        yield { both: k3, val1: randomNullableStr(), val2: randomNullableStr() };
      }

      for (let i = 0; i < 500; i++) {
        // some keys with the same hash and a collision and overlap in imMap2
        const [k1, k2, k3] = createKeyWithSameHash(3);
        yield { both: k1, val1: randomNullableStr(), val2: randomNullableStr() };
        yield { map2K: k2, map2V: randomNullableStr() };
        yield { map2K: k3, map2V: randomNullableStr() };
      }

      for (let i = 0; i < 500; i++) {
        // bitmap or full node in map1 and a collision in map2
        const sizes = new Array(i % 2 === 0 ? 15 : 33).fill(1);
        sizes[0] = 2;
        const keys = createKeyWithSamePrefix(sizes);
        for (const k of keys[0]) {
          // keys[0] has 2 keys so makes a collision
          yield { map2K: k, map2V: randomNullableStr() };
        }
        for (const [k] of keys.slice(1)) {
          // remaining keys make a full node or a bitmap node depending on parity of i
          yield { map1K: k, map1V: randomNullableStr() };
        }
      }

      for (let i = 0; i < 500; i++) {
        // bitmap or full node in map2 and a collision in map1
        const sizes = new Array(i % 2 === 0 ? 15 : 33).fill(1);
        sizes[0] = 2;
        const keys = createKeyWithSamePrefix(sizes);
        for (const k of keys[0]) {
          // keys[0] has 2 keys so makes a collision
          yield { map1K: k, map1V: randomNullableStr() };
        }
        for (const [k] of keys.slice(1)) {
          // remaining keys make a full node or a bitmap node depending on parity of i
          yield { map2K: k, map2V: randomNullableStr() };
        }
      }
    }

    // create the maps and the expected intersection
    let imMap1 = HashMap.empty<CollidingKey, string | null>();
    let imMap2 = HashMap.empty<CollidingKey, string | null>();
    const jsIntersection = new Map<string, [CollidingKey, string | null]>();
    for (const x of intersectionValues()) {
      if ("map1K" in x) {
        imMap1 = imMap1.set(x.map1K, x.map1V);
      } else if ("map2K" in x) {
        imMap2 = imMap2.set(x.map2K, x.map2V);
      } else {
        imMap1 = imMap1.set(x.both, x.val1);
        imMap2 = imMap2.set(x.both, x.val2);
        jsIntersection.set(x.both.toString(), [
          x.both,
          combineNullableStr(x.val1, x.val2),
        ]);
      }
    }

    deepFreeze(imMap1);
    deepFreeze(imMap2);

    const imInter = HashMap.intersection(combineNullableStr, imMap1, imMap2);
    expectEqual(imInter, jsIntersection);

    // intersection with itself returns unchanged
    const interWithIteself = HashMap.intersection((_, b) => b, imMap1, imMap1);
    expect(interWithIteself).is.equal(imMap1);
  });
});
