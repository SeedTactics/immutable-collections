/* Copyright John Lenz, BSD license, see LICENSE file for details */
/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unused-expressions */

import { expect, describe, it } from "vitest";
import { faker } from "@faker-js/faker";
import { HashKey } from "../src/data-structures/hashing.js";
import { HashMap } from "../src/api/hashmap.js";
import { mkCompareByProperties } from "../src/data-structures/comparison.js";
import {
  CollidingKey,
  distinctKeyWithHash,
  randomCollisionKey,
} from "./collision-key.js";
import { deepFreeze } from "./deepfreeze.js";
import { Node } from "../src/data-structures/hamt.js";

export interface HashMapAndJsMap<K extends HashKey, V> {
  readonly imMap: HashMap<K, V>;
  readonly jsMap: Map<string, [K, V]>;
}

function sortEntries<K extends HashKey, V>(
  e: Iterable<readonly [K, V]>,
): Array<readonly [K, V]> {
  const entries = Array.from(e);
  return entries.sort(mkCompareByProperties(([k]) => k.toString()));
}

function sortKeys<K extends HashKey>(e: Iterable<K>): Array<K> {
  const keys = Array.from(e);
  return keys.sort(mkCompareByProperties((k) => k.toString()));
}

function sortValues<V>(e: Iterable<V>): Array<V> {
  const values = Array.from(e);
  return values.sort();
}

export function randomNullableStr(): string | null {
  if (Math.random() < 0.1) return null;
  return faker.string.sample();
}

export function combineNullableStr(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a + b;
}

export function createMap<K extends HashKey>(
  size: number,
  key: () => K,
): HashMapAndJsMap<K, string> {
  let imMap = HashMap.empty<K, string>();
  const jsMap = new Map<string, [K, string]>();

  for (let i = 0; i < size; i++) {
    const k = key();
    const v = faker.string.sample();
    if (i % 2 === 0) {
      imMap = imMap.set(k, v);
      jsMap.set(k.toString(), [k, v]);
    } else {
      imMap = imMap.modify(k, (oldV) => (oldV === undefined ? v : oldV + v));
      const oldjV = jsMap.get(k.toString());
      jsMap.set(k.toString(), [k, oldjV === undefined ? v : oldjV[1] + v]);
    }
  }

  deepFreeze(imMap);

  return { imMap, jsMap };
}

// copy popCount here because we don't want it exported
function popCount(n: number): number {
  n = n - ((n >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0xf0f0f0f) * 0x1010101) >> 24;
}

function checkBitmap<K extends HashKey, V>(imMap: HashMap<K, V>): void {
  function loop(node: Node<K, V>): void {
    if ("children" in node) {
      expect(popCount(node.bitmap)).to.equal(node.children.length);
      for (const n of node.children) {
        loop(n);
      }
    }
  }
  const root = (imMap as unknown as { root: Node<K, V> | null }).root;
  if (root !== null) loop(root);
}

export function expectEqual<K extends HashKey, V>(
  imMap: HashMap<K, V>,
  jsMap: Map<string, [K, V]>,
): void {
  checkBitmap(imMap);

  const entries = sortEntries(jsMap.values());
  expect(imMap.size).to.equal(jsMap.size);

  for (const [k, v] of entries) {
    expect(imMap.get(k)).to.equal(v);
    expect(imMap.has(k)).to.be.true;
  }

  expect(sortEntries(imMap)).to.deep.equal(entries);
  expect(sortEntries(imMap.entries())).to.deep.equal(entries);
  expect(sortEntries(imMap.toLazySeq())).to.deep.equal(entries);
  expect(sortKeys(imMap.keys())).to.deep.equal(entries.map(([k]) => k));
  expect(sortKeys(imMap.keysToLazySeq())).to.deep.equal(entries.map(([k]) => k));
  expect(sortValues(imMap.values())).to.deep.equal(sortValues(entries.map(([, v]) => v)));
  expect(sortValues(imMap.valuesToLazySeq())).to.deep.equal(
    sortValues(entries.map(([, v]) => v)),
  );

  const forEachEntries = new Array<[K, V]>();
  imMap.forEach((v, k, m) => {
    expect(m).to.equal(imMap);
    forEachEntries.push([k, v]);
  });
  expect(sortEntries(forEachEntries)).to.deep.equal(entries);

  const foldEntries = new Array<[K, V]>();
  const foldCnt = imMap.fold((cnt, k, v) => {
    foldEntries.push([k, v]);
    return cnt + 1;
  }, 0);
  expect(foldCnt).to.equal(jsMap.size);
  expect(sortEntries(foldEntries)).to.deep.equal(entries);
}

describe("HashMap", () => {
  it("creates an empty map", () => {
    const m = HashMap.empty<number, string>();
    expect(m.size).to.equal(0);

    expect(m.get(100)).to.be.undefined;
    expect(m.has(100)).to.be.false;

    expectEqual(m, new Map());
  });

  it("has immutable keyed property", () => {
    const m = HashMap.empty<number, string>().set(2, "2");
    expect(m).to.have.a.property("@@__IMMUTABLE_KEYED__@@");
  });

  it("creates a hash map", () => {
    const m = HashMap.from([
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ]);
    expect(m.size).to.equal(3);

    expect(Array.from(m)).to.deep.equal([
      [3, "c"],
      [2, "b"],
      [1, "a"],
    ]);
  });

  it("creates a string key map", () => {
    const { imMap, jsMap } = createMap(10000, () => faker.string.sample());
    expectEqual(imMap, jsMap);
  });

  it("creates a number key map", () => {
    const { imMap, jsMap } = createMap(10000, () =>
      faker.number.int({ min: 0, max: 50000 }),
    );
    expectEqual(imMap, jsMap);
  });

  it("creates a boolean keyed map", () => {
    const trueMap = HashMap.from([[true, "aaa"]]);
    const falseMap = HashMap.from([[false, "bbb"]]);
    const allMap = HashMap.from([
      [true, "aaa"],
      [false, "bbb"],
    ]);

    expectEqual(trueMap, new Map([["true", [true, "aaa"]]]));
    expectEqual(falseMap, new Map([["false", [false, "bbb"]]]));
    expectEqual(
      allMap,
      new Map([
        ["true", [true, "aaa"]],
        ["false", [false, "bbb"]],
      ]),
    );
  });

  it("creates a date-keyed map", () => {
    const { imMap, jsMap } = createMap(1000, () => faker.date.anytime());
    expectEqual(imMap, jsMap);
  });

  it("creates a object keyed map", () => {
    const { imMap, jsMap } = createMap(1000, () => randomCollisionKey());
    expectEqual(imMap, jsMap);
  });

  it("leaves map unchanged when setting the same value", () => {
    const maps = createMap(5000, () => randomCollisionKey());

    for (const [k, v] of maps.imMap.toLazySeq().take(4000)) {
      const newHashM = maps.imMap.set(k, v);
      expect(newHashM).to.equal(maps.imMap);
    }
  });

  it("iterates twice", () => {
    const { imMap, jsMap } = createMap(500, randomCollisionKey);
    const expected = sortEntries(jsMap.values());

    // iterate it twice
    expect(sortEntries(imMap)).to.deep.equal(expected);
    expect(sortEntries(imMap)).to.deep.equal(expected);

    // iterate keys twice
    const keys: Iterable<CollidingKey> = imMap.keysToLazySeq();
    expect(sortKeys(keys)).to.deep.equal(expected.map(([k]) => k));
    expect(sortKeys(keys)).to.deep.equal(expected.map(([k]) => k));

    // iterate values twice
    const vals: Iterable<string> = imMap.valuesToLazySeq();
    expect(sortValues(vals)).to.deep.equal(sortValues(expected.map(([, v]) => v)));
    expect(sortValues(vals)).to.deep.equal(sortValues(expected.map(([, v]) => v)));

    // iterate entries twoce
    const entries: Iterable<readonly [CollidingKey, string]> = imMap.toLazySeq();
    expect(sortEntries(entries)).to.deep.equal(expected);
    expect(sortEntries(entries)).to.deep.equal(expected);
  });

  it("leaves map unchanged when modifying the same value", () => {
    const maps = createMap(500, () => faker.string.sample());

    for (const [k, v] of maps.imMap.toLazySeq().take(4000)) {
      const newHashM = maps.imMap.modify(k, (old) => {
        expect(old).to.equal(v);
        return v;
      });
      expect(newHashM).to.equal(maps.imMap);
    }
  });

  it("overwrites values", () => {
    const maps = createMap(5000, () => randomCollisionKey());

    let newHashM = maps.imMap;
    const newJsMap = new Map(maps.jsMap);
    for (const [k, v] of maps.imMap.toLazySeq().take(4000)) {
      newHashM = newHashM.set(k, v + "!!!!");
      newJsMap.set(k.toString(), [k, v + "!!!!"]);
    }

    expectEqual(newHashM, newJsMap);
  });

  it("updates values", () => {
    const maps = createMap(5000, () => randomCollisionKey());

    let newImMap = maps.imMap;
    const newJsMap = new Map(maps.jsMap);
    for (const [k, v] of maps.imMap.toLazySeq().take(4000)) {
      newImMap = newImMap.modify(k, (oldV) => {
        expect(oldV).to.equal(v);
        return v + "!!!!";
      });
      newJsMap.set(k.toString(), [k, v + "!!!!"]);
    }

    expectEqual(newImMap, newJsMap);
  });

  it("inserts into empty map using alter", () => {
    const k = randomCollisionKey();
    const v = faker.string.sample();
    const m = HashMap.empty<CollidingKey, string>().alter(k, (existing) => {
      expect(existing).to.be.undefined;
      return v;
    });

    expectEqual(m, new Map([[k.toString(), [k, v]]]));

    const e = m.alter(k, (existing) => {
      expect(existing).to.equal(v);
      return undefined;
    });
    expectEqual(e, new Map());
  });

  it("deletes from empty map using alter", () => {
    const k = randomCollisionKey();
    const m = HashMap.empty<CollidingKey, string>().alter(k, (existing) => {
      expect(existing).to.be.undefined;
      return undefined;
    });

    expectEqual(m, new Map());
  });

  it("leaves map unchanged when altering the same value", () => {
    const { imMap } = createMap(5000, randomCollisionKey);

    for (const [k, v] of imMap.toLazySeq().take(1000)) {
      const newM = imMap.alter(k, (old) => {
        expect(old).to.equal(v);
        return v;
      });
      expect(newM).to.equal(imMap);
    }
  });

  it("alters values", () => {
    const { imMap, jsMap } = createMap(5000, randomCollisionKey);

    let newM = imMap;
    const newJsMap = new Map(jsMap);
    for (const [k, v] of imMap.toLazySeq().take(4900)) {
      const todo = Math.random();

      if (todo < 0.3) {
        // modify existing value
        newM = newM.alter(k, (oldV) => {
          expect(oldV).to.equal(v);
          return v + "!!!!";
        });
        newJsMap.set(k.toString(), [k, v + "!!!!"]);
      } else if (todo < 0.6) {
        // delete existing value
        newM = newM.alter(k, (oldV) => {
          expect(oldV).to.equal(v);
          return undefined;
        });
        newJsMap.delete(k.toString());
      } else {
        // add new value
        const newK = randomCollisionKey();
        const newVal = faker.string.sample();
        newM = newM.alter(newK, (oldV) => {
          expect(oldV).to.be.undefined;
          return newVal;
        });
        newJsMap.set(newK.toString(), [newK, newVal]);
      }

      // also try deleting same hash but different key
      const kDifferent = distinctKeyWithHash(k.h);
      const m = newM.alter(kDifferent, (oldV) => {
        expect(oldV).to.be.undefined;
        return undefined;
      });
      expect(m).to.equal(newM);
    }

    for (let i = 0; i < 100; i++) {
      // delete something not present
      const k = randomCollisionKey();
      const m = newM.alter(k, (oldV) => {
        expect(oldV).to.be.undefined;
        return undefined;
      });
      expect(m).to.equal(newM);
    }

    expectEqual(newM, newJsMap);
  });

  it("creates via from", () => {
    const size = 1000;
    const entries = new Array<[number, string]>(size);
    for (let i = 0; i < size; i++) {
      const k = faker.number.int({ min: 0, max: 5000 });
      const v = faker.string.sample();
      entries[i] = [k, v];
    }
    const imMap = HashMap.from(entries);
    const jsMap = new Map<string, [number, string]>(
      entries.map(([k, v]) => [k.toString(), [k, v]]),
    );

    expectEqual(imMap, jsMap);
  });

  it("creates via from and merge", () => {
    const size = 1000;
    const entries = new Array<[CollidingKey, string]>(size);
    for (let i = 0; i < size; i++) {
      const k = randomCollisionKey();
      const v = faker.string.sample();
      entries[i] = [k, v];
    }
    const imMap = HashMap.from(entries, (a, b) => a + b);

    const jsMap = new Map<string, [CollidingKey, string]>();
    for (const [k, v] of entries) {
      const oldV = jsMap.get(k.toString());
      jsMap.set(k.toString(), [k, oldV === undefined ? v : oldV[1] + v]);
    }

    expectEqual(imMap, jsMap);
  });

  it("creates via from but keeping first value", () => {
    const size = 1000;
    const entries = new Array<[CollidingKey, string]>(size * 2);
    for (let i = 0; i < size; i++) {
      const k = randomCollisionKey();
      entries[i] = [k, faker.string.sample()];
      entries[size + i] = [k, faker.string.sample()];
    }
    const imMap = HashMap.from(entries, (a) => a);

    const jsMap = new Map<string, [CollidingKey, string]>();
    for (const [k, v] of entries) {
      const oldV = jsMap.get(k.toString());
      if (oldV === undefined) {
        jsMap.set(k.toString(), [k, v]);
      }
    }

    expectEqual(imMap, jsMap);
  });

  it("creates via build", () => {
    const size = 1000;
    const values = new Array<number>(size);
    for (let i = 0; i < size; i++) {
      values[i] = faker.number.int({ min: 0, max: 5000 });
    }

    const imMap = HashMap.build(values, (v) => v + 40_000);
    const jsMap = new Map<string, [number, number]>(
      values.map((v) => [(v + 40_000).toString(), [v + 40_000, v]]),
    );

    expectEqual(imMap, jsMap);
  });

  it("creates via build with key and value", () => {
    const size = 1000;
    const ts = new Array<number>(size);
    for (let i = 0; i < size; i++) {
      ts[i] = faker.number.int({ min: 0, max: 5000 });
    }

    const imMap = HashMap.build<number, CollidingKey, string>(
      ts,
      (t) => new CollidingKey(t % 100, t + 40_000),
      (old, t) => (old ?? "") + t.toString(),
    );
    const jsMap = new Map<string, [CollidingKey, string]>();
    for (const t of ts) {
      const k = new CollidingKey(t % 100, t + 40_000);
      const oldV = jsMap.get(k.toString());
      jsMap.set(k.toString(), [
        k,
        oldV === undefined ? t.toString() : oldV[1] + t.toString(),
      ]);
    }

    expectEqual(imMap, jsMap);
  });

  it("appends to a map", () => {
    const initial = createMap(1000, () => faker.number.int({ min: 0, max: 5000 }));

    const newEntries = new Array<[number, string]>(500);
    for (let i = 0; i < 500; i++) {
      newEntries[i] = [faker.number.int({ min: 0, max: 5000 }), faker.string.sample()];
    }
    const newImMap = initial.imMap.append(newEntries);

    const newJsMap = new Map(initial.jsMap);
    for (const [k, v] of newEntries) {
      newJsMap.set(k.toString(), [k, v]);
    }

    expectEqual(initial.imMap, initial.jsMap);
    expectEqual(newImMap, newJsMap);
  });

  it("leaves map unchanged when appending existing entries", () => {
    const initial = createMap(1000, () => faker.number.int({ min: 0, max: 5000 }));

    const someEntries = initial.imMap.toLazySeq().drop(5).take(10);
    const newImMap = initial.imMap.append(someEntries);

    expect(newImMap).to.equal(initial.imMap);
  });

  it("deletes from the map", () => {
    const m = createMap(5_000, () => randomCollisionKey());

    let newImMap = m.imMap;
    const newJsMap = new Map(m.jsMap);
    for (const [kS, [k]] of m.jsMap) {
      const r = Math.random();
      if (r < 0.4) {
        newImMap = newImMap.delete(k);
        newJsMap.delete(kS);
      } else if (r < 0.5) {
        // delete with same hash but different key
        const m = newImMap.delete(distinctKeyWithHash(k.h));
        expect(m).to.equal(newImMap);
      } else if (r < 0.6) {
        // deletes with different hash
        const m = newImMap.delete(randomCollisionKey());
        expect(m).to.equal(newImMap);
      }
    }

    expectEqual(newImMap, newJsMap);
  });

  it("maps the empty map", () => {
    const m = HashMap.empty<number, string>();
    const m2 = m.mapValues((v) => v + "!");
    expect(m2.size).to.equal(0);
    expect(m).to.equal(m2);
  });

  it("maps values in a HashMap", () => {
    const m = createMap(5000, () => randomCollisionKey());

    const newImMap = m.imMap.mapValues(
      (v, k) => v + "!!!" + k.hash.toString() + "$$$" + k.x.toString(),
    );
    const newJsMap = new Map<string, [CollidingKey, string]>();
    for (const [kS, [k, v]] of m.jsMap) {
      newJsMap.set(kS, [k, v + "!!!" + k.hash.toString() + "$$$" + k.x.toString()]);
    }

    expectEqual(m.imMap, m.jsMap);
    expectEqual(newImMap, newJsMap);
  });

  it("maps values to a new type in a HashMap", () => {
    const m = createMap(5000, () => randomCollisionKey());

    const newImMap = m.imMap.mapValues((v) => v.replace(/[a-z]/g, "").length);
    const newJsMap = new Map<string, [CollidingKey, number]>();
    for (const [kS, [k, v]] of m.jsMap) {
      newJsMap.set(kS, [k, v.replace(/[a-z]/g, "").length]);
    }

    expectEqual(newImMap, newJsMap);
  });

  it("leaves map unchanged when mapping the same value", () => {
    const m = createMap(5_000, () => randomCollisionKey());

    const newImMap = m.imMap.mapValues((v) => v);
    expect(newImMap).to.equal(m.imMap);
  });

  it("only maps some of the values", () => {
    const m = createMap(5000, () => randomCollisionKey());

    const newJsMap = new Map(m.jsMap);
    const newImMap = m.imMap.mapValues((v, k) => {
      if (Math.random() < 0.2) {
        const newV = v + "@@" + k.toString();
        newJsMap.set(k.toString(), [k, newV]);
        return newV;
      } else {
        return v;
      }
    });

    expectEqual(newImMap, newJsMap);
  });

  it("collects the empty map", () => {
    const m = HashMap.empty<number, string>();
    const m2 = m.collectValues((v) => v + "!");
    expectEqual(m2, new Map());
  });

  it("collects values in an ImMap", () => {
    const m = createMap(5000, () => randomCollisionKey());

    const newImMap = m.imMap.collectValues(
      (v, k) => v + "!!!" + k.hash.toString() + "$$$" + k.x.toString(),
    );
    const newJsMap = new Map<string, [CollidingKey, string]>();
    for (const [kS, [k, v]] of m.jsMap) {
      newJsMap.set(kS, [k, v + "!!!" + k.hash.toString() + "$$$" + k.x.toString()]);
    }

    expectEqual(m.imMap, m.jsMap);
    expectEqual(newImMap, newJsMap);
  });

  it("leaves map unchanged when collecting the same value", () => {
    const m = createMap(5_000, () => randomCollisionKey());

    const newImMap = m.imMap.collectValues((v) => v);
    expect(newImMap).to.equal(m.imMap);
  });

  it("only collects some of the values", () => {
    const m = createMap(5000, () => randomCollisionKey());

    const newJsMap = new Map(m.jsMap);
    const newImMap = m.imMap.collectValues((v, k) => {
      const r = Math.random();
      if (r < 0.2) {
        // modify
        const newV = v + "@@" + k.toString();
        newJsMap.set(k.toString(), [k, newV]);
        return newV;
      } else if (r < 0.5) {
        // delete
        newJsMap.delete(k.toString());
        return r < 0.4 ? null : undefined;
      } else {
        return v;
      }
    });

    expectEqual(newImMap, newJsMap);
  });

  it("returns the empty tree when collecting everything", () => {
    const m = createMap(5_000, () => randomCollisionKey());

    const newImMap = m.imMap.collectValues(() => null);
    expectEqual(newImMap, new Map());
  });

  it("filters a map", () => {
    let imMap = HashMap.empty<CollidingKey, string | null>();
    const jsMap = new Map<string, [CollidingKey, string | null]>();
    for (let i = 0; i < 1000; i++) {
      const k = randomCollisionKey();
      const v = randomNullableStr();
      imMap = imMap.set(k, v);
      jsMap.set(k.toString(), [k, v]);
    }

    deepFreeze(imMap);

    const jsAfterFilter = new Map(jsMap);
    const newImMap = imMap.filter((v, k) => {
      expect(jsMap.get(k.toString())).to.deep.equal([k, v]);
      if (Math.random() < 0.2) {
        jsAfterFilter.delete(k.toString());
        return false;
      } else {
        return true;
      }
    });

    expectEqual(newImMap, jsAfterFilter);
  });

  it("transforms a map", () => {
    const m = createMap(500, () => randomCollisionKey()).imMap;
    const n = faker.number.int();
    expect(
      m.transform((t) => {
        expect(t).to.equal(m);
        return n;
      }),
    ).to.equal(n);
  });

  it("returns the map unchanged if nothing is filtered", () => {
    let imMap = HashMap.empty<CollidingKey, string | null>();
    for (let i = 0; i < 1000; i++) {
      const k = randomCollisionKey();
      const v = randomNullableStr();
      imMap = imMap.set(k, v);
    }

    deepFreeze(imMap);

    const filterNone = imMap.filter(() => true);

    expect(filterNone).to.equal(imMap);
  });

  it("returns empty if everything filtered", () => {
    let imMap = HashMap.empty<CollidingKey, string | null>();
    for (let i = 0; i < 1000; i++) {
      const k = randomCollisionKey();
      const v = randomNullableStr();
      imMap = imMap.set(k, v);
    }

    deepFreeze(imMap);

    const empty = imMap.filter(() => false);

    expectEqual(empty, new Map());
  });
});
