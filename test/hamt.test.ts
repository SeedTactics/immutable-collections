import { expect } from "chai";
//import { faker } from "@faker-js/faker";
import { CollidingKey as Key } from "./collision-key.js";
import { mkHashConfig } from "../src/hashing.js";
import { HamtNode, insert, lookup } from "../src/hamt.js";
import { LazySeq } from "../src/lazyseq.js";

describe("HAMT insert and lookup", () => {
  it("inserts to an empty tree", () => {
    const k = new Key(10, 20);
    const cfg = mkHashConfig<Key>();
    const [node, inserted] = insert(cfg, k, () => 100, null);

    expect(inserted).to.be.true;
    expect(node).to.deep.equal({
      hash: 10,
      key: k,
      val: 100,
    });

    expect(lookup(cfg, k, node)).to.equal(100);
    expect(lookup(cfg, new Key(10, 20), node)).to.equal(100);
    expect(lookup(cfg, new Key(50, 20), node)).to.be.undefined;
    expect(lookup(cfg, new Key(10, 30), node)).to.be.undefined;
  });

  it("creates two nodes directly at the root", () => {
    const k1 = new Key(5, 20);
    const k2 = new Key(8, 25);
    const cfg = mkHashConfig<Key>();
    const [node1, inserted1] = insert(cfg, k1, () => 100, null);
    const [node2, inserted2] = insert(cfg, k2, () => 200, node1);

    expect(inserted1).to.be.true;
    expect(inserted2).to.be.true;
    expect(node1).to.deep.equal({
      hash: 5,
      key: k1,
      val: 100,
    });
    expect(node2).to.deep.equal({
      bitmap: (1 << 5) | (1 << 8),
      children: [
        { hash: 5, key: k1, val: 100 },
        { hash: 8, key: k2, val: 200 },
      ],
    });

    expect(lookup(cfg, k1, node2)).to.equal(100);
    expect(lookup(cfg, k2, node2)).to.equal(200);
  });

  it("creates two nodes deep in the tree", () => {
    const k1 = new Key(0b10000_10010_11011, 25);
    const k2 = new Key(0b10101_10010_11011, 20);
    const cfg = mkHashConfig<Key>();
    const [node1, inserted1] = insert(cfg, k1, () => 100, null);
    const [node2, inserted2] = insert(cfg, k2, () => 200, node1);

    expect(inserted1).to.be.true;
    expect(inserted2).to.be.true;
    expect(node1).to.deep.equal({
      hash: k1.hash,
      key: k1,
      val: 100,
    });
    expect(node2).to.deep.equal({
      bitmap: 1 << 0b11011,
      children: [
        {
          bitmap: 1 << 0b10010,
          children: [
            {
              bitmap: (1 << 0b10101) | (1 << 0b10000),
              children: [
                { hash: k1.hash, key: k1, val: 100 },
                { hash: k2.hash, key: k2, val: 200 },
              ],
            },
          ],
        },
      ],
    });

    expect(lookup(cfg, k1, node2)).to.equal(100);
    expect(lookup(cfg, k2, node2)).to.equal(200);
  });

  it("creates a full node", () => {
    const cfg = mkHashConfig<Key>();
    const tree = LazySeq.ofRange(0, 32).foldLeft(null as HamtNode<Key, number> | null, (node, i) => {
      const [n, inserted] = insert(cfg, new Key(i, i), () => i * 100, node);
      expect(inserted).to.be.true;
      return n;
    });

    expect(tree).to.deep.equal({
      full: LazySeq.ofRange(0, 32)
        .map((i) => ({
          hash: i,
          key: new Key(i, i),
          val: i * 100,
        }))
        .toRArray(),
    });

    const [after, inserted] = insert(cfg, new Key(32, 32), () => 32 * 100, tree);

    expect(inserted).to.be.true;
    expect(after).to.deep.equal({
      full: [
        // first child of the full node now as two leaves
        {
          bitmap: 0b11,
          children: [
            { hash: 0, key: new Key(0, 0), val: 0 },
            { hash: 32, key: new Key(32, 32), val: 32 * 100 },
          ],
        },
        ...LazySeq.ofRange(1, 32).map((i) => ({
          hash: i,
          key: new Key(i, i),
          val: i * 100,
        })),
      ],
    });

    for (let i = 0; i < 32; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(lookup(cfg, new Key(i, i), tree!)).to.equal(i * 100);
      expect(lookup(cfg, new Key(i, i), after)).to.equal(i * 100);
    }
  });

  it("creates a collision node", () => {
    const cfg = mkHashConfig<Key>();
    const k1 = new Key(10, 25);
    const k2 = new Key(10, 30);

    const [node1, inserted1] = insert(cfg, k1, () => 100, null);
    const [node2, inserted2] = insert(cfg, k2, () => 200, node1);

    expect(inserted1).to.be.true;
    expect(inserted2).to.be.true;

    expect(node2).to.deep.equal({
      hash: 10,
      collision: [
        { key: k2, val: 200 },
        { key: k1, val: 100 },
      ],
    });

    expect(lookup(cfg, k1, node2)).to.equal(100);
    expect(lookup(cfg, k2, node2)).to.equal(200);
  });

  it("merges existing value", () => {
    const cfg = mkHashConfig<Key>();
    const k1 = new Key(10, 25);

    const [node1, inserted1] = insert(cfg, k1, () => 100, null);
    const [node2, inserted2] = insert(cfg, k1, (old) => (old ?? 8000) + 100, node1);

    expect(inserted1).to.be.true;
    expect(inserted2).to.be.false;

    expect(node1).to.deep.equal({
      hash: 10,
      key: k1,
      val: 100,
    });
    expect(node2).to.deep.equal({
      hash: 10,
      key: k1,
      val: 200,
    });
  });
});
