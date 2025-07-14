/* Copyright John Lenz, BSD license, see LICENSE file for details */
/* eslint-disable @typescript-eslint/no-unused-expressions */

import { expect, describe, it } from "vitest";
import { faker } from "@faker-js/faker";
import { HashMap } from "../src/api/hashmap.js";
import {
  CollidingKey,
  createKeyWithSameHash,
  createKeyWithSamePrefix,
  distinctKeyWithHash,
  randomCollisionKey,
} from "./collision-key.js";
import { deepFreeze } from "./deepfreeze.js";
import {
  combineNullableStr,
  createMap,
  expectEqual,
  randomNullableStr,
} from "./hashmap.test.js";

type AdjustType =
  | { type: "delete" }
  | { type: "leave unchanged" }
  | { type: "mergeWith"; val: string | null }
  | { type: "expect missing"; val: string | null }
  | { type: "expect missing, leave undefined" };

function randomExistingAdjType(): AdjustType {
  const r = Math.random();
  if (r < 0.33) {
    return { type: "delete" };
  } else if (r < 0.66) {
    return { type: "leave unchanged" };
  } else {
    return { type: "mergeWith", val: randomNullableStr() };
  }
}

function randomMissingAdjType(): AdjustType {
  const r = Math.random();
  if (r < 0.5) {
    return { type: "expect missing", val: randomNullableStr() };
  } else {
    return { type: "expect missing, leave undefined" };
  }
}

describe("HashMap adjust", () => {
  it("adjusts a map", () => {
    function* adjValues(): Generator<
      | { map1K: CollidingKey; map1V: string | null }
      | { map2K: CollidingKey; map2V: AdjustType }
    > {
      // want a bunch of keys in both maps to be deleted, adjusted, or left unchanged
      for (let i = 0; i < 10000; i++) {
        const k = randomCollisionKey();
        yield { map1K: k, map1V: randomNullableStr() };
        yield { map2K: k, map2V: randomExistingAdjType() };
      }
      // want a bunch of keys only in each map
      for (let i = 0; i < 5000; i++) {
        yield { map1K: randomCollisionKey(), map1V: randomNullableStr() };
        yield { map2K: randomCollisionKey(), map2V: randomMissingAdjType() };
      }

      // delete with same hash but different key
      for (let i = 0; i < 500; i++) {
        const [k1, k2] = createKeyWithSameHash(2);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map2K: k2, map2V: randomMissingAdjType() };
      }

      // delete with different hash but same prefix
      for (let i = 0; i < 500; i++) {
        const [[k1], [k2]] = createKeyWithSamePrefix([1, 1]);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map2K: k2, map2V: randomMissingAdjType() };
      }

      //collision in map1 and key in map2
      for (let i = 0; i < 500; i++) {
        const [[k1, k1a], [k2]] = createKeyWithSamePrefix([2, 1]);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map1K: k1a, map1V: randomNullableStr() };
        yield { map2K: k2, map2V: randomMissingAdjType() };
      }

      //collision in map1 and key in map2 with same hash
      for (let i = 0; i < 500; i++) {
        const [k1, k2, k3] = createKeyWithSameHash(3);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map1K: k2, map1V: randomNullableStr() };
        yield { map2K: k3, map2V: randomMissingAdjType() };
      }

      //collision in map1 and overlap in map2
      for (let i = 0; i < 500; i++) {
        const [k1, k2] = createKeyWithSameHash(2);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map1K: k2, map1V: randomNullableStr() };
        yield { map2K: k2, map2V: randomExistingAdjType() };
      }

      // collision in map2 and key in map1 with same hash
      for (let i = 0; i < 500; i++) {
        const [k1, k2] = createKeyWithSameHash(2);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map2K: k1, map2V: randomExistingAdjType() };
        yield { map2K: k2, map2V: randomMissingAdjType() };
      }

      // collision in map2 and key in map1 with same prefix
      for (let i = 0; i < 500; i++) {
        const [[k1], [k2, k2a]] = createKeyWithSamePrefix([1, 2]);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map2K: k2, map2V: randomMissingAdjType() };
        yield { map2K: k2a, map2V: randomMissingAdjType() };
      }

      // collision in both with same hash
      for (let i = 0; i < 500; i++) {
        const [k1, k2] = createKeyWithSameHash(2);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map1K: k2, map1V: randomNullableStr() };
        yield { map2K: k1, map2V: randomExistingAdjType() };
        yield { map2K: k2, map2V: randomExistingAdjType() };
      }

      // collision in both with same prefixes
      for (let i = 0; i < 500; i++) {
        const [[k1, k1a], [k2, k2a]] = createKeyWithSamePrefix([2, 2]);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map1K: k1a, map1V: randomNullableStr() };
        yield { map2K: k2, map2V: randomMissingAdjType() };
        yield { map2K: k2a, map2V: randomMissingAdjType() };
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
        yield { map2K: k2, map2V: randomExistingAdjType() };
        yield { map2K: k3, map2V: randomMissingAdjType() };
      }
    }

    // create the maps
    let imMap1 = HashMap.empty<CollidingKey, string | null>();
    let imMap2 = HashMap.empty<CollidingKey, AdjustType>();
    const jsMap1 = new Map<string, [CollidingKey, string | null]>();
    const jsMap2 = new Map<string, [CollidingKey, AdjustType]>();
    for (const x of adjValues()) {
      if ("map1K" in x) {
        imMap1 = imMap1.set(x.map1K, x.map1V);
        const kS = x.map1K.toString();
        jsMap1.set(kS, [x.map1K, x.map1V]);
      } else {
        imMap2 = imMap2.set(x.map2K, x.map2V);
        jsMap2.set(x.map2K.toString(), [x.map2K, x.map2V]);
      }
    }

    deepFreeze(imMap1);
    deepFreeze(imMap2);

    // update jsMap1 to be the difference
    for (const [k2S, [k2, adj2]] of jsMap2) {
      switch (adj2.type) {
        case "delete":
          jsMap1.delete(k2S);
          break;
        case "mergeWith": {
          const [oldK, oldV] = jsMap1.get(k2S)!;
          jsMap1.set(k2S, [oldK, combineNullableStr(oldV, adj2.val)]);
          break;
        }
        case "expect missing": {
          expect(jsMap1.has(k2S)).to.be.false;
          jsMap1.set(k2S, [k2, adj2.val]);
          break;
        }
        case "expect missing, leave undefined": {
          expect(jsMap1.has(k2S)).to.be.false;
          break;
        }
        // do nothing on type === "leave unchanged"
      }
    }

    const imDiff = imMap1.adjust(imMap2, (oldVal, adj, k) => {
      expect(adj).to.equal(jsMap2.get(k.toString())![1]);
      switch (adj.type) {
        case "delete":
          expect(oldVal).not.to.be.undefined;
          return undefined;
        case "expect missing":
          expect(oldVal).to.be.undefined;
          return adj.val;
        case "leave unchanged":
          expect(oldVal).not.to.be.undefined;
          return oldVal;
        case "mergeWith":
          return combineNullableStr(oldVal!, adj.val);
        case "expect missing, leave undefined":
          expect(oldVal).to.be.undefined;
          return undefined;
      }
    });

    expectEqual(imDiff, jsMap1);
  });

  it("adjusts and reuses parts of the tree when the values are the same", () => {
    function* adjValues(): Generator<
      | { map1K: CollidingKey; map1V: string | null }
      | { map2K: CollidingKey; map2V: string | null }
    > {
      // want a bunch of keys in both maps
      for (let i = 0; i < 10000; i++) {
        const k = randomCollisionKey();
        yield { map1K: k, map1V: randomNullableStr() };
        yield { map2K: k, map2V: randomNullableStr() };
      }

      // want a bunch of keys only in each map
      for (let i = 0; i < 5000; i++) {
        yield { map1K: randomCollisionKey(), map1V: randomNullableStr() };
        yield { map2K: randomCollisionKey(), map2V: randomNullableStr() };
      }

      // leaf in map1, branch in map2
      for (let i = 0; i < 500; i++) {
        const [[k1], [k2], [k3]] = createKeyWithSamePrefix([1, 1, 1]);
        yield { map1K: k1, map1V: randomNullableStr() };
        yield { map2K: k1, map2V: randomNullableStr() };
        yield { map2K: k2, map2V: randomNullableStr() };
        yield { map2K: k3, map2V: randomNullableStr() };
      }
    }

    // create the maps.
    let imMap1 = HashMap.empty<CollidingKey, string | null>();
    let imMap2 = HashMap.empty<CollidingKey, string | null>();
    const jsMap1 = new Map<string, [CollidingKey, string | null]>();
    const jsMap2 = new Map<string, [CollidingKey, string | null]>();
    for (const x of adjValues()) {
      if ("map1K" in x) {
        imMap1 = imMap1.set(x.map1K, x.map1V);
        const kS = x.map1K.toString();
        jsMap1.set(kS, [x.map1K, x.map1V]);
      } else {
        imMap2 = imMap2.set(x.map2K, x.map2V);
        jsMap2.set(x.map2K.toString(), [x.map2K, x.map2V]);
      }
    }

    deepFreeze(imMap1);
    deepFreeze(imMap2);

    // update jsMap1 to be the difference.  for merge, we always take the map2 value
    for (const [k2S, v] of jsMap2) {
      jsMap1.set(k2S, v);
    }

    const imDiff = imMap1.adjust(imMap2, (_oldVal, adj, k) => {
      expect(adj).to.equal(jsMap2.get(k.toString())![1]);
      return adj;
    });

    expectEqual(imDiff, jsMap1);
  });

  it("inserts to an empty map", () => {
    const { imMap, jsMap } = createMap(500, randomCollisionKey);
    const m = HashMap.empty<CollidingKey, string>().adjust(imMap, (oldVal, adj) => {
      expect(oldVal).to.be.undefined;
      return adj;
    });

    expectEqual(m, jsMap);
  });

  it("returns unchanged if adjusted keys are empty", () => {
    const { imMap } = createMap(500, randomCollisionKey);
    const m = imMap.adjust(HashMap.empty(), () => {
      throw new Error("should not be called");
    });
    expect(m).to.equal(imMap);
  });

  it("returns unchanged if nothing adjusted", () => {
    const { imMap } = createMap(5000, randomCollisionKey);

    const keys = faker.helpers.arrayElements([...imMap.keys()], 20);

    const toAdjust = HashMap.build(
      keys,
      (k) => k,
      (_, k) => k.toString(),
    );

    const m = imMap.adjust(toAdjust, (existingVal, helperVal, k) => {
      expect(existingVal).to.equal(imMap.get(k));
      expect(helperVal).to.equal(toAdjust.get(k));
      return existingVal;
    });

    expect(m).to.equal(imMap);
  });
});
