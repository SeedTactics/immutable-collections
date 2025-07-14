/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { expect, describe, it } from "vitest";
import { HashMap } from "../src/api/hashmap.js";
import { HashSet } from "../src/api/hashset.js";
import {
  CollidingKey,
  createKeyWithSameHash,
  createKeyWithSamePrefix,
  distinctKeyWithHash,
  randomCollisionKey,
} from "./collision-key.js";
import { deepFreeze } from "./deepfreeze.js";
import { createMap, expectEqual, randomNullableStr } from "./hashmap.test.js";

describe("HashMap difference", () => {
  it("computes difference", () => {
    function* diffValues(): Generator<
      | { map1K: CollidingKey; map1V: string | null }
      | { map2K: CollidingKey; map2V: { foo: number } }
    > {
      // want a bunch of keys in both maps
      for (let i = 0; i < 2000; i++) {
        const k = randomCollisionKey();
        yield { map1K: k, map1V: randomNullableStr() };
        yield { map2K: k, map2V: { foo: Math.random() } };
      }

      // want a bunch of keys in distinct in each map
      for (let i = 0; i < 2000; i++) {
        yield { map1K: randomCollisionKey(), map1V: randomNullableStr() };
        yield { map2K: randomCollisionKey(), map2V: { foo: Math.random() } };
      }

      for (let i = 0; i < 500; i++) {
        // some keys with the same hash but distinct
        const [k1, k2] = createKeyWithSameHash(2);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map2K: k2, map2V: { foo: Math.random() } };
      }

      for (let i = 0; i < 500; i++) {
        // some distinct keys with the same hash and a collision in imMap1
        const [k1, k2, k3] = createKeyWithSameHash(3);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map1K: k2, map1V: randomNullableStr() };
        yield { map2K: k3, map2V: { foo: Math.random() } };
      }

      for (let i = 0; i < 500; i++) {
        // some keys with the same hash and a collision and overlap in imMap1
        const [k1, k2, k3] = createKeyWithSameHash(3);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map1K: k2, map1V: randomNullableStr() };
        // note, k3 appears in both
        yield { map1K: k3, map1V: randomNullableStr() };
        yield { map2K: k3, map2V: { foo: Math.random() } };
      }

      for (let i = 0; i < 500; i++) {
        // some distinct keys with the same hash and a collision in imMap2
        const [k1, k2, k3] = createKeyWithSameHash(3);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map2K: k2, map2V: { foo: Math.random() } };
        yield { map2K: k3, map2V: { foo: Math.random() } };
      }

      for (let i = 0; i < 500; i++) {
        // some keys with the same hash and a collision and overlap in imMap2
        const [k1, k2, k3] = createKeyWithSameHash(3);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map2K: k1, map2V: { foo: Math.random() } };
        yield { map2K: k2, map2V: { foo: Math.random() } };
        yield { map2K: k3, map2V: { foo: Math.random() } };
      }

      for (let i = 0; i < 500; i++) {
        // collisions with distinct keys in both maps
        const [k1, k2, k3, k4] = createKeyWithSameHash(4);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map1K: k2, map1V: randomNullableStr() };
        yield { map2K: k3, map2V: { foo: Math.random() } };
        yield { map2K: k4, map2V: { foo: Math.random() } };
      }

      for (let i = 0; i < 500; i++) {
        // collisions in both maps with overlap
        const [k1, k2, k3] = createKeyWithSameHash(3);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map1K: k2, map1V: randomNullableStr() };
        yield { map2K: k2, map2V: { foo: Math.random() } };
        yield { map2K: k3, map2V: { foo: Math.random() } };
      }

      for (let i = 0; i < 500; i++) {
        // bitmap or full node in map1 and a collision in map2
        const sizes = new Array(i % 2 === 0 ? 15 : 33).fill(1);
        sizes[0] = 2;
        const keys = createKeyWithSamePrefix(sizes);
        for (const k of keys[0]) {
          // keys[0] has 2 keys so makes a collision
          yield { map2K: k, map2V: { foo: Math.random() } };
        }

        if (i % 3 === 0) {
          // put one of the map2 collision keys into map1 so it is removed
          yield { map1K: keys[0][0], map1V: randomNullableStr() };
        }

        for (const [k] of keys.slice(1)) {
          // remaining keys make a full node or a bitmap node depending on parity of i
          yield { map1K: k, map1V: randomNullableStr() };
        }
      }

      for (let i = 0; i < 500; i++) {
        // bitmap of size 2 in map1 with multiple children and a collision in map2
        const [[k1], [k2, k3]] = createKeyWithSamePrefix([1, 2]);

        // to test when map1 has a bitmap node with two children (k1 and k2), one of which is itself
        // a bitmap node with (k1 and k1a)
        const k1a = distinctKeyWithHash(k1.h | (1 << 31));
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map1K: k1a, map1V: randomNullableStr() };
        yield { map1K: k2, map1V: randomNullableStr() };
        yield { map2K: k2, map2V: { foo: Math.random() } };
        yield { map2K: k3, map2V: { foo: Math.random() } };
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
          yield { map2K: k, map2V: { foo: Math.random() } };
        }
      }
    }

    // create the maps
    let imMap1 = HashMap.empty<CollidingKey, string | null>();
    let imMap2 = HashMap.empty<CollidingKey, { foo: number }>();
    const jsMap1 = new Map<string, [CollidingKey, string | null]>();
    const jsKeys2 = new Set<string>();
    for (const x of diffValues()) {
      if ("map1K" in x) {
        imMap1 = imMap1.set(x.map1K, x.map1V);
        const kS = x.map1K.toString();
        jsMap1.set(kS, [x.map1K, x.map1V]);
      } else {
        imMap2 = imMap2.set(x.map2K, x.map2V);
        jsKeys2.add(x.map2K.toString());
      }
    }

    deepFreeze(imMap1);
    deepFreeze(imMap2);

    // update jsMap1 to be the difference
    for (const k2 of jsKeys2) {
      jsMap1.delete(k2);
    }

    const imDiff = imMap1.difference(imMap2);
    expectEqual(imDiff, jsMap1);

    // withoutKeys is the same
    const withoutKeys = imMap1.withoutKeys(imMap2.keySet());
    expectEqual(withoutKeys, jsMap1);
  });

  it("difference with itself is the empty map", () => {
    const { imMap } = createMap(5000, randomCollisionKey);

    const empty = imMap.difference(imMap);

    expectEqual(empty, new Map());
  });

  it("difference with the empty map is unchanged", () => {
    const { imMap } = createMap(500, randomCollisionKey);

    const diff = imMap.difference(HashMap.empty());
    expect(diff).to.equal(imMap);
  });

  it("withoutKeys with the empty set is unchanged", () => {
    const { imMap } = createMap(500, randomCollisionKey);

    const diff = imMap.withoutKeys(HashSet.empty());
    expect(diff).to.equal(imMap);
  });

  it("difference with the empty map is empty", () => {
    const { imMap } = createMap(500, randomCollisionKey);

    const diff = HashMap.empty<CollidingKey, string>().difference(imMap);
    expectEqual(diff, new Map());
  });

  it("computes symmetric difference", () => {
    function* diffValues(): Generator<
      | { both: CollidingKey; val: string | null }
      | { map1K: CollidingKey; map1V: string | null }
      | { map2K: CollidingKey; map2V: string | null }
    > {
      // want a bunch of keys in both maps
      for (let i = 0; i < 2000; i++) {
        yield { both: randomCollisionKey(), val: randomNullableStr() };
      }

      // want a bunch of keys in distinct in each map
      for (let i = 0; i < 2000; i++) {
        yield { map1K: randomCollisionKey(), map1V: randomNullableStr() };
        yield { map2K: randomCollisionKey(), map2V: randomNullableStr() };
      }
    }

    // create the maps
    let imMap1 = HashMap.empty<CollidingKey, string | null>();
    let imMap2 = HashMap.empty<CollidingKey, string | null>();
    const jsSymDiff = new Map<string, [CollidingKey, string | null]>();
    for (const x of diffValues()) {
      if ("both" in x) {
        imMap1 = imMap1.set(x.both, x.val);
        imMap2 = imMap2.set(x.both, x.val);
      } else if ("map1K" in x) {
        imMap1 = imMap1.set(x.map1K, x.map1V);
        jsSymDiff.set(x.map1K.toString(), [x.map1K, x.map1V]);
      } else {
        imMap2 = imMap2.set(x.map2K, x.map2V);
        jsSymDiff.set(x.map2K.toString(), [x.map2K, x.map2V]);
      }
    }

    deepFreeze(imMap1);
    deepFreeze(imMap2);

    const diff = imMap1.symmetricDifference(imMap2);
    expectEqual(diff, jsSymDiff);

    const diff2 = imMap2.symmetricDifference(imMap1);
    expectEqual(diff2, jsSymDiff);
  });

  it("doesn't change when symmetric diff with the empty set", () => {
    const map = createMap(500, randomCollisionKey).imMap;
    expect(map.symmetricDifference(HashMap.empty())).to.equal(map);
  });
});
