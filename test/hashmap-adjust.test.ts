/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { expect } from "chai";
import { faker } from "@faker-js/faker";
import { HashMap } from "../src/api/hashmap.js";
import { CollidingKey, randomCollisionKey } from "./collision-key.js";
import { deepFreeze } from "./deepfreeze.js";
import { combineNullableStr, createMap, expectEqual, randomNullableStr } from "./hashmap.test.js";

type AdjustType =
  | { type: "delete" }
  | { type: "leave unchanged" }
  | { type: "mergeWith"; val: string | null }
  | { type: "expect missing"; val: string | null };

describe("HashMap adjust", () => {
  it("adjusts a map", () => {
    function* adjValues(): Generator<
      { map1K: CollidingKey; map1V: string | null } | { map2K: CollidingKey; map2V: AdjustType }
    > {
      // want a bunch of keys to be deleted
      for (let i = 0; i < 10000; i++) {
        const k = randomCollisionKey();
        yield { map1K: k, map1V: randomNullableStr() };
        yield { map2K: k, map2V: { type: "delete" } };
      }

      // want a bunch of keys to be merged
      for (let i = 0; i < 10000; i++) {
        const k = randomCollisionKey();
        yield { map1K: k, map1V: randomNullableStr() };
        yield { map2K: k, map2V: { type: "mergeWith", val: randomNullableStr() } };
      }

      // want a bunch of keys to be left unchanged
      for (let i = 0; i < 10000; i++) {
        const k = randomCollisionKey();
        yield { map1K: k, map1V: randomNullableStr() };
        yield { map2K: k, map2V: { type: "leave unchanged" } };
      }

      // want a bunch of keys only in each map
      for (let i = 0; i < 10000; i++) {
        yield { map1K: randomCollisionKey(), map1V: randomNullableStr() };
        yield { map2K: randomCollisionKey(), map2V: { type: "expect missing", val: randomNullableStr() } };
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
      }
    });

    expectEqual(imDiff, jsMap1);
  });

  it("returns unchanged if nothing adjusted", () => {
    const { imMap } = createMap(5000, randomCollisionKey);

    const keys = faker.helpers.arrayElements([...imMap.keys()], 20);

    const toAdjust = HashMap.build(
      keys,
      (k) => k,
      (_, k) => k.toString()
    );

    const m = imMap.adjust(toAdjust, (existingVal, helperVal, k) => {
      expect(existingVal).to.equal(imMap.get(k));
      expect(helperVal).to.equal(toAdjust.get(k));
      return existingVal;
    });

    expect(m).to.equal(imMap);
  });
});
