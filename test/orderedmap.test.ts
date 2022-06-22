import { expect } from "chai";
import { faker } from "@faker-js/faker";
import { mkComparisonConfig, OrderedMapKey } from "../src/comparison.js";
import { deepFreeze } from "./deepfreeze.js";
import { OrderedMap } from "../src/orderedmap.js";
import { checkMapBalanceAndSize } from "./check-balance.js";
import { randomCollisionKey } from "./collision-key.js";

interface OrderedMapAndJsMap<K extends OrderedMapKey, V> {
  readonly ordMap: OrderedMap<K, V>;
  readonly jsMap: Map<string, [K, V]>;
}

function sortEntries<K extends OrderedMapKey, V>(e: Iterable<readonly [K, V]>): Array<readonly [K, V]> {
  const cfg = mkComparisonConfig<K>();
  const entries = Array.from(e);
  return entries.sort(([k1], [k2]) => cfg.compare(k1, k2));
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

function mkNumKeyGenerator(size: number, offset?: number): () => number {
  const n = Math.random();
  if (n < 0.33) {
    // balanced
    return () => {
      return Math.floor(Math.random() * size) + (offset === undefined ? 0 : offset);
    };
  } else if (n < 0.66) {
    // more small numbers than large
    return () => {
      if (Math.random() < 0.8) {
        // small number
        return Math.floor((Math.random() * size) / 2) + (offset === undefined ? 0 : offset);
      } else {
        // large number
        return Math.floor((Math.random() * size) / 2) + size / 2 + (offset === undefined ? 0 : offset);
      }
    };
  } else {
    // more large numbers than small
    return () => {
      if (Math.random() < 0.2) {
        // small number
        return Math.floor((Math.random() * size) / 2) + (offset === undefined ? 0 : offset);
      } else {
        // large number
        return Math.floor((Math.random() * size) / 2) + size / 2 + (offset === undefined ? 0 : offset);
      }
    };
  }
}

function createMap<K extends OrderedMapKey>(size: number, key: () => K): OrderedMapAndJsMap<K, string> {
  let ordMap = OrderedMap.empty<K, string>();
  const jsMap = new Map<string, [K, string]>();

  for (let i = 0; i < size; i++) {
    const k = key();
    const v = faker.datatype.string();
    if (i % 2 === 0) {
      ordMap = ordMap.set(k, v);
      jsMap.set(k.toString(), [k, v]);
    } else {
      ordMap = ordMap.modify(k, (oldV) => (oldV === undefined ? v : oldV + v));
      const oldjV = jsMap.get(k.toString());
      jsMap.set(k.toString(), [k, oldjV === undefined ? v : oldjV[1] + v]);
    }
  }

  deepFreeze(ordMap);
  checkMapBalanceAndSize(ordMap);

  return { ordMap, jsMap };
}

function expectEqual<K extends OrderedMapKey, V>(ordMap: OrderedMap<K, V>, jsMap: Map<string, [K, V]>): void {
  const entries = sortEntries(jsMap.values());
  const revEntries = [...entries].reverse();
  expect(ordMap.size).to.equal(jsMap.size);

  for (const [k, v] of entries) {
    expect(ordMap.get(k)).to.equal(v);
    expect(ordMap.has(k)).to.be.true;
  }

  expect([...ordMap]).to.deep.equal(entries);
  expect([...ordMap.entries()]).to.deep.equal(entries);
  expect([...ordMap.toAscLazySeq()]).to.deep.equal(entries);
  expect([...ordMap.toDescLazySeq()]).to.deep.equal(revEntries);

  expect([...ordMap.keys()]).to.deep.equal(entries.map(([k]) => k));
  expect([...ordMap.keysToAscLazySeq()]).to.deep.equal(entries.map(([k]) => k));
  expect([...ordMap.keysToDescLazySeq()]).to.deep.equal(revEntries.map(([k]) => k));
  expect([...ordMap.values()]).to.deep.equal(entries.map(([_, v]) => v));
  expect([...ordMap.valuesToAscLazySeq()]).to.deep.equal(entries.map(([_, v]) => v));
  expect([...ordMap.valuesToDescLazySeq()]).to.deep.equal(revEntries.map(([_, v]) => v));

  const forEachEntries = new Array<[K, V]>();
  ordMap.forEach((v, k, m) => {
    expect(m).to.equal(ordMap);
    forEachEntries.push([k, v]);
  });
  expect(forEachEntries).to.deep.equal(entries);

  const foldlEntries = new Array<[K, V]>();
  const foldlCnt = ordMap.foldl((cnt, k, v) => {
    foldlEntries.push([k, v]);
    return cnt + 1;
  }, 0);
  expect(foldlCnt).to.equal(jsMap.size);
  expect(foldlEntries).to.deep.equal(entries);

  const foldrEntries = new Array<[K, V]>();
  const foldrCnt = ordMap.foldr((k, v, cnt) => {
    foldrEntries.push([k, v]);
    return cnt + 1;
  }, 0);
  expect(foldrCnt).to.equal(jsMap.size);
  expect(foldrEntries).to.deep.equal(revEntries);
}

describe("Ordered Map", () => {
  it("creates an empty map", () => {
    const m = OrderedMap.empty<number, string>();
    expect(m.size).to.equal(0);

    expect(m.get(100)).to.be.undefined;
    expect(m.has(100)).to.be.false;
    expect(Array.from(m)).to.deep.equal([]);
  });

  it("creates a string key map", () => {
    const { ordMap, jsMap } = createMap(10000, () => faker.datatype.string());
    expectEqual(ordMap, jsMap);
  });

  it("creates a number key map", () => {
    const { ordMap, jsMap } = createMap(10000, () => Math.floor(Math.random() * 10000));
    expectEqual(ordMap, jsMap);
  });

  it("creates a boolean keyed map", () => {
    const trueMap = OrderedMap.from([[true, "aaa"]]);
    const falseMap = OrderedMap.from([[false, "bbb"]]);
    const allMap = OrderedMap.from([
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
    const { ordMap, jsMap } = createMap(1000, () => faker.datatype.datetime());
    expectEqual(ordMap, jsMap);
  });

  it("creates a object keyed map", () => {
    const { ordMap, jsMap } = createMap(1000, () => randomCollisionKey());
    expectEqual(ordMap, jsMap);
  });

  it("leaves map unchanged when setting the same value", () => {
    const { ordMap } = createMap(10_000, mkNumKeyGenerator(20_000));

    for (const [k, v] of ordMap.toAscLazySeq().take(4000)) {
      const newM = ordMap.set(k, v);
      expect(newM).to.equal(ordMap);
    }
  });

  it("leaves map unchanged when modifying the same value", () => {
    const { ordMap } = createMap(5000, () => faker.datatype.string());

    for (const [k, v] of ordMap.toAscLazySeq().take(1000)) {
      const newM = ordMap.modify(k, (old) => {
        expect(old).to.equal(v);
        return v;
      });
      expect(newM).to.equal(ordMap);
    }
  });

  it("overwrites values", () => {
    const { ordMap, jsMap } = createMap(5000, mkNumKeyGenerator(10_000));

    let newM = ordMap;
    const newJsMap = new Map(jsMap);
    for (const [k, v] of ordMap.toAscLazySeq().take(2000)) {
      newM = newM.set(k, v + "!!!!");
      newJsMap.set(k.toString(), [k, v + "!!!!"]);
    }

    expectEqual(newM, newJsMap);
  });

  it("updates values", () => {
    const { ordMap, jsMap } = createMap(5000, mkNumKeyGenerator(10_000));

    let newM = ordMap;
    const newJsMap = new Map(jsMap);
    for (const [k, v] of ordMap.toAscLazySeq().take(4000)) {
      newM = newM.modify(k, (oldV) => {
        expect(oldV).to.equal(v);
        return v + "!!!!";
      });
      newJsMap.set(k.toString(), [k, v + "!!!!"]);
    }

    expectEqual(newM, newJsMap);
  });

  it("creates via from", () => {
    const size = 1000;
    const entries = new Array<[number, string]>(size);
    for (let i = 0; i < size; i++) {
      const k = Math.floor(Math.random() * 5000);
      const v = faker.datatype.string();
      entries[i] = [k, v];
    }
    const imMap = OrderedMap.from(entries);
    const jsMap = new Map<string, [number, string]>(entries.map(([k, v]) => [k.toString(), [k, v]]));

    checkMapBalanceAndSize(imMap);
    expectEqual(imMap, jsMap);
  });

  it("creates via from and merge", () => {
    const size = 1000;
    const entries = new Array<[number, string]>(size);
    for (let i = 0; i < size; i++) {
      const k = Math.floor(Math.random() * 5000);
      const v = faker.datatype.string();
      entries[i] = [k, v];
    }
    const imMap = OrderedMap.from(entries, (a, b) => a + b);

    const jsMap = new Map<string, [number, string]>();
    for (const [k, v] of entries) {
      const oldV = jsMap.get(k.toString());
      jsMap.set(k.toString(), [k, oldV === undefined ? v : oldV[1] + v]);
    }

    checkMapBalanceAndSize(imMap);
    expectEqual(imMap, jsMap);
  });

  it("creates via build", () => {
    const size = 1000;
    const values = new Array<number>(size);
    for (let i = 0; i < size; i++) {
      values[i] = Math.floor(Math.random() * 5000);
    }

    const imMap = OrderedMap.build(values, (v) => v + 40_000);
    const jsMap = new Map<string, [number, number]>(values.map((v) => [(v + 40_000).toString(), [v + 40_000, v]]));

    checkMapBalanceAndSize(imMap);
    expectEqual(imMap, jsMap);
  });

  it("creates via build with key and value", () => {
    const size = 1000;
    const ts = new Array<number>(size);
    for (let i = 0; i < size; i++) {
      ts[i] = faker.datatype.number({ min: 0, max: 5000 });
    }

    const imMap = OrderedMap.build<number, string, string>(
      ts,
      (t) => "key " + (t + 40_000).toString(),
      (old, t) => (old ?? "") + t.toString()
    );
    const jsMap = new Map<string, [string, string]>();
    for (const t of ts) {
      const k = "key " + (t + 40_000).toString();
      const oldV = jsMap.get(k);
      jsMap.set(k, [k, oldV === undefined ? t.toString() : oldV[1] + t.toString()]);
    }

    checkMapBalanceAndSize(imMap);
    expectEqual(imMap, jsMap);
  });

  it("deletes from OrderedMap", () => {
    const { ordMap, jsMap } = createMap(5000, mkNumKeyGenerator(10_000));

    let newM = ordMap;
    const newJsMap = new Map(jsMap);
    for (const [kS, [k]] of jsMap) {
      const r = Math.random();
      if (r < 0.4) {
        newM = newM.delete(k);
        newJsMap.delete(kS);
      } else if (r < 0.5) {
        // delete with key which doesn't exist
        const m = newM.delete(k + 20_000);
        expect(m).to.equal(newM);
      }
    }

    checkMapBalanceAndSize(newM);

    expectEqual(newM, newJsMap);
  });

  it("maps the empty map", () => {
    const m = OrderedMap.empty<number, string>();
    const m2 = m.mapValues((v) => v + "!");
    expect(m2.size).to.equal(0);
    expect(m).to.equal(m2);
  });

  it("maps values in an OrderedMap", () => {
    const { ordMap, jsMap } = createMap(5000, mkNumKeyGenerator(10_000));

    const newM = ordMap.mapValues((v, k) => v + "!!!" + k.toString());
    const newJsMap = new Map<string, [number, string]>();
    for (const [kS, [k, v]] of jsMap) {
      newJsMap.set(kS, [k, v + "!!!" + k.toString()]);
    }

    checkMapBalanceAndSize(newM);

    expectEqual(newM, newJsMap);
  });

  it("leaves map unchanged when mapping the same value", () => {
    const { ordMap } = createMap(5000, mkNumKeyGenerator(10_000));

    const newM = ordMap.mapValues((v) => v);
    expect(newM).to.equal(ordMap);
  });

  it("only maps some of the values", () => {
    const { ordMap, jsMap } = createMap(5000, mkNumKeyGenerator(10_000));

    const newJsMap = new Map(jsMap);
    const newImMap = ordMap.mapValues((v, k) => {
      if (k > 6000) {
        const newV = v + "@@" + k.toString();
        newJsMap.set(k.toString(), [k, newV]);
        return newV;
      } else {
        return v;
      }
    });

    checkMapBalanceAndSize(newImMap);

    expectEqual(newImMap, newJsMap);
  });

  it("collects the empty map", () => {
    const m = OrderedMap.empty<number, string>();
    const m2 = m.collectValues((v) => v + "!");
    expectEqual(m2, new Map());
  });

  it("collects values in an ImMap", () => {
    const { ordMap, jsMap } = createMap(5000, mkNumKeyGenerator(10_000));

    const newM = ordMap.collectValues((v, k) => v + "!!!" + k.toString());
    const newJsMap = new Map<string, [number, string]>();
    for (const [kS, [k, v]] of jsMap) {
      newJsMap.set(kS, [k, v + "!!!" + k.toString()]);
    }

    checkMapBalanceAndSize(newM);
    expectEqual(newM, newJsMap);
  });

  it("leaves map unchanged when collecting the same value", () => {
    const { ordMap } = createMap(5000, mkNumKeyGenerator(10_000));

    const newM = ordMap.collectValues((v) => v);
    expect(newM).to.equal(ordMap);
  });

  it("only collects some of the values", () => {
    const { ordMap, jsMap } = createMap(5000, mkNumKeyGenerator(10_000));

    const newJsMap = new Map(jsMap);
    const newM = ordMap.collectValues((v, k) => {
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

    checkMapBalanceAndSize(newM);
    expectEqual(newM, newJsMap);
  });

  it("returns the empty tree when collecting everything", () => {
    const { ordMap } = createMap(5000, mkNumKeyGenerator(10_000));

    const newM = ordMap.collectValues(() => null);
    expectEqual(newM, new Map());
  });

  it("filters a map", () => {
    let imMap = OrderedMap.empty<number, string | null>();
    const jsMap = new Map<string, [number, string | null]>();
    for (let i = 0; i < 1000; i++) {
      const k = Math.floor(Math.random() * 3000);
      const v = randomNullableStr();
      imMap = imMap.set(k, v);
      jsMap.set(k.toString(), [k, v]);
    }

    deepFreeze(imMap);
    checkMapBalanceAndSize(imMap);

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

    checkMapBalanceAndSize(newImMap);
    expectEqual(newImMap, jsAfterFilter);
  });

  it("returns the map unchanged if nothing is filtered", () => {
    let imMap = OrderedMap.empty<number, string | null>();
    for (let i = 0; i < 1000; i++) {
      const k = Math.floor(Math.random() * 3000);
      const v = randomNullableStr();
      imMap = imMap.set(k, v);
    }

    deepFreeze(imMap);
    checkMapBalanceAndSize(imMap);

    const filterNone = imMap.filter(() => true);

    expect(filterNone).to.equal(imMap);
  });

  it("returns empty if everything filtered", () => {
    let imMap = OrderedMap.empty<number, string | null>();
    for (let i = 0; i < 1000; i++) {
      const k = Math.floor(Math.random() * 3000);
      const v = randomNullableStr();
      imMap = imMap.set(k, v);
    }

    deepFreeze(imMap);
    checkMapBalanceAndSize(imMap);

    const empty = imMap.filter(() => false);

    expectEqual(empty, new Map());
  });

  it("unions two maps", () => {
    function* unionValues(): Generator<
      { map1K: number; map1V: string | null } | { map2K: number; map2V: string | null }
    > {
      // want a bunch of keys in both maps
      const keygen = mkNumKeyGenerator(10_000);
      for (let i = 0; i < 2000; i++) {
        // keys are multiple of three
        const k = keygen() * 3;
        yield { map1K: k, map1V: randomNullableStr() };
        yield { map2K: k, map2V: randomNullableStr() };
      }

      // want a bunch of keys in distinct in each map
      for (let i = 0; i < 2000; i++) {
        // to keep distinct, use keys congruent to 1 mod 3 and 2 mod 3
        const k = keygen();
        yield { map1K: k * 3 + 1, map1V: randomNullableStr() };
        yield { map2K: k * 3 + 2, map2V: randomNullableStr() };
      }
    }

    // create the maps
    let imMap1 = OrderedMap.empty<number, string | null>();
    let imMap2 = OrderedMap.empty<number, string | null>();
    const jsMap1 = new Map<string, [number, string | null]>();
    const jsMap2 = new Map<string, [number, string | null]>();
    for (const x of unionValues()) {
      if ("map1K" in x) {
        imMap1 = imMap1.set(x.map1K, x.map1V);
        const kS = x.map1K.toString();
        jsMap1.set(kS, [x.map1K, x.map1V]);
      } else {
        imMap2 = imMap2.set(x.map2K, x.map2V);
        const kS = x.map2K.toString();
        jsMap2.set(kS, [x.map2K, x.map2V]);
      }
    }

    deepFreeze(imMap1);
    deepFreeze(imMap2);
    checkMapBalanceAndSize(imMap1);
    checkMapBalanceAndSize(imMap2);

    // create the union into jsMap1
    for (const [kS, [k, v]] of jsMap2) {
      const old = jsMap1.get(kS);
      if (old) {
        jsMap1.set(kS, [k, combineNullableStr(old[1], v)]);
      } else {
        jsMap1.set(kS, [k, v]);
      }
    }

    const imUnion = imMap1.union(imMap2, combineNullableStr);
    expectEqual(imUnion, jsMap1);

    checkMapBalanceAndSize(imUnion);

    // union with itself returns unchanged
    const unionWithIteself = imMap1.union(imMap1);
    expect(unionWithIteself).is.equal(imMap1);
  });

  it("unions three maps", () => {
    const maps = Array<OrderedMapAndJsMap<number, string>>();
    for (let i = 0; i < 3; i++) {
      maps.push(createMap(100 + i * 1000, mkNumKeyGenerator(5000)));
      // add an empty map, which should be filtered out
      maps.push({
        ordMap: OrderedMap.empty<number, string>(),
        jsMap: new Map(),
      });
    }

    const newImMap = OrderedMap.union((a, b) => a + b, ...maps.map((i) => i.ordMap));

    checkMapBalanceAndSize(newImMap);

    const newJsMap = new Map<string, [number, string]>();
    for (const { jsMap } of maps) {
      for (const [kS, [k, v]] of jsMap) {
        const oldV = newJsMap.get(kS);
        newJsMap.set(kS, [k, oldV === undefined ? v : oldV[1] + v]);
      }
    }

    expectEqual(newImMap, newJsMap);

    // unchanged when unioning with itself
    const unionWithItself = OrderedMap.union((a) => a, maps[0].ordMap, maps[0].ordMap);
    expect(unionWithItself).is.equal(maps[0].ordMap);
  });

  it("unions a small map with a big map", () => {
    const bigMap = createMap(5000, mkNumKeyGenerator(10_000));

    const smallMap = createMap(10, mkNumKeyGenerator(10_000));

    const jsUnion = new Map(bigMap.jsMap);
    for (const [k, v] of smallMap.jsMap) {
      jsUnion.set(k, v);
    }

    const bigOnLeft = bigMap.ordMap.union(smallMap.ordMap);
    expectEqual(bigOnLeft, jsUnion);
    checkMapBalanceAndSize(bigOnLeft);

    const bigOnRight = smallMap.ordMap.union(bigMap.ordMap, (s) => s);
    expectEqual(bigOnRight, jsUnion);
    checkMapBalanceAndSize(bigOnRight);
  });

  it("returns empty from the empty union", () => {
    const m = OrderedMap.union<number, string>((a) => a);
    expect(m.size).to.equal(0);
  });

  it("returns an empty map from an empty intersection", () => {
    const m = OrderedMap.intersection<number, string>((a, b) => a + b);
    expect(m.size === 0);
    expect(Array.from(m)).to.be.empty;
  });

  it("returns the map directly from an intersection", () => {
    const { ordMap } = createMap(50, mkNumKeyGenerator(1000));

    const m = OrderedMap.intersection((a, b) => a + b, ordMap);
    expect(m).to.equal(ordMap);
  });

  it("returns empty if one side is empty from an intersection", () => {
    const { ordMap } = createMap(50, mkNumKeyGenerator(1000));

    let empty = OrderedMap.intersection((a, b) => a + b, ordMap, OrderedMap.empty<number, string>());
    expectEqual(empty, new Map());

    empty = OrderedMap.intersection((a, b) => a + b, OrderedMap.empty<number, string>(), ordMap);
    expectEqual(empty, new Map());
  });

  it("intersects two maps", () => {
    function* intersectionValues(): Generator<
      | { map1K: number; map1V: string | null }
      | { map2K: number; map2V: string | null }
      | { both: number; val1: string | null; val2: string | null }
    > {
      const keygen = mkNumKeyGenerator(10_000);
      // want a bunch of keys in both maps
      for (let i = 0; i < 2000; i++) {
        const k = keygen() * 3;
        yield { both: k, val1: randomNullableStr(), val2: randomNullableStr() };
      }

      // want a bunch of keys in distinct in each map
      for (let i = 0; i < 2000; i++) {
        const k = keygen();
        yield { map1K: k * 3 + 1, map1V: randomNullableStr() };
        yield { map2K: k * 3 + 2, map2V: randomNullableStr() };
      }
    }

    // create the maps and the expected union
    let imMap1 = OrderedMap.empty<number, string | null>();
    let imMap2 = OrderedMap.empty<number, string | null>();
    const jsIntersection = new Map<string, [number, string | null]>();
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
    checkMapBalanceAndSize(imMap1);
    checkMapBalanceAndSize(imMap2);

    const imInter = OrderedMap.intersection(combineNullableStr, imMap1, imMap2);
    expectEqual(imInter, jsIntersection);
    checkMapBalanceAndSize(imInter);

    const imInter2 = imMap1.intersection(imMap2, combineNullableStr);
    expectEqual(imInter2, jsIntersection);
    checkMapBalanceAndSize(imInter2);

    // intersection with itself returns unchanged
    const interWithIteself = OrderedMap.intersection((_, b) => b, imMap1, imMap1);
    expect(interWithIteself).is.equal(imMap1);

    const interWithItself2 = imMap1.intersection(imMap1);
    expect(interWithItself2).is.equal(imMap1);
  });
});
