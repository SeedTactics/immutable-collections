import { expect } from "chai";
import { faker } from "@faker-js/faker";
import { HashKey } from "../src/hashing.js";
import { ImMap } from "../src/immap.js";
import { sortByProp } from "../src/lazyseq.js";

interface ImMapAndJsMap<K extends HashKey, V> {
  readonly imMap: ImMap<K, V>;
  readonly jsMap: Map<string, readonly [K, V]>;
}

function sortEntries<K extends HashKey, V>(e: Iterable<readonly [K, V]>): Array<readonly [K, V]> {
  const entries = Array.from(e);
  return entries.sort(sortByProp(([k]) => k.toString()));
}

function createViaSet<K extends HashKey, V>(size: number, key: () => K, val: () => V): ImMapAndJsMap<K, V> {
  let imMap = ImMap.empty<K, V>();
  const jsMap = new Map<string, [K, V]>();

  for (let i = 0; i < size; i++) {
    const k = key();
    const v = val();
    imMap = imMap.set(k, v);
    jsMap.set(k.toString(), [k, v]);
  }

  return { imMap, jsMap };
}

function expectEqual<K extends HashKey, V>({ imMap, jsMap }: ImMapAndJsMap<K, V>): void {
  const entries = sortEntries(jsMap.values());
  expect(imMap.size).to.equal(entries.length);
  expect(imMap.size).to.equal(imMap.fold((cnt) => cnt + 1, 0));

  for (const [k, v] of entries) {
    expect(imMap.get(k)).to.equal(v);
    expect(imMap.has(k)).to.be.true;
  }

  expect(sortEntries(Array.from(imMap))).to.deep.equal(entries);
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
    const maps = createViaSet(
      10000,
      () => faker.datatype.string(),
      () => faker.datatype.number()
    );
    expectEqual(maps);
  });

  it("creates a number key map", () => {
    const maps = createViaSet(
      10000,
      () => faker.datatype.number({ min: 0, max: 80000 }),
      () => faker.datatype.string()
    );
    expectEqual(maps);
  });

  //  const k = new Key(faker.datatype.number({ min: -20, max: 20 }), faker.datatype.number({ min: 0, max: 100 })));
});
