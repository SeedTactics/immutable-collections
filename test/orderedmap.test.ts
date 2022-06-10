import { expect } from "chai";
import { faker } from "@faker-js/faker";
import { mkComparisonConfig, OrderedMapKey } from "../src/comparison.js";
import { deepFreeze } from "./deepfreeze.js";
import { OrderedMap } from "../src/orderedmap.js";
import { checkMapBalanceAndSize } from "./check-balance.js";

interface OrderedMapAndJsMap<K extends OrderedMapKey, V> {
  readonly ordMap: OrderedMap<K, V>;
  readonly jsMap: Map<string, [K, V]>;
}

function sortEntries<K extends OrderedMapKey, V>(e: Iterable<readonly [K, V]>): Array<readonly [K, V]> {
  const cfg = mkComparisonConfig<K>();
  const entries = Array.from(e);
  return entries.sort(([k1], [k2]) => cfg.compare(k1, k2));
}

/*
function randomNullableStr(): string | null {
  if (Math.random() < 0.1) return null;
  return faker.datatype.string();
}

function combineNullableStr(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a + b;
}
*/

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
});
