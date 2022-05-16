import { expect } from "chai";
import { faker } from "@faker-js/faker";
import { HashKey } from "../src/hashing.js";
import { ImMap } from "../src/immap.js";
import { sortByProp } from "../src/lazyseq.js";

interface ImMapAndJsMap<K extends HashKey, V> {
  readonly imMap: ImMap<K, V>;
  readonly jsMap: Map<string, [K, V]>;
}

function sortEntries<K extends HashKey, V>(e: Iterable<readonly [K, V]>): Array<readonly [K, V]> {
  const entries = Array.from(e);
  return entries.sort(sortByProp(([k]) => k.toString()));
}

function sortKeys<K extends HashKey>(e: Iterable<K>): Array<K> {
  const keys = Array.from(e);
  return keys.sort(sortByProp((k) => k.toString()));
}

function sortValues<V>(e: Iterable<V>): Array<V> {
  const values = Array.from(e);
  return values.sort();
}

function extendMap<K extends HashKey>(
  size: number,
  key: () => K,
  old: ImMapAndJsMap<K, string>
): ImMapAndJsMap<K, string> {
  let imMap = old.imMap;
  const jsMap = new Map<string, [K, string]>(old.jsMap);

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

  return { imMap, jsMap };
}

function expectEqual<K extends HashKey, V>({ imMap, jsMap }: ImMapAndJsMap<K, V>): void {
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
  const foldCnt = imMap.fold((cnt, v, k) => {
    foldEntries.push([k, v]);
    return cnt + 1;
  }, 0);
  expect(foldCnt).to.equal(jsMap.size);
  expect(sortEntries(foldEntries)).to.deep.equal(entries);
}

describe("ImMap", () => {
  it("creates an empty ImMap", () => {
    const m = ImMap.empty<number, string>();
    expect(m.size).to.equal(0);

    expect(m.get(100)).to.be.undefined;
    expect(m.has(100)).to.be.false;
    expect(Array.from(m)).to.deep.equal([]);
  });

  it("creates a ImMap", () => {
    const m = ImMap.from([
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
    const maps = extendMap(10000, () => faker.datatype.string(), {
      imMap: ImMap.empty<string, string>(),
      jsMap: new Map(),
    });
    expectEqual(maps);
  });

  it("creates a number key map", () => {
    const maps = extendMap(10000, () => faker.datatype.number({ min: 0, max: 50000 }), {
      imMap: ImMap.empty<number, string>(),
      jsMap: new Map(),
    });
    expectEqual(maps);
  });

  it("leaves map unchanged when setting the same value", () => {
    const maps = extendMap(500, () => faker.datatype.string(), {
      imMap: ImMap.empty<string, string>(),
      jsMap: new Map(),
    });

    const [k, v] = maps.imMap.toLazySeq().drop(5).head() ?? ["a", "b"];
    const newImMap = maps.imMap.set(k, v);

    expect(newImMap).to.equal(maps.imMap);
  });

  it("leaves map unchanged when modifying the same value", () => {
    const maps = extendMap(500, () => faker.datatype.string(), {
      imMap: ImMap.empty<string, string>(),
      jsMap: new Map(),
    });

    const [k, v] = maps.imMap.toLazySeq().drop(5).head() ?? ["a", "b"];
    const newImMap = maps.imMap.modify(k, (old) => {
      expect(old).to.equal(v);
      return v;
    });

    expect(newImMap).to.equal(maps.imMap);
  });

  it("creates via from", () => {
    const size = 1000;
    const entries = new Array<[number, string]>(size);
    for (let i = 0; i < size; i++) {
      const k = faker.datatype.number({ min: 0, max: 5000 });
      const v = faker.datatype.string();
      entries[i] = [k, v];
    }
    const imMap = ImMap.from(entries);
    const jsMap = new Map<string, [number, string]>(entries.map(([k, v]) => [k.toString(), [k, v]]));

    expectEqual({ imMap, jsMap });
  });

  it("creates via from and merge", () => {
    const size = 1000;
    const entries = new Array<[number, string]>(size);
    for (let i = 0; i < size; i++) {
      const k = faker.datatype.number({ min: 0, max: 5000 });
      const v = faker.datatype.string();
      entries[i] = [k, v];
    }
    const imMap = ImMap.from(entries, (a, b) => a + b);

    const jsMap = new Map<string, [number, string]>();
    for (const [k, v] of entries) {
      const oldV = jsMap.get(k.toString());
      jsMap.set(k.toString(), [k, oldV === undefined ? v : oldV[1] + v]);
    }

    expectEqual({ imMap, jsMap });
  });

  it("creates via build", () => {
    const size = 1000;
    const values = new Array<number>(size);
    for (let i = 0; i < size; i++) {
      values[i] = faker.datatype.number({ min: 0, max: 5000 });
    }

    const imMap = ImMap.build(values, (v) => v + 40_000);
    const jsMap = new Map<string, [number, number]>(values.map((v) => [(v + 40_000).toString(), [v + 40_000, v]]));

    expectEqual({ imMap, jsMap });
  });

  it("creates via build with key and value", () => {
    const size = 1000;
    const ts = new Array<number>(size);
    for (let i = 0; i < size; i++) {
      ts[i] = faker.datatype.number({ min: 0, max: 5000 });
    }

    const imMap = ImMap.build<number, number, string>(
      ts,
      (t) => t + 40_000,
      (old, t) => (old ?? "") + t.toString()
    );
    const jsMap = new Map<string, [number, string]>();
    for (const t of ts) {
      const oldV = jsMap.get((t + 40_000).toString());
      jsMap.set((t + 40_000).toString(), [t + 40_000, oldV === undefined ? t.toString() : oldV[1] + t.toString()]);
    }

    expectEqual({ imMap, jsMap });
  });

  it("appends to a map", () => {
    const initial = extendMap(1000, () => faker.datatype.number({ min: 0, max: 5000 }), {
      imMap: ImMap.empty<number, string>(),
      jsMap: new Map(),
    });

    const newEntries = new Array<[number, string]>(500);
    for (let i = 0; i < 500; i++) {
      newEntries[i] = [faker.datatype.number({ min: 0, max: 5000 }), faker.datatype.string()];
    }
    const newImMap = initial.imMap.append(newEntries);

    const newJsMap = new Map(initial.jsMap);
    for (const [k, v] of newEntries) {
      newJsMap.set(k.toString(), [k, v]);
    }

    expectEqual(initial);
    expectEqual({ imMap: newImMap, jsMap: newJsMap });
  });

  it("appends to a map with merge", () => {
    const initial = extendMap(1000, () => faker.datatype.number({ min: 0, max: 5000 }), {
      imMap: ImMap.empty<number, string>(),
      jsMap: new Map(),
    });

    const newEntries = new Array<[number, string]>(500);
    for (let i = 0; i < 500; i++) {
      newEntries[i] = [faker.datatype.number({ min: 0, max: 5000 }), faker.datatype.string()];
    }
    const newImMap = initial.imMap.append(newEntries, (a, b) => a + b);

    const newJsMap = new Map(initial.jsMap);
    for (const [k, v] of newEntries) {
      const oldV = newJsMap.get(k.toString());
      newJsMap.set(k.toString(), [k, oldV === undefined ? v : oldV[1] + v]);
    }

    expectEqual(initial);
    expectEqual({ imMap: newImMap, jsMap: newJsMap });
  });

  it("leaves map unchanged when appending existing entries", () => {
    const initial = extendMap(1000, () => faker.datatype.number({ min: 0, max: 5000 }), {
      imMap: ImMap.empty<number, string>(),
      jsMap: new Map(),
    });

    const someEntries = initial.imMap.toLazySeq().drop(5).take(10);
    const newImMap = initial.imMap.append(someEntries);

    expect(newImMap).to.equal(initial.imMap);
  });

  it("returns an empty map from an empty union", () => {
    const m = ImMap.union<number, string>((a, b) => a + b);
    expect(m.size === 0);
    expect(Array.from(m)).to.be.empty;
  });

  it("returns the map directly from a union", () => {
    const maps = extendMap(1000, () => faker.datatype.number({ min: 0, max: 5000 }), {
      imMap: ImMap.empty<number, string>(),
      jsMap: new Map(),
    });

    const m = ImMap.union<number, string>((a, b) => a + b, maps.imMap);
    expect(m).to.equal(maps.imMap);
  });

  it("unions two maps", () => {
    const m1 = extendMap(500, () => faker.datatype.number({ min: 0, max: 5000 }), {
      imMap: ImMap.empty<number, string>(),
      jsMap: new Map(),
    });
    const m2 = extendMap(500, () => faker.datatype.number({ min: 0, max: 5000 }), {
      imMap: ImMap.empty<number, string>(),
      jsMap: new Map(),
    });

    const newImMap = ImMap.union<number, string>((a, b) => a + b, m1.imMap, m2.imMap);

    const newJsMap = new Map(m1.jsMap);
    for (const [kS, [k, v]] of m2.jsMap) {
      const oldV = newJsMap.get(kS);
      newJsMap.set(kS, [k, oldV === undefined ? v : oldV[1] + v]);
    }

    expectEqual({ imMap: newImMap, jsMap: newJsMap });
  });

  //  const k = new Key(faker.datatype.number({ min: -20, max: 20 }), faker.datatype.number({ min: 0, max: 100 })));

  //todo: delete, union
});