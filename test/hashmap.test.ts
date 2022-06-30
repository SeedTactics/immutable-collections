/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { expect } from "chai";
import { faker } from "@faker-js/faker";
import { HashKey } from "../src/data-structures/hashing.js";
import { HashMap } from "../src/api/hashmap.js";
import { mkCompareByProperties } from "../src/data-structures/comparison.js";
import { CollidingKey, createKeyWithSameHash, distinctKeyWithHash, randomCollisionKey } from "./collision-key.js";
import { deepFreeze } from "./deepfreeze.js";

interface HashMapAndJsMap<K extends HashKey, V> {
  readonly imMap: HashMap<K, V>;
  readonly jsMap: Map<string, [K, V]>;
}

function sortEntries<K extends HashKey, V>(e: Iterable<readonly [K, V]>): Array<readonly [K, V]> {
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

function randomNullableStr(): string | null {
  if (Math.random() < 0.1) return null;
  return faker.datatype.string();
}

function combineNullableStr(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a + b;
}

export function createMap<K extends HashKey>(size: number, key: () => K): HashMapAndJsMap<K, string> {
  let imMap = HashMap.empty<K, string>();
  const jsMap = new Map<string, [K, string]>();

  for (let i = 0; i < size; i++) {
    const k = key();
    const v = faker.datatype.string();
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

function expectEqual<K extends HashKey, V>(imMap: HashMap<K, V>, jsMap: Map<string, [K, V]>): void {
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
  expect(sortValues(imMap.values())).to.deep.equal(sortValues(entries.map(([_, v]) => v)));
  expect(sortValues(imMap.valuesToLazySeq())).to.deep.equal(sortValues(entries.map(([_, v]) => v)));

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
    const { imMap, jsMap } = createMap(10000, () => faker.datatype.string());
    expectEqual(imMap, jsMap);
  });

  it("creates a number key map", () => {
    const { imMap, jsMap } = createMap(10000, () => faker.datatype.number({ min: 0, max: 50000 }));
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
      ])
    );
  });

  it("creates a date-keyed map", () => {
    const { imMap, jsMap } = createMap(1000, () => faker.datatype.datetime());
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

  it("leaves map unchanged when modifying the same value", () => {
    const maps = createMap(500, () => faker.datatype.string());

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
    const v = faker.datatype.string();
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
        // add new value (use odd key)
        const newK = randomCollisionKey();
        const newVal = faker.datatype.string();
        newM = newM.alter(newK, (oldV) => {
          expect(oldV).to.be.undefined;
          return newVal;
        });
        newJsMap.set(newK.toString(), [newK, newVal]);
      }
    }

    expectEqual(newM, newJsMap);
  });

  it("creates via from", () => {
    const size = 1000;
    const entries = new Array<[number, string]>(size);
    for (let i = 0; i < size; i++) {
      const k = faker.datatype.number({ min: 0, max: 5000 });
      const v = faker.datatype.string();
      entries[i] = [k, v];
    }
    const imMap = HashMap.from(entries);
    const jsMap = new Map<string, [number, string]>(entries.map(([k, v]) => [k.toString(), [k, v]]));

    expectEqual(imMap, jsMap);
  });

  it("creates via from and merge", () => {
    const size = 1000;
    const entries = new Array<[CollidingKey, string]>(size);
    for (let i = 0; i < size; i++) {
      const k = randomCollisionKey();
      const v = faker.datatype.string();
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

  it("creates via build", () => {
    const size = 1000;
    const values = new Array<number>(size);
    for (let i = 0; i < size; i++) {
      values[i] = faker.datatype.number({ min: 0, max: 5000 });
    }

    const imMap = HashMap.build(values, (v) => v + 40_000);
    const jsMap = new Map<string, [number, number]>(values.map((v) => [(v + 40_000).toString(), [v + 40_000, v]]));

    expectEqual(imMap, jsMap);
  });

  it("creates via build with key and value", () => {
    const size = 1000;
    const ts = new Array<number>(size);
    for (let i = 0; i < size; i++) {
      ts[i] = faker.datatype.number({ min: 0, max: 5000 });
    }

    const imMap = HashMap.build<number, CollidingKey, string>(
      ts,
      (t) => new CollidingKey(t % 100, t + 40_000),
      (old, t) => (old ?? "") + t.toString()
    );
    const jsMap = new Map<string, [CollidingKey, string]>();
    for (const t of ts) {
      const k = new CollidingKey(t % 100, t + 40_000);
      const oldV = jsMap.get(k.toString());
      jsMap.set(k.toString(), [k, oldV === undefined ? t.toString() : oldV[1] + t.toString()]);
    }

    expectEqual(imMap, jsMap);
  });

  it("appends to a map", () => {
    const initial = createMap(1000, () => faker.datatype.number({ min: 0, max: 5000 }));

    const newEntries = new Array<[number, string]>(500);
    for (let i = 0; i < 500; i++) {
      newEntries[i] = [faker.datatype.number({ min: 0, max: 5000 }), faker.datatype.string()];
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
    const initial = createMap(1000, () => faker.datatype.number({ min: 0, max: 5000 }));

    const someEntries = initial.imMap.toLazySeq().drop(5).take(10);
    const newImMap = initial.imMap.append(someEntries);

    expect(newImMap).to.equal(initial.imMap);
  });

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

  it("maps values in an ImMap", () => {
    const m = createMap(5000, () => randomCollisionKey());

    const newImMap = m.imMap.mapValues((v, k) => v + "!!!" + k.hash.toString() + "$$$" + k.x.toString());
    const newJsMap = new Map<string, [CollidingKey, string]>();
    for (const [kS, [k, v]] of m.jsMap) {
      newJsMap.set(kS, [k, v + "!!!" + k.hash.toString() + "$$$" + k.x.toString()]);
    }

    expectEqual(m.imMap, m.jsMap);
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

    const newImMap = m.imMap.collectValues((v, k) => v + "!!!" + k.hash.toString() + "$$$" + k.x.toString());
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

  it("returns empty if everyhing filtered", () => {
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

    let empty = HashMap.intersection((a, b) => a + b, imMap, HashMap.empty<CollidingKey, string>());
    expectEqual(empty, new Map());

    empty = imMap.intersection(HashMap.empty<CollidingKey, string>());
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
    }

    // create the maps and the expected union
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
        jsIntersection.set(x.both.toString(), [x.both, combineNullableStr(x.val1, x.val2)]);
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
