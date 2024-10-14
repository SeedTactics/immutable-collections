/* Copyright John Lenz, BSD license, see LICENSE file for details */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable @typescript-eslint/no-base-to-string */

import { expect } from "chai";
import { faker } from "@faker-js/faker";
import { mkComparisonConfig, OrderedMapKey } from "../src/data-structures/comparison.js";
import { deepFreeze } from "./deepfreeze.js";
import { OrderedMap } from "../src/api/orderedmap.js";
import { checkMapBalanceAndSize } from "./check-balance.js";
import { randomCollisionKey } from "./collision-key.js";
import { OrderedSet } from "../src/api/orderedset.js";

interface OrderedMapAndJsMap<K extends OrderedMapKey, V> {
  readonly ordMap: OrderedMap<K, V>;
  readonly jsMap: Map<string, [K, V]>;
}

function sortEntries<K extends OrderedMapKey, V>(
  e: Iterable<readonly [K, V]>,
): Array<readonly [K, V]> {
  const cfg = mkComparisonConfig<K>();
  const entries = Array.from(e);
  return entries.sort(([k1], [k2]) => cfg.compare(k1, k2));
}

function randomNullableStr(): string | null {
  if (Math.random() < 0.1) return null;
  return faker.string.sample();
}

function combineNullableStr(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a + b;
}

export function mkNumKeyGenerator(size: number, offset?: number): () => number {
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
        return (
          Math.floor((Math.random() * size) / 2) + (offset === undefined ? 0 : offset)
        );
      } else {
        // large number
        return (
          Math.floor((Math.random() * size) / 2) +
          size / 2 +
          (offset === undefined ? 0 : offset)
        );
      }
    };
  } else {
    // more large numbers than small
    return () => {
      if (Math.random() < 0.2) {
        // small number
        return (
          Math.floor((Math.random() * size) / 2) + (offset === undefined ? 0 : offset)
        );
      } else {
        // large number
        return (
          Math.floor((Math.random() * size) / 2) +
          size / 2 +
          (offset === undefined ? 0 : offset)
        );
      }
    };
  }
}

export function createMap<K extends OrderedMapKey>(
  size: number,
  key: () => K,
): OrderedMapAndJsMap<K, string> {
  let ordMap = OrderedMap.empty<K, string>();
  const jsMap = new Map<string, [K, string]>();

  for (let i = 0; i < size; i++) {
    const k = key();
    const v = faker.string.sample();
    if (i % 2 === 0) {
      ordMap = ordMap.set(k, v);
      jsMap.set(k.toString(), [k, v]);
    } else {
      ordMap = ordMap.alter(k, (oldV) => (oldV === undefined ? v : oldV + v));
      const oldjV = jsMap.get(k.toString());
      jsMap.set(k.toString(), [k, oldjV === undefined ? v : oldjV[1] + v]);
    }
  }

  deepFreeze(ordMap);
  checkMapBalanceAndSize(ordMap);

  return { ordMap, jsMap };
}

function expectEqual<K extends OrderedMapKey, V>(
  ordMap: OrderedMap<K, V>,
  jsMap: Map<string, [K, V]>,
): void {
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
  expect([...ordMap.values()]).to.deep.equal(entries.map(([, v]) => v));
  expect([...ordMap.valuesToAscLazySeq()]).to.deep.equal(entries.map(([, v]) => v));
  expect([...ordMap.valuesToDescLazySeq()]).to.deep.equal(revEntries.map(([, v]) => v));

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

type AdjustType =
  | { type: "delete" }
  | { type: "leave unchanged" }
  | { type: "mergeWith"; val: string | null }
  | { type: "expect missing"; val: string | null };

describe("Ordered Map", () => {
  it("creates an empty map", () => {
    const m = OrderedMap.empty<number, string>();
    expect(m.size).to.equal(0);

    expect(m.get(100)).to.be.undefined;
    expect(m.has(100)).to.be.false;
    expectEqual(m, new Map());
  });

  it("has immutable keyed property", () => {
    const m = OrderedMap.empty<number, string>().set(2, "2");
    expect(m).to.have.a.property("@@__IMMUTABLE_KEYED__@@");
  });

  it("creates a string key map", () => {
    const { ordMap, jsMap } = createMap(10000, () => faker.string.sample());
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
      ]),
    );
  });

  it("creates a date-keyed map", () => {
    const { ordMap, jsMap } = createMap(1000, () => faker.date.anytime());
    expectEqual(ordMap, jsMap);
  });

  it("creates a object keyed map", () => {
    const { ordMap, jsMap } = createMap(1000, () => randomCollisionKey());
    expectEqual(ordMap, jsMap);
  });

  it("balances the tree when adding in ascending order", () => {
    let ordMap = OrderedMap.empty<number, string>();
    const jsMap = new Map<string, [number, string]>();
    for (let i = 0; i < 1000; i++) {
      const v = faker.string.sample();
      ordMap = ordMap.set(i, v);
      jsMap.set(i.toString(), [i, v]);
    }

    deepFreeze(ordMap);
    checkMapBalanceAndSize(ordMap);

    expectEqual(ordMap, jsMap);
  });

  it("balances the tree when adding in descending order", () => {
    let ordMap = OrderedMap.empty<number, string>();
    const jsMap = new Map<string, [number, string]>();
    for (let i = 1000; i >= 0; i--) {
      const v = faker.string.sample();
      ordMap = ordMap.set(i, v);
      jsMap.set(i.toString(), [i, v]);
    }

    deepFreeze(ordMap);
    checkMapBalanceAndSize(ordMap);

    expectEqual(ordMap, jsMap);
  });

  it("iterates the tree more than once", () => {
    const { ordMap, jsMap } = createMap(500, mkNumKeyGenerator(1000));
    const entries = sortEntries(jsMap.values());
    const revEntries = [...entries].reverse();

    // iterate itself more than once
    expect([...ordMap]).to.deep.equal(entries);
    expect([...ordMap]).to.deep.equal(entries);

    const keyAsc = ordMap.keysToAscLazySeq();
    expect([...keyAsc]).to.deep.equal(entries.map(([k]) => k));
    expect([...keyAsc]).to.deep.equal(entries.map(([k]) => k));

    const keyDesc = ordMap.keysToDescLazySeq();
    expect([...keyDesc]).to.deep.equal(revEntries.map(([k]) => k));
    expect([...keyDesc]).to.deep.equal(revEntries.map(([k]) => k));

    const valAsc = ordMap.valuesToAscLazySeq();
    expect([...valAsc]).to.deep.equal(entries.map(([, v]) => v));
    expect([...valAsc]).to.deep.equal(entries.map(([, v]) => v));

    const valDesc = ordMap.valuesToDescLazySeq();
    expect([...valDesc]).to.deep.equal(revEntries.map(([, v]) => v));
    expect([...valDesc]).to.deep.equal(revEntries.map(([, v]) => v));

    const enAsc = ordMap.toAscLazySeq();
    expect([...enAsc]).to.deep.equal(entries);
    expect([...enAsc]).to.deep.equal(entries);

    const enDesc = ordMap.toDescLazySeq();
    expect([...enDesc]).to.deep.equal(revEntries);
    expect([...enDesc]).to.deep.equal(revEntries);
  });

  it("leaves map unchanged when setting the same value", () => {
    const { ordMap } = createMap(10_000, mkNumKeyGenerator(20_000));

    for (const [k, v] of ordMap.toAscLazySeq().take(4000)) {
      const newM = ordMap.set(k, v);
      expect(newM).to.equal(ordMap);
    }
  });

  it("leaves map unchanged when altering the same value", () => {
    const { ordMap } = createMap(5000, () => faker.string.sample());

    for (const [k, v] of ordMap.toAscLazySeq().take(1000)) {
      const newM = ordMap.alter(k, (old) => {
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
      newM = newM.alter(k, (oldV) => {
        expect(oldV).to.equal(v);
        return v + "!!!!";
      });
      newJsMap.set(k.toString(), [k, v + "!!!!"]);
    }

    checkMapBalanceAndSize(newM);
    expectEqual(newM, newJsMap);
  });

  it("alters values", () => {
    const keygen = mkNumKeyGenerator(10_000);
    const { ordMap, jsMap } = createMap(5000, () => keygen() * 2);

    let newM = ordMap;
    const newJsMap = new Map(jsMap);
    for (const [k, v] of ordMap.toAscLazySeq().take(4000)) {
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
        const newVal = faker.string.sample();
        newM = newM.alter(k + 1, (oldV) => {
          expect(oldV).to.be.undefined;
          return newVal;
        });
        newJsMap.set((k + 1).toString(), [k + 1, newVal]);
      }
    }

    checkMapBalanceAndSize(newM);
    expectEqual(newM, newJsMap);
  });

  it("creates via from", () => {
    const size = 1000;
    const entries = new Array<[number, string]>(size + 50);
    for (let i = 0; i < size; i++) {
      const k = Math.floor(Math.random() * 5000);
      const v = faker.string.sample();
      entries[i] = [k, v];
      // duplicate the first 50 entries at the end
      if (i < 50) {
        entries[i + size] = [k, v];
      }
    }
    const imMap = OrderedMap.from(entries);
    const jsMap = new Map<string, [number, string]>(
      entries.map(([k, v]) => [k.toString(), [k, v]]),
    );

    checkMapBalanceAndSize(imMap);
    expectEqual(imMap, jsMap);
  });

  it("creates via from in ascending order", () => {
    const size = 1000;
    const entries = new Array<[number, string]>(size);
    for (let i = 0; i < size; i++) {
      const v = faker.string.sample();
      entries[i] = [i, v];
    }
    const imMap = OrderedMap.from(entries);
    const jsMap = new Map<string, [number, string]>(
      entries.map(([k, v]) => [k.toString(), [k, v]]),
    );

    checkMapBalanceAndSize(imMap);
    expectEqual(imMap, jsMap);
  });

  it("creates via from in descending order", () => {
    const size = 1000;
    const entries = new Array<[number, string]>(size);
    for (let i = size; i >= 0; i--) {
      const v = faker.string.sample();
      entries[i] = [i, v];
    }
    const imMap = OrderedMap.from(entries);
    const jsMap = new Map<string, [number, string]>(
      entries.map(([k, v]) => [k.toString(), [k, v]]),
    );

    checkMapBalanceAndSize(imMap);
    expectEqual(imMap, jsMap);
  });

  it("creates via from and merge", () => {
    const size = 1000;
    const entries = new Array<[number, string]>(size);
    for (let i = 0; i < size; i++) {
      const k = Math.floor(Math.random() * 5000);
      const v = faker.string.sample();
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
    const jsMap = new Map<string, [number, number]>(
      values.map((v) => [(v + 40_000).toString(), [v + 40_000, v]]),
    );

    checkMapBalanceAndSize(imMap);
    expectEqual(imMap, jsMap);
  });

  it("creates via build with key and value", () => {
    const size = 1000;
    const ts = new Array<number>(size);
    for (let i = 0; i < size; i++) {
      ts[i] = faker.number.int({ min: 0, max: 5000 });
    }

    const imMap = OrderedMap.build<number, string, string>(
      ts,
      (t) => "key " + (t + 40_000).toString(),
      (old, t) => (old ?? "") + t.toString(),
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

  it("returns unchanged if everything is partitioned", () => {
    const { ordMap } = createMap(5000, mkNumKeyGenerator(10_000));
    const [t, f] = ordMap.partition(() => true);
    expect(t).to.equal(ordMap);
    expect(f.size).to.equal(0);
  });

  it("returns unchanged if nothing is partitioned", () => {
    const { ordMap } = createMap(5000, mkNumKeyGenerator(10_000));
    const [t, f] = ordMap.partition(() => false);
    expect(t.size).to.equal(0);
    expect(f).to.equal(ordMap);
  });

  it("partitions a map", () => {
    const { ordMap, jsMap } = createMap(5000, mkNumKeyGenerator(10_000));

    const expectedTrue = new Map<string, [number, string]>();
    const expectedFalse = new Map<string, [number, string]>();
    const [t, f] = ordMap.partition((k, v) => {
      expect(v).to.equal(jsMap.get(k.toString())![1]);
      if (Math.random() < 0.3) {
        expectedTrue.set(k.toString(), [k, v]);
        return true;
      } else {
        expectedFalse.set(k.toString(), [k, v]);
        return false;
      }
    });

    // saw all the keys
    expect(expectedTrue.size + expectedFalse.size).to.equal(jsMap.size);

    checkMapBalanceAndSize(t);
    checkMapBalanceAndSize(f);

    expectEqual(t, expectedTrue);
    expectEqual(f, expectedFalse);
  });

  it("transforms a map", () => {
    const m = createMap(500, () => randomCollisionKey()).ordMap;
    const n = faker.number.int();
    expect(
      m.transform((t) => {
        expect(t).to.equal(m);
        return n;
      }),
    ).to.equal(n);
  });

  it("returns undefined for min/max of empty tree", () => {
    const m = OrderedMap.empty<number, string>();
    expect(m.minView()).to.be.undefined;
    expect(m.maxView()).to.be.undefined;
    expect(m.lookupMin()).to.be.undefined;
    expect(m.lookupMax()).to.be.undefined;
  });

  it("doesn't delete min/max of empty tree", () => {
    const m = OrderedMap.empty<number, string>();
    expect(m.deleteMin()).to.equal(m);
    expect(m.deleteMax()).to.equal(m);
  });

  it("returns and pops the minimum element", () => {
    let m = OrderedMap.from(
      (function* () {
        for (let i = 99; i >= 0; i--) {
          yield [i, i.toString()];
        }
      })(),
    );

    checkMapBalanceAndSize(m);
    deepFreeze(m);

    const jsMap = new Map<string, [number, string]>();
    for (let i = 0; i < 100; i++) {
      jsMap.set(i.toString(), [i, i.toString()]);
    }

    expectEqual(m, jsMap);

    for (let i = 0; i < 10; i++) {
      const v = m.minView();
      expect(v!.minKey).to.equal(i);
      expect(v!.minVal).to.equal(i.toString());
      expect(m.lookupMin()).to.deep.equal([i, i.toString()]);
      jsMap.delete(i.toString());

      checkMapBalanceAndSize(v!.rest);
      deepFreeze(v!.rest);
      expectEqual(v!.rest, jsMap);

      const afterDelete = m.deleteMin();
      checkMapBalanceAndSize(afterDelete);
      expectEqual(afterDelete, jsMap);

      m = v!.rest;
    }
  });

  it("returns and pops the maximum element", () => {
    let m = OrderedMap.from(
      (function* () {
        for (let i = 0; i < 100; i++) {
          yield [i, i.toString()];
        }
      })(),
    );

    checkMapBalanceAndSize(m);
    deepFreeze(m);

    const jsMap = new Map<string, [number, string]>();
    for (let i = 0; i < 100; i++) {
      jsMap.set(i.toString(), [i, i.toString()]);
    }

    expectEqual(m, jsMap);

    for (let i = 99; i > 89; i--) {
      const v = m.maxView();
      expect(v!.maxKey).to.equal(i);
      expect(v!.maxVal).to.equal(i.toString());
      expect(m.lookupMax()).to.deep.equal([i, i.toString()]);
      jsMap.delete(i.toString());

      checkMapBalanceAndSize(v!.rest);
      deepFreeze(v!.rest);
      expectEqual(v!.rest, jsMap);

      const afterDelete = m.deleteMax();
      checkMapBalanceAndSize(afterDelete);
      expectEqual(afterDelete, jsMap);

      m = v!.rest;
    }
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

    let empty = OrderedMap.intersection(
      (a, b) => a + b,
      ordMap,
      OrderedMap.empty<number, string>(),
    );
    expectEqual(empty, new Map());

    empty = OrderedMap.intersection(
      (a, b) => a + b,
      OrderedMap.empty<number, string>(),
      ordMap,
    );
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
        jsIntersection.set(x.both.toString(), [
          x.both,
          combineNullableStr(x.val1, x.val2),
        ]);
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

  it("splits a map on an existing key", () => {
    const { ordMap, jsMap } = createMap(1000, mkNumKeyGenerator(5000));
    const [kToSplit, vToSplit] = ordMap.toAscLazySeq().drop(300).head()!;

    const s = ordMap.split(kToSplit);

    checkMapBalanceAndSize(s.below);
    checkMapBalanceAndSize(s.above);

    expect(s.val).to.equal(vToSplit);

    // construct expected jsMaps
    const jsBelow = new Map<string, [number, string]>();
    const jsAbove = new Map<string, [number, string]>();
    for (const [kS, [k, v]] of jsMap) {
      if (k < kToSplit) {
        jsBelow.set(kS, [k, v]);
      } else if (k === kToSplit) {
        // is in
      } else {
        jsAbove.set(kS, [k, v]);
      }
    }

    expectEqual(s.above, jsAbove);
    expectEqual(s.below, jsBelow);
  });

  it("splits a map on a non-existing key", () => {
    const keygen = mkNumKeyGenerator(5000);
    // make all keys even
    const { ordMap, jsMap } = createMap(1000, () => keygen() * 2);
    const kToSplit = ordMap.keysToAscLazySeq().drop(300).head()!;

    // split on an odd
    const s = ordMap.split(kToSplit + 1);

    checkMapBalanceAndSize(s.below);
    checkMapBalanceAndSize(s.above);

    expect(s.val).to.be.undefined;

    // construct expected jsMaps
    const jsBelow = new Map<string, [number, string]>();
    const jsAbove = new Map<string, [number, string]>();
    for (const [kS, [k, v]] of jsMap) {
      if (k <= kToSplit) {
        jsBelow.set(kS, [k, v]);
      } else {
        jsAbove.set(kS, [k, v]);
      }
    }

    expectEqual(s.above, jsAbove);
    expectEqual(s.below, jsBelow);
  });

  it("computes difference", () => {
    function* diffValues(): Generator<
      { map1K: number; map1V: string | null } | { map2K: number; map2V: { foo: number } }
    > {
      // want a bunch of keys in both maps
      const keygen = mkNumKeyGenerator(10_000);
      for (let i = 0; i < 2000; i++) {
        // keys are multiple of three
        const k = keygen() * 3;
        yield { map1K: k, map1V: randomNullableStr() };
        yield { map2K: k, map2V: { foo: Math.random() } };
      }

      // want a bunch of keys in distinct in each map
      for (let i = 0; i < 2000; i++) {
        // to keep distinct, use keys congruent to 1 mod 3 and 2 mod 3
        const k = keygen();
        yield { map1K: k * 3 + 1, map1V: randomNullableStr() };
        yield { map2K: k * 3 + 2, map2V: { foo: Math.random() } };
      }
    }

    // create the maps
    let imMap1 = OrderedMap.empty<number, string | null>();
    let imMap2 = OrderedMap.empty<number, { foo: number }>();
    const jsMap1 = new Map<string, [number, string | null]>();
    const jsKeys2 = new Set<number>();
    for (const x of diffValues()) {
      if ("map1K" in x) {
        imMap1 = imMap1.set(x.map1K, x.map1V);
        const kS = x.map1K.toString();
        jsMap1.set(kS, [x.map1K, x.map1V]);
      } else {
        imMap2 = imMap2.set(x.map2K, x.map2V);
        jsKeys2.add(x.map2K);
      }
    }

    deepFreeze(imMap1);
    deepFreeze(imMap2);
    checkMapBalanceAndSize(imMap1);
    checkMapBalanceAndSize(imMap2);

    // update jsMap1 to be the difference
    for (const k2 of jsKeys2) {
      jsMap1.delete(k2.toString());
    }

    const imDiff = imMap1.difference(imMap2);
    expectEqual(imDiff, jsMap1);
    checkMapBalanceAndSize(imDiff);

    // withoutKeys is the same
    const withoutKeys = imMap1.withoutKeys(imMap2.keySet());
    expectEqual(withoutKeys, jsMap1);
    checkMapBalanceAndSize(withoutKeys);
  });

  it("difference with itself is the empty map", () => {
    const { ordMap } = createMap(500, mkNumKeyGenerator(5000));

    const empty = ordMap.difference(ordMap);

    checkMapBalanceAndSize(empty);
    expectEqual(empty, new Map());
  });

  it("difference with the empty map is unchanged", () => {
    const { ordMap } = createMap(500, mkNumKeyGenerator(5000));

    const diff = ordMap.difference(OrderedMap.empty());
    expect(diff).to.equal(ordMap);
  });

  it("computes symmetric difference", () => {
    function* diffValues(): Generator<
      | { both: number; val: string | null }
      | { map1K: number; map1V: string | null }
      | { map2K: number; map2V: string | null }
    > {
      // want a bunch of keys in both maps
      const keygen = mkNumKeyGenerator(10_000);
      for (let i = 0; i < 2000; i++) {
        // keys are multiple of three
        const k = keygen() * 3;
        yield { both: k, val: randomNullableStr() };
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
    const jsSymDiff = new Map<string, [number, string | null]>();
    for (const x of diffValues()) {
      if ("both" in x) {
        imMap1 = imMap1.set(x.both, x.val);
        imMap2 = imMap2.set(x.both, x.val);
      } else if ("map1K" in x) {
        imMap1 = imMap1.set(x.map1K, x.map1V);
        jsSymDiff.set(x.map1K.toString(), [x.map1K, x.map1V]);
      } else {
        imMap2 = imMap2.set(x.map2K, x.map2V);
        jsSymDiff.set(x.map2K.toString(), [x.map2K, x.map2V]);
      }
    }

    deepFreeze(imMap1);
    deepFreeze(imMap2);
    checkMapBalanceAndSize(imMap1);
    checkMapBalanceAndSize(imMap2);

    const diff = imMap1.symmetricDifference(imMap2);
    expectEqual(diff, jsSymDiff);

    const diff2 = imMap2.symmetricDifference(imMap1);
    expectEqual(diff2, jsSymDiff);
  });

  it("doesn't change when symmetric diff with the empty set", () => {
    const map = createMap(500, mkNumKeyGenerator(1000)).ordMap;
    expect(map.symmetricDifference(OrderedMap.empty())).to.equal(map);
  });

  it("withoutKeys with the empty set is unchanged", () => {
    const { ordMap } = createMap(500, mkNumKeyGenerator(1000));

    const diff = ordMap.withoutKeys(OrderedSet.empty());
    expect(diff).to.equal(ordMap);
  });

  it("adjusts a map", () => {
    function* adjValues(): Generator<
      { map1K: number; map1V: string | null } | { map2K: number; map2V: AdjustType }
    > {
      const keygen = mkNumKeyGenerator(10_000);

      // want a bunch of keys to be deleted
      for (let i = 0; i < 500; i++) {
        const k = keygen() * 5;
        yield { map1K: k, map1V: randomNullableStr() };
        yield { map2K: k, map2V: { type: "delete" } };
      }

      // want a bunch of keys to be merged
      for (let i = 0; i < 500; i++) {
        const k = keygen() * 5 + 1;
        yield { map1K: k, map1V: randomNullableStr() };
        yield { map2K: k, map2V: { type: "mergeWith", val: randomNullableStr() } };
      }

      // want a bunch of keys to be left unchanged
      for (let i = 0; i < 500; i++) {
        const k = keygen() * 5 + 2;
        yield { map1K: k, map1V: randomNullableStr() };
        yield { map2K: k, map2V: { type: "leave unchanged" } };
      }

      // want a bunch of keys in map1 to not appear in keysToAdjust
      for (let i = 0; i < 500; i++) {
        const k = keygen() * 5 + 3;
        yield { map1K: k, map1V: randomNullableStr() };
      }

      // want a bunch of keys only in map2
      for (let i = 0; i < 500; i++) {
        const k = keygen() * 5 + 4;
        yield { map2K: k, map2V: { type: "expect missing", val: randomNullableStr() } };
      }
    }

    // create the maps
    let imMap1 = OrderedMap.empty<number, string | null>();
    let imMap2 = OrderedMap.empty<number, AdjustType>();
    const jsMap1 = new Map<string, [number, string | null]>();
    const jsMap2 = new Map<number, AdjustType>();
    for (const x of adjValues()) {
      if ("map1K" in x) {
        imMap1 = imMap1.set(x.map1K, x.map1V);
        const kS = x.map1K.toString();
        jsMap1.set(kS, [x.map1K, x.map1V]);
      } else {
        imMap2 = imMap2.set(x.map2K, x.map2V);
        jsMap2.set(x.map2K, x.map2V);
      }
    }

    deepFreeze(imMap1);
    deepFreeze(imMap2);
    checkMapBalanceAndSize(imMap1);
    checkMapBalanceAndSize(imMap2);

    // update jsMap1 to be the difference
    for (const [k2, adj2] of jsMap2) {
      switch (adj2.type) {
        case "delete":
          jsMap1.delete(k2.toString());
          break;
        case "mergeWith": {
          const kS = k2.toString();
          const [oldK, oldV] = jsMap1.get(kS)!;
          jsMap1.set(kS, [oldK, combineNullableStr(oldV, adj2.val)]);
          break;
        }
        case "expect missing": {
          const kS = k2.toString();
          expect(jsMap1.has(kS)).to.be.false;
          jsMap1.set(kS, [k2, adj2.val]);
        }
        // do nothing on type === "leave unchanged"
      }
    }

    const imDiff = imMap1.adjust(imMap2, (oldVal, adj, k) => {
      expect(adj).to.equal(jsMap2.get(k));
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
    checkMapBalanceAndSize(imDiff);
  });

  it("returns unchanged if nothing adjusted", () => {
    const { ordMap } = createMap(1000, mkNumKeyGenerator(5000));

    const keys = faker.helpers.arrayElements([...ordMap.keys()], 20);

    const toAdjust = OrderedMap.build(
      keys,
      (k) => k,
      (_, k) => k.toString(),
    );

    const m = ordMap.adjust(toAdjust, (existingVal, helperVal, k) => {
      expect(existingVal).to.equal(ordMap.get(k));
      expect(helperVal).to.equal(toAdjust.get(k));
      return existingVal;
    });

    expect(m).to.equal(ordMap);
  });
});
