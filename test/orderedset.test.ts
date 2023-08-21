/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { expect } from "chai";
import { faker } from "@faker-js/faker";
import { deepFreeze } from "./deepfreeze.js";
import { createMap } from "./orderedmap.test.js";
import { OrderedMapKey, OrderedSet } from "../src/api/classes.js";
import { checkSetBalanceAndSize } from "./check-balance.js";
import { mkNumKeyGenerator } from "./orderedmap.test.js";
import { mkComparisonConfig } from "../src/data-structures/comparison.js";

interface OrderedSetAndJsSet<K extends OrderedMapKey> {
  readonly imSet: OrderedSet<K>;
  readonly jsMap: Map<string, K>;
}

function sortKeys<K extends OrderedMapKey>(e: Iterable<K>): Array<K> {
  const keys = Array.from(e);
  return keys.sort(mkComparisonConfig().compare);
}

function createSet<K extends OrderedMapKey>(
  size: number,
  key: () => K
): OrderedSetAndJsSet<K> {
  let imSet = OrderedSet.empty<K>();
  const jsMap = new Map<string, K>();

  for (let i = 0; i < size; i++) {
    const k = key();
    imSet = imSet.add(k);
    jsMap.set(k.toString(), k);
  }

  deepFreeze(imSet);
  checkSetBalanceAndSize(imSet);

  return { imSet, jsMap };
}

function expectEqual<K extends OrderedMapKey>(
  imSet: OrderedSet<K>,
  jsMap: Map<string, K>
): void {
  const keys = sortKeys(jsMap.values());
  expect(imSet.size).to.equal(jsMap.size);

  for (const k of keys) {
    expect(imSet.has(k)).to.be.true;
  }

  expect([...imSet]).to.deep.equal(keys);
  expect([...imSet.toAscLazySeq()]).to.deep.equal(keys);
  expect([...imSet.toDescLazySeq()]).to.deep.equal([...keys].reverse());
  expect([...imSet.keys()]).to.deep.equal(keys);
  expect([...imSet.values()]).to.deep.equal(keys);
  expect([...imSet.entries()]).to.deep.equal(keys.map((k) => [k, k]));

  const forEachEntries = new Array<K>();
  imSet.forEach((k1, k2, m) => {
    expect(m).to.equal(imSet);
    expect(k1).to.equal(k2);
    forEachEntries.push(k1);
  });
  expect(forEachEntries).to.deep.equal(keys);

  const foldlEntries = new Array<K>();
  const foldlCnt = imSet.foldl((cnt, k) => {
    foldlEntries.push(k);
    return cnt + 1;
  }, 0);
  expect(foldlCnt).to.equal(jsMap.size);
  expect(foldlEntries).to.deep.equal(keys);

  const foldrEntries = new Array<K>();
  const foldrCnt = imSet.foldr((k, cnt) => {
    foldrEntries.push(k);
    return cnt + 1;
  }, 0);
  expect(foldrCnt).to.equal(jsMap.size);
  expect(foldrEntries).to.deep.equal([...keys].reverse());
}

describe("OrderedSet", () => {
  it("creates an empty set", () => {
    const s = OrderedSet.empty<number>();
    expect(s.size).to.equal(0);

    expect(s.has(100)).to.be.false;
    expectEqual(s, new Map());
  });

  it("has immutable keyed property", () => {
    const m = OrderedSet.empty<number>().add(2);
    expect(m).to.have.a.property("@@__IMMUTABLE_KEYED__@@");
  });

  it("creates a string set", () => {
    const { imSet, jsMap } = createSet(10_000, () => faker.string.sample());
    expectEqual(imSet, jsMap);
  });

  it("creates a number set", () => {
    const { imSet, jsMap } = createSet(10_000, mkNumKeyGenerator(15_000));
    expectEqual(imSet, jsMap);
  });

  it("iterates more than once", () => {
    const { imSet, jsMap } = createSet(500, () => faker.string.sample());
    const expected = sortKeys(jsMap.values());

    // iterate object itself twice
    expect([...imSet]).to.deep.equal(expected);
    expect([...imSet]).to.deep.equal(expected);

    // iterate toLazySeq twice
    const vals = imSet.toAscLazySeq();
    expect([...vals]).to.deep.equal(expected);
    expect([...vals]).to.deep.equal(expected);

    const valsRev = imSet.toDescLazySeq();
    expect([...valsRev]).to.deep.equal([...expected].reverse());
    expect([...valsRev]).to.deep.equal([...expected].reverse());
  });

  it("creates via from", () => {
    const size = 1000;
    const entries = new Array<number>(size);
    for (let i = 0; i < size; i++) {
      const k = Math.floor(Math.random() * 5000);
      entries[i] = k;
    }
    const imSet = OrderedSet.from(entries);
    const jsMap = new Map<string, number>(entries.map((k) => [k.toString(), k]));

    checkSetBalanceAndSize(imSet);
    expectEqual(imSet, jsMap);
  });

  it("creates via build", () => {
    const size = 1000;
    const values = new Array<number>(size);
    for (let i = 0; i < size; i++) {
      values[i] = Math.floor(Math.random() * 5000);
    }

    const imSet = OrderedSet.build(values, (v) => v + 40_000);
    const jsMap = new Map<string, number>(
      values.map((v) => [(v + 40_000).toString(), v + 40_000])
    );

    checkSetBalanceAndSize(imSet);
    expectEqual(imSet, jsMap);
  });

  it("leaves map unchanged when setting the same value", () => {
    const { imSet } = createSet(5000, mkNumKeyGenerator(7000));

    for (const k of imSet.toAscLazySeq().take(4000)) {
      const newHashS = imSet.add(k);
      expect(newHashS).to.equal(imSet);
    }
  });

  it("deletes from the set", () => {
    const initial = createSet(5_000, mkNumKeyGenerator(10_000));

    let newImSet = initial.imSet;
    const newJsMap = new Map(initial.jsMap);
    for (const [kS, k] of initial.jsMap) {
      const r = Math.random();
      if (r < 0.4) {
        newImSet = newImSet.delete(k);
        newJsMap.delete(kS);
      } else if (r < 0.5) {
        // delete with key that doesn't exist
        const s = newImSet.delete(k + 20_000);
        expect(s).to.equal(newImSet);
      }
    }

    checkSetBalanceAndSize(newImSet);
    expectEqual(newImSet, newJsMap);
  });

  it("filters a set", () => {
    const initial = createSet(1000, mkNumKeyGenerator(2000));

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

    checkSetBalanceAndSize(newImSet);
    expectEqual(newImSet, jsAfterFilter);
  });

  it("returns the set unchanged if nothing is filtered", () => {
    const initial = createSet(1000, mkNumKeyGenerator(2000));

    const filterNone = initial.imSet.filter(() => true);

    expect(filterNone).to.equal(initial.imSet);
  });

  it("returns empty if everything filtered", () => {
    const initial = createSet(1000, mkNumKeyGenerator(2000));
    const empty = initial.imSet.filter(() => false);
    expectEqual(empty, new Map());
  });

  it("returns unchanged if everything is partitioned", () => {
    const { imSet } = createSet(5000, mkNumKeyGenerator(10_000));
    const [t, f] = imSet.partition(() => true);
    expect(t).to.equal(imSet);
    expect(f.size).to.equal(0);
  });

  it("returns unchanged if nothing is partitioned", () => {
    const { imSet } = createSet(5000, mkNumKeyGenerator(10_000));
    const [t, f] = imSet.partition(() => false);
    expect(t.size).to.equal(0);
    expect(f).to.equal(imSet);
  });

  it("partitions a set", () => {
    const { imSet, jsMap } = createSet(5000, mkNumKeyGenerator(10_000));

    const expectedTrue = new Map<string, number>();
    const expectedFalse = new Map<string, number>();
    const [t, f] = imSet.partition((k) => {
      if (Math.random() < 0.3) {
        expectedTrue.set(k.toString(), k);
        return true;
      } else {
        expectedFalse.set(k.toString(), k);
        return false;
      }
    });

    // saw all the keys
    expect(expectedTrue.size + expectedFalse.size).to.equal(jsMap.size);

    checkSetBalanceAndSize(t);
    checkSetBalanceAndSize(f);

    expectEqual(t, expectedTrue);
    expectEqual(f, expectedFalse);
  });

  it("splits a set on an existing key", () => {
    const { imSet, jsMap } = createSet(1000, mkNumKeyGenerator(5000));
    const kToSplit = imSet.toAscLazySeq().drop(300).head()!;

    const s = imSet.split(kToSplit);

    checkSetBalanceAndSize(s.below);
    checkSetBalanceAndSize(s.above);

    expect(s.present).to.be.true;

    // construct expected jsMaps
    const jsBelow = new Map<string, number>();
    const jsAbove = new Map<string, number>();
    for (const [kS, k] of jsMap) {
      if (k < kToSplit) {
        jsBelow.set(kS, k);
      } else if (k === kToSplit) {
        // is in
      } else {
        jsAbove.set(kS, k);
      }
    }

    expectEqual(s.above, jsAbove);
    expectEqual(s.below, jsBelow);
  });

  it("splits a map on a non-existing key", () => {
    const keygen = mkNumKeyGenerator(5000);
    // make all keys even
    const { imSet, jsMap } = createSet(1000, () => keygen() * 2);
    const kToSplit = imSet.toAscLazySeq().drop(300).head()!;

    // split on an odd
    const s = imSet.split(kToSplit + 1);

    checkSetBalanceAndSize(s.below);
    checkSetBalanceAndSize(s.above);

    expect(s.present).to.be.false;

    // construct expected jsMaps
    const jsBelow = new Map<string, number>();
    const jsAbove = new Map<string, number>();
    for (const [kS, k] of jsMap) {
      if (k <= kToSplit) {
        jsBelow.set(kS, k);
      } else {
        jsAbove.set(kS, k);
      }
    }

    expectEqual(s.above, jsAbove);
    expectEqual(s.below, jsBelow);
  });

  it("transforms a set", () => {
    const m = createSet(100, mkNumKeyGenerator(5000)).imSet;
    const n = faker.number.int();
    expect(
      m.transform((t) => {
        expect(t).to.equal(m);
        return n;
      })
    ).to.equal(n);
  });

  it("returns undefined for min/max of empty set", () => {
    const m = OrderedSet.empty<number>();
    expect(m.minView()).to.be.undefined;
    expect(m.maxView()).to.be.undefined;
    expect(m.lookupMin()).to.be.undefined;
    expect(m.lookupMax()).to.be.undefined;
  });

  it("doesn't delete min/max of empty set", () => {
    const m = OrderedSet.empty<number>();
    expect(m.deleteMin()).to.equal(m);
    expect(m.deleteMax()).to.equal(m);
  });

  it("returns and pops the minimum element", () => {
    let m = OrderedSet.from(
      (function* () {
        for (let i = 99; i >= 0; i--) {
          yield i;
        }
      })()
    );

    checkSetBalanceAndSize(m);
    deepFreeze(m);

    const jsMap = new Map<string, number>();
    for (let i = 0; i < 100; i++) {
      jsMap.set(i.toString(), i);
    }

    expectEqual(m, jsMap);

    for (let i = 0; i < 10; i++) {
      const v = m.minView();
      expect(v!.min).to.equal(i);
      expect(m.lookupMin()).to.deep.equal(i);
      jsMap.delete(i.toString());

      checkSetBalanceAndSize(v!.rest);
      deepFreeze(v!.rest);
      expectEqual(v!.rest, jsMap);

      const afterDelete = m.deleteMin();
      checkSetBalanceAndSize(afterDelete);
      expectEqual(afterDelete, jsMap);

      m = v!.rest;
    }
  });

  it("returns and pops the maximum element", () => {
    let m = OrderedSet.from(
      (function* () {
        for (let i = 0; i < 100; i++) {
          yield i;
        }
      })()
    );

    checkSetBalanceAndSize(m);
    deepFreeze(m);

    const jsMap = new Map<string, number>();
    for (let i = 0; i < 100; i++) {
      jsMap.set(i.toString(), i);
    }

    expectEqual(m, jsMap);

    for (let i = 99; i > 89; i--) {
      const v = m.maxView();
      expect(v!.max).to.equal(i);
      expect(m.lookupMax()).to.deep.equal(i);
      jsMap.delete(i.toString());

      checkSetBalanceAndSize(v!.rest);
      deepFreeze(v!.rest);
      expectEqual(v!.rest, jsMap);

      const afterDelete = m.deleteMax();
      checkSetBalanceAndSize(afterDelete);
      expectEqual(afterDelete, jsMap);

      m = v!.rest;
    }
  });

  it("returns an empty set from an empty union", () => {
    const m = OrderedSet.union<number>();
    expectEqual(m, new Map());
  });

  it("unions two sets", () => {
    function* unionValues(): Generator<{ map1K: number } | { map2K: number }> {
      const keygen = mkNumKeyGenerator(10_000);
      // want a bunch of keys in both sets
      for (let i = 0; i < 2000; i++) {
        const k = keygen() * 3;
        yield { map1K: k };
        yield { map2K: k };
      }

      // want a bunch of keys in distinct in each sets
      for (let i = 0; i < 2000; i++) {
        yield { map1K: keygen() * 3 + 1 };
        yield { map2K: keygen() * 3 + 2 };
      }
    }

    // create the maps and the expected union
    let imSet1 = OrderedSet.empty<number>();
    let imSet2 = OrderedSet.empty<number>();
    const jsUnion = new Map<string, number>();
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
    checkSetBalanceAndSize(imSet1);
    deepFreeze(imSet2);
    checkSetBalanceAndSize(imSet2);

    const imUnion = OrderedSet.union(imSet1, imSet2);
    checkSetBalanceAndSize(imUnion);
    expectEqual(imUnion, jsUnion);

    const imMethodUnion = imSet1.union(imSet2);
    checkSetBalanceAndSize(imMethodUnion);
    expectEqual(imMethodUnion, jsUnion);

    // union with itself returns unchanged
    const unionWithIteself = imSet1.union(imSet1);
    expect(unionWithIteself).is.equal(imSet1);

    const unionWithIteselfStatic = OrderedSet.union(imSet1, imSet1);
    expect(unionWithIteselfStatic).is.equal(imSet1);
  });

  it("returns an empty set from an empty intersection", () => {
    const s = OrderedSet.intersection<number>();
    expectEqual(s, new Map());
  });

  it("returns the set directly from an intersection", () => {
    const { imSet } = createSet(50, mkNumKeyGenerator(300));

    const m = OrderedSet.intersection(imSet);
    expect(m).to.equal(imSet);
  });

  it("returns the set when intersecting with itself", () => {
    const { imSet } = createSet(1000, mkNumKeyGenerator(2000));

    const fromStatic = OrderedSet.intersection(imSet, imSet);
    expect(fromStatic).to.equal(imSet);

    const fromMethod = imSet.intersection(imSet);
    expect(fromMethod).to.equal(imSet);
  });

  it("intersection with empty set is empty", () => {
    const { imSet } = createSet(50, mkNumKeyGenerator(500));
    const empty = imSet.intersection(OrderedSet.empty());
    expectEqual(empty, new Map());
  });

  it("intersects two sets", () => {
    function* intersectionValues(): Generator<
      { map1K: number } | { map2K: number } | { both: number }
    > {
      // want a bunch of keys in both sets
      const keygen = mkNumKeyGenerator(4000);
      for (let i = 0; i < 2000; i++) {
        const k = keygen() * 3;
        yield { both: k };
      }

      // want a bunch of keys in distinct in each sets
      for (let i = 0; i < 2000; i++) {
        yield { map1K: keygen() * 3 + 1 };
        yield { map2K: keygen() * 3 + 2 };
      }
    }

    // create the sets and the expected intersection
    let imSet1 = OrderedSet.empty<number>();
    let imSet2 = OrderedSet.empty<number>();
    const jsIntersection = new Map<string, number>();
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
    checkSetBalanceAndSize(imSet1);
    deepFreeze(imSet2);
    checkSetBalanceAndSize(imSet2);

    const imInter = OrderedSet.intersection(imSet1, imSet2);
    checkSetBalanceAndSize(imInter);
    expectEqual(imInter, jsIntersection);
  });

  it("differences two sets", () => {
    function* diffValues(): Generator<
      { map1K: number } | { map2K: number } | { both: number }
    > {
      // want a bunch of keys in both sets
      const keygen = mkNumKeyGenerator(4000);
      for (let i = 0; i < 2000; i++) {
        const k = keygen() * 3;
        yield { both: k };
      }

      // want a bunch of keys in distinct in each set
      for (let i = 0; i < 2000; i++) {
        yield { map1K: keygen() * 3 + 1 };
        yield { map2K: keygen() * 3 + 2 };
      }
    }

    // create the sets and the expected difference
    let imSet1 = OrderedSet.empty<number>();
    let imSet2 = OrderedSet.empty<number>();
    const jsDiff = new Map<string, number>();
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
    checkSetBalanceAndSize(imSet1);
    deepFreeze(imSet2);
    checkSetBalanceAndSize(imSet2);

    const imDiff = imSet1.difference(imSet2);
    checkSetBalanceAndSize(imDiff);
    expectEqual(imDiff, jsDiff);
  });

  it("difference with empty set is unchanged", () => {
    const { imSet } = createSet(1000, mkNumKeyGenerator(2000));

    const m = imSet.difference(OrderedSet.empty());
    expect(m).to.equal(imSet);
  });

  it("creates a key set from a HashMap", () => {
    const keygen = mkNumKeyGenerator(2000);
    const m = createMap(1000, () => keygen() * 2);

    const imSet = m.ordMap.keySet();
    const jsSet = new Map<string, number>();
    for (const [kS, [k]] of m.jsMap) {
      jsSet.set(kS, k);
    }

    deepFreeze(imSet);
    checkSetBalanceAndSize(imSet);
    expectEqual(imSet, jsSet);

    const newK = keygen() * 2 + 1;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const existingK = m.ordMap.keysToAscLazySeq().head()!;
    const imSet2 = imSet.add(newK).add(existingK);
    jsSet.set(newK.toString(), newK);

    checkSetBalanceAndSize(imSet2);
    expectEqual(imSet2, jsSet);
  });
});
