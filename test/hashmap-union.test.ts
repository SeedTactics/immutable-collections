/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { expect } from "chai";
import { HashMap } from "../src/api/hashmap.js";
import { CollidingKey, createKeyWithSameHash, createKeyWithSamePrefix, randomCollisionKey } from "./collision-key.js";
import { deepFreeze } from "./deepfreeze.js";
import { combineNullableStr, createMap, expectEqual, HashMapAndJsMap, randomNullableStr } from "./hashmap.test.js";

describe("HashMap Union", () => {
  it("returns an empty map from an empty union", () => {
    const m = HashMap.union<number, string>((a, b) => a + b);
    expect(m.size === 0);
    expect(Array.from(m)).to.be.empty;
  });

  it("returns the map directly from a union", () => {
    const maps = createMap(50, randomCollisionKey);

    const m = HashMap.union((a, b) => a + b, maps.imMap);
    expect(m).to.equal(maps.imMap);
  });

  it("returns unchanged if unioning with the empty map", () => {
    const { imMap, jsMap } = createMap(50, randomCollisionKey);

    expect(imMap.union(HashMap.empty())).to.equal(imMap);
    expectEqual(HashMap.empty<CollidingKey, string>().union(imMap), jsMap);
  });

  it("unions two maps", () => {
    function* unionValues(): Generator<
      { map1K: CollidingKey; map1V: string | null } | { map2K: CollidingKey; map2V: string | null }
    > {
      // want a bunch of keys in both maps
      for (let i = 0; i < 2000; i++) {
        const k = randomCollisionKey();
        yield { map1K: k, map1V: randomNullableStr() };
        yield { map2K: k, map2V: randomNullableStr() };
      }

      // want a bunch of keys distinct in each map
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
        // some distinct keys with the same hash and a collision in imMap1
        const [k1, k2, k3] = createKeyWithSameHash(3);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map1K: k2, map1V: randomNullableStr() };
        yield { map2K: k3, map2V: randomNullableStr() };
      }

      for (let i = 0; i < 500; i++) {
        // some keys with the same hash and a collision and overlap in imMap1
        const [k1, k2, k3] = createKeyWithSameHash(3);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map1K: k2, map1V: randomNullableStr() };
        // note, k3 appears in both
        yield { map1K: k3, map1V: randomNullableStr() };
        yield { map2K: k3, map2V: randomNullableStr() };
      }

      for (let i = 0; i < 500; i++) {
        // some distinct keys with the same hash and a collision in imMap2
        const [k1, k2, k3] = createKeyWithSameHash(3);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map2K: k2, map2V: randomNullableStr() };
        yield { map2K: k3, map2V: randomNullableStr() };
      }

      for (let i = 0; i < 500; i++) {
        // some keys with the same hash and a collision and overlap in imMap2
        const [k1, k2, k3] = createKeyWithSameHash(3);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map2K: k1, map2V: randomNullableStr() };
        yield { map2K: k2, map2V: randomNullableStr() };
        yield { map2K: k3, map2V: randomNullableStr() };
      }

      for (let i = 0; i < 500; i++) {
        // collisions with distinct keys in both maps
        const [k1, k2, k3, k4] = createKeyWithSameHash(4);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map1K: k2, map1V: randomNullableStr() };
        yield { map2K: k3, map2V: randomNullableStr() };
        yield { map2K: k4, map2V: randomNullableStr() };
      }

      for (let i = 0; i < 500; i++) {
        // collisions in both maps with overlap
        const [k1, k2, k3] = createKeyWithSameHash(3);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map1K: k2, map1V: randomNullableStr() };
        yield { map2K: k2, map2V: randomNullableStr() };
        yield { map2K: k3, map2V: randomNullableStr() };
      }

      for (let i = 0; i < 500; i++) {
        // key in map1, collision in map2 with same prefix but ultimitely different hash
        const [[k1], [k2, k3]] = createKeyWithSamePrefix([1, 2]);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map2K: k2, map2V: randomNullableStr() };
        yield { map2K: k3, map2V: randomNullableStr() };
      }

      for (let i = 0; i < 500; i++) {
        // key in map2, collision in map1 with same prefix but ultimitely different hash
        const [[k1, k2], [k3]] = createKeyWithSamePrefix([2, 1]);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map1K: k2, map1V: randomNullableStr() };
        yield { map2K: k3, map2V: randomNullableStr() };
      }

      for (let i = 0; i < 500; i++) {
        // collision in both with same prefix but ultimitely different hash
        const [[k1, k2], [k3, k4]] = createKeyWithSamePrefix([2, 2]);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map1K: k2, map1V: randomNullableStr() };
        yield { map2K: k3, map2V: randomNullableStr() };
        yield { map2K: k4, map2V: randomNullableStr() };
      }
    }

    // create the maps and the expected union
    let imMap1 = HashMap.empty<CollidingKey, string | null>();
    let imMap2 = HashMap.empty<CollidingKey, string | null>();
    const jsUnion = new Map<string, [CollidingKey, string | null]>();
    for (const x of unionValues()) {
      if ("map1K" in x) {
        imMap1 = imMap1.set(x.map1K, x.map1V);
        jsUnion.set(x.map1K.toString(), [x.map1K, x.map1V]);
      } else {
        imMap2 = imMap2.set(x.map2K, x.map2V);
        const kS = x.map2K.toString();
        const old = jsUnion.get(kS);
        if (old) {
          jsUnion.set(kS, [x.map2K, combineNullableStr(old[1], x.map2V)]);
        } else {
          jsUnion.set(kS, [x.map2K, x.map2V]);
        }
      }
    }

    deepFreeze(imMap1);
    deepFreeze(imMap2);

    const imUnion = imMap1.union(imMap2, combineNullableStr);
    expectEqual(imUnion, jsUnion);

    // union with itself returns unchanged
    const unionWithIteself = imMap1.union(imMap1);
    expect(unionWithIteself).is.equal(imMap1);
  });

  it("unions three maps", () => {
    const maps = Array<HashMapAndJsMap<number, string>>();
    for (let i = 0; i < 3; i++) {
      maps.push(createMap(100 + i * 1000, () => Math.floor(Math.random() * 5000)));
      // add an empty map, which should be filtered out
      maps.push({
        imMap: HashMap.empty<number, string>(),
        jsMap: new Map(),
      });
    }

    const newImMap = HashMap.union((a, b) => a + b, ...maps.map((i) => i.imMap));

    const newJsMap = new Map<string, [number, string]>();
    for (const { jsMap } of maps) {
      for (const [kS, [k, v]] of jsMap) {
        const oldV = newJsMap.get(kS);
        newJsMap.set(kS, [k, oldV === undefined ? v : oldV[1] + v]);
      }
    }

    expectEqual(newImMap, newJsMap);
  });

  it("unions a small map with a big map", () => {
    const bigMap = createMap(5000, randomCollisionKey);

    const smallMap = createMap(5, randomCollisionKey);

    const jsUnion = new Map(bigMap.jsMap);
    for (const [k, v] of smallMap.jsMap) {
      jsUnion.set(k, v);
    }

    const bigOnLeft = bigMap.imMap.union(smallMap.imMap);
    expectEqual(bigOnLeft, jsUnion);

    const bigOnRight = smallMap.imMap.union(bigMap.imMap);
    expectEqual(bigOnRight, jsUnion);
  });
});
