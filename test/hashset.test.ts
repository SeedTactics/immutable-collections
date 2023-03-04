/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { expect } from "chai";
import { faker } from "@faker-js/faker";
import { HashKey } from "../src/data-structures/hashing.js";
import { HashSet } from "../src/api/hashset.js";
import {
  CollidingKey,
  distinctKeyWithHash,
  randomCollisionKey,
} from "./collision-key.js";
import { deepFreeze } from "./deepfreeze.js";
import { createMap } from "./hashmap.test.js";

interface HashSetAndJsSet<K extends HashKey> {
  readonly imSet: HashSet<K>;
  readonly jsMap: Map<string, K>;
}

function sortKeys<K extends HashKey>(e: Iterable<K>): Array<K> {
  const keys = Array.from(e);
  return keys.sort((a, b) => a.toString().localeCompare(b.toString()));
}

function createSet<K extends HashKey>(size: number, key: () => K): HashSetAndJsSet<K> {
  let imSet = HashSet.empty<K>();
  const jsMap = new Map<string, K>();

  for (let i = 0; i < size; i++) {
    const k = key();
    imSet = imSet.add(k);
    jsMap.set(k.toString(), k);
  }

  deepFreeze(imSet);

  return { imSet, jsMap };
}

function expectEqual<K extends HashKey>(imSet: HashSet<K>, jsMap: Map<string, K>): void {
  const keys = sortKeys(jsMap.values());
  expect(imSet.size).to.equal(jsMap.size);

  for (const k of keys) {
    expect(imSet.has(k)).to.be.true;
  }

  expect(sortKeys(imSet)).to.deep.equal(keys);
  expect(sortKeys(imSet.toLazySeq())).to.deep.equal(keys);
  expect(sortKeys(imSet.keys())).to.deep.equal(keys);
  expect(sortKeys(imSet.values())).to.deep.equal(keys);
  expect(
    [...imSet.entries()].sort(([a], [b]) => a.toString().localeCompare(b.toString()))
  ).to.deep.equal([...keys].map((k) => [k, k]));

  const forEachEntries = new Array<K>();
  imSet.forEach((k1, k2, m) => {
    expect(m).to.equal(imSet);
    expect(k1).to.equal(k2);
    forEachEntries.push(k1);
  });
  expect(sortKeys(forEachEntries)).to.deep.equal(keys);

  const foldEntries = new Array<K>();
  const foldCnt = imSet.fold((cnt, k) => {
    foldEntries.push(k);
    return cnt + 1;
  }, 0);
  expect(foldCnt).to.equal(jsMap.size);
  expect(sortKeys(foldEntries)).to.deep.equal(keys);
}

describe("HashSet", () => {
  it("creates an empty set", () => {
    const s = HashSet.empty<number>();
    expect(s.size).to.equal(0);

    expect(s.has(100)).to.be.false;
    expectEqual(s, new Map());
  });

  it("has immutable keyed property", () => {
    const m = HashSet.empty<number>().add(2);
    expect(m).to.have.a.property("@@__IMMUTABLE_KEYED__@@");
  });

  it("creates a string set", () => {
    const { imSet, jsMap } = createSet(10_000, () => faker.datatype.string());
    expectEqual(imSet, jsMap);
  });

  it("creates a number set", () => {
    const { imSet, jsMap } = createSet(10_000, () => Math.floor(Math.random() * 20_000));
    expectEqual(imSet, jsMap);
  });

  it("iterates more than once", () => {
    const { imSet, jsMap } = createSet(500, () => faker.datatype.string());
    const expected = sortKeys(jsMap.values());

    // iterate object itself twice
    expect(sortKeys(imSet)).to.deep.equal(expected);
    expect(sortKeys(imSet)).to.deep.equal(expected);

    // iterate toLazySeq twice
    const vals = imSet.toLazySeq();
    expect(sortKeys(vals)).to.deep.equal(expected);
    expect(sortKeys(vals)).to.deep.equal(expected);
  });

  it("creates via from", () => {
    const size = 1000;
    const entries = new Array<number>(size);
    for (let i = 0; i < size; i++) {
      const k = Math.floor(Math.random() * 5000);
      entries[i] = k;
    }
    const imSet = HashSet.from(entries);
    const jsMap = new Map<string, number>(entries.map((k) => [k.toString(), k]));

    expectEqual(imSet, jsMap);
  });

  it("creates via build", () => {
    const size = 1000;
    const values = new Array<number>(size);
    for (let i = 0; i < size; i++) {
      values[i] = Math.floor(Math.random() * 5000);
    }

    const imSet = HashSet.build(values, (v) => v + 40_000);
    const jsMap = new Map<string, number>(
      values.map((v) => [(v + 40_000).toString(), v + 40_000])
    );

    expectEqual(imSet, jsMap);
  });

  it("leaves map unchanged when setting the same value", () => {
    const { imSet } = createSet(5000, () => randomCollisionKey());

    for (const k of imSet.toLazySeq().take(4000)) {
      const newHashS = imSet.add(k);
      expect(newHashS).to.equal(imSet);
    }
  });

  it("deletes from the set", () => {
    const initial = createSet(5_000, () => randomCollisionKey());

    let newImSet = initial.imSet;
    const newJsMap = new Map(initial.jsMap);
    for (const [kS, k] of initial.jsMap) {
      const r = Math.random();
      if (r < 0.4) {
        newImSet = newImSet.delete(k);
        newJsMap.delete(kS);
      } else if (r < 0.5) {
        // delete with same hash but different key
        const s = newImSet.delete(distinctKeyWithHash(k.h));
        expect(s).to.equal(newImSet);
      } else if (r < 0.6) {
        // deletes with different hash
        const s = newImSet.delete(randomCollisionKey());
        expect(s).to.equal(newImSet);
      }
    }

    expectEqual(newImSet, newJsMap);
  });

  it("appends to a set", () => {
    const initial = createSet(1000, () => randomCollisionKey());

    const newEntries = new Array<CollidingKey>(500);
    for (let i = 0; i < 500; i++) {
      newEntries[i] = randomCollisionKey();
    }
    const newImMap = initial.imSet.append(newEntries);

    const newJsMap = new Map(initial.jsMap);
    for (const k of newEntries) {
      newJsMap.set(k.toString(), k);
    }

    expectEqual(initial.imSet, initial.jsMap);
    expectEqual(newImMap, newJsMap);
  });

  it("leaves set unchanged when appending existing entries", () => {
    const { imSet: initial } = createSet(1000, () => randomCollisionKey());

    const someEntries = initial.toLazySeq().drop(5).take(10);
    const newImSet = initial.append(someEntries);

    expect(newImSet).to.equal(initial);
  });

  it("filters a set", () => {
    const initial = createSet(1000, () => randomCollisionKey());

    const jsAfterFilter = new Map(initial.jsMap);
    const newImSet = initial.imSet.filter((k) => {
      expect(initial.jsMap.get(k.toString())).to.deep.equal(k);
      if (Math.random() < 0.2) {
        jsAfterFilter.delete(k.toString());
        return false;
      } else {
        return true;
      }
    });

    expectEqual(newImSet, jsAfterFilter);
  });

  it("transforms a set", () => {
    const m = createSet(500, () => randomCollisionKey()).imSet;
    const n = faker.datatype.number();
    expect(
      m.transform((t) => {
        expect(t).to.equal(m);
        return n;
      })
    ).to.equal(n);
  });

  it("returns the set unchanged if nothing is filtered", () => {
    const initial = createSet(1000, () => randomCollisionKey());

    const filterNone = initial.imSet.filter(() => true);

    expect(filterNone).to.equal(initial.imSet);
  });

  it("returns empty if everything filtered", () => {
    const initial = createSet(1000, () => randomCollisionKey());
    const empty = initial.imSet.filter(() => false);
    expectEqual(empty, new Map());
  });

  it("returns an empty set from an empty union", () => {
    const m = HashSet.union<number>();
    expectEqual(m, new Map());
  });

  it("unions two sets", () => {
    function* unionValues(): Generator<
      { map1K: CollidingKey } | { map2K: CollidingKey }
    > {
      // want a bunch of keys in both sets
      for (let i = 0; i < 2000; i++) {
        const k = randomCollisionKey();
        yield { map1K: k };
        yield { map2K: k };
      }

      // want a bunch of keys in distinct in each sets
      for (let i = 0; i < 2000; i++) {
        yield { map1K: randomCollisionKey() };
        yield { map2K: randomCollisionKey() };
      }
    }

    // create the maps and the expected union
    let imSet1 = HashSet.empty<CollidingKey>();
    let imSet2 = HashSet.empty<CollidingKey>();
    const jsUnion = new Map<string, CollidingKey>();
    for (const x of unionValues()) {
      if ("map1K" in x) {
        imSet1 = imSet1.add(x.map1K);
        jsUnion.set(x.map1K.toString(), x.map1K);
      } else {
        imSet2 = imSet2.add(x.map2K);
        jsUnion.set(x.map2K.toString(), x.map2K);
      }
    }

    deepFreeze(imSet1);
    deepFreeze(imSet2);

    const imUnion = HashSet.union(imSet1, imSet2);
    expectEqual(imUnion, jsUnion);

    // union with itself returns unchanged
    const unionWithIteself = imSet1.union(imSet1);
    expect(unionWithIteself).is.equal(imSet1);

    const unionWithIteselfStatic = HashSet.union(imSet1, imSet1);
    expect(unionWithIteselfStatic).is.equal(imSet1);
  });

  it("returns an empty set from an empty intersection", () => {
    const s = HashSet.intersection<number>();
    expectEqual(s, new Map());
  });

  it("returns the set directly from an intersection", () => {
    const { imSet } = createSet(50, randomCollisionKey);

    const m = HashSet.intersection(imSet);
    expect(m).to.equal(imSet);
  });

  it("returns the set when intersecting with itself", () => {
    const { imSet } = createSet(1000, randomCollisionKey);

    const fromStatic = HashSet.intersection(imSet, imSet);
    expect(fromStatic).to.equal(imSet);

    const fromMethod = imSet.intersection(imSet);
    expect(fromMethod).to.equal(imSet);
  });

  it("intersection with empty set is empty", () => {
    const { imSet } = createSet(50, randomCollisionKey);
    const empty = imSet.intersection(HashSet.empty());
    expectEqual(empty, new Map());
  });

  it("intersects two sets", () => {
    function* intersectionValues(): Generator<
      { map1K: CollidingKey } | { map2K: CollidingKey } | { both: CollidingKey }
    > {
      // want a bunch of keys in both sets
      for (let i = 0; i < 2000; i++) {
        const k = randomCollisionKey();
        yield { both: k };
      }

      // want a bunch of keys in distinct in each sets
      for (let i = 0; i < 2000; i++) {
        yield { map1K: randomCollisionKey() };
        yield { map2K: randomCollisionKey() };
      }
    }

    // create the sets and the expected intersection
    let imSet1 = HashSet.empty<CollidingKey>();
    let imSet2 = HashSet.empty<CollidingKey>();
    const jsIntersection = new Map<string, CollidingKey>();
    for (const x of intersectionValues()) {
      if ("map1K" in x) {
        imSet1 = imSet1.add(x.map1K);
      } else if ("map2K" in x) {
        imSet2 = imSet2.add(x.map2K);
      } else {
        imSet1 = imSet1.add(x.both);
        imSet2 = imSet2.add(x.both);
        jsIntersection.set(x.both.toString(), x.both);
      }
    }

    deepFreeze(imSet1);
    deepFreeze(imSet2);

    const imInter = HashSet.intersection(imSet1, imSet2);
    expectEqual(imInter, jsIntersection);
  });

  it("differences two sets", () => {
    function* diffValues(): Generator<
      { map1K: CollidingKey } | { map2K: CollidingKey } | { both: CollidingKey }
    > {
      // want a bunch of keys in both sets
      for (let i = 0; i < 2000; i++) {
        const k = randomCollisionKey();
        yield { both: k };
      }

      // want a bunch of keys in distinct in each set
      for (let i = 0; i < 2000; i++) {
        yield { map1K: randomCollisionKey() };
        yield { map2K: randomCollisionKey() };
      }
    }

    // create the sets and the expected difference
    let imSet1 = HashSet.empty<CollidingKey>();
    let imSet2 = HashSet.empty<CollidingKey>();
    const jsDiff = new Map<string, CollidingKey>();
    for (const x of diffValues()) {
      if ("map1K" in x) {
        imSet1 = imSet1.add(x.map1K);
        jsDiff.set(x.map1K.toString(), x.map1K);
      } else if ("map2K" in x) {
        imSet2 = imSet2.add(x.map2K);
      } else {
        imSet1 = imSet1.add(x.both);
        imSet2 = imSet2.add(x.both);
      }
    }

    deepFreeze(imSet1);
    deepFreeze(imSet2);

    const imDiff = imSet1.difference(imSet2);
    expectEqual(imDiff, jsDiff);
  });

  it("difference with empty set is unchanged", () => {
    const { imSet } = createSet(1000, randomCollisionKey);

    const m = imSet.difference(HashSet.empty());
    expect(m).to.equal(imSet);
  });

  it("creates a key set from a HashMap", () => {
    const m = createMap(1000, randomCollisionKey);

    const imSet = m.imMap.keySet();
    const jsSet = new Map<string, CollidingKey>();
    for (const [kS, [k]] of m.jsMap) {
      jsSet.set(kS, k);
    }

    deepFreeze(imSet);
    expectEqual(imSet, jsSet);

    const newK = randomCollisionKey();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const existingK = m.imMap.keysToLazySeq().head()!;
    const imSet2 = imSet.add(newK).add(existingK);
    jsSet.set(newK.toString(), newK);

    expectEqual(imSet2, jsSet);
  });
});
