import { expect } from "chai";
import { CollidingKey as Key } from "./collision-key.js";
import { mkHashConfig } from "../src/hashing.js";
import { InternalNode, HamtNode, insert, lookup } from "../src/hamt.js";
import { LazySeq } from "../src/lazyseq.js";

function setNewVal(val: number): (old: number | undefined) => number {
  return (old) => {
    expect(old).to.be.undefined;
    return val;
  };
}

describe("HAMT insert and lookup", () => {
  it("inserts to an empty tree", () => {
    const k = new Key(10, 20);
    const cfg = mkHashConfig<Key>();
    const [node, inserted] = insert(cfg, k, setNewVal(100), null);

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
    const [node1, inserted1] = insert(cfg, k1, setNewVal(100), null);
    const [node2, inserted2] = insert(cfg, k2, setNewVal(200), node1);

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
    // check node reused, so no deep equal, just shallow ===
    expect(node1).to.equal((node2 as InternalNode<Key, number>).children[0]);

    expect(lookup(cfg, k1, node2)).to.equal(100);
    expect(lookup(cfg, k2, node2)).to.equal(200);
  });

  it("creates nodes deep in the tree", () => {
    const k1 = new Key(0b10101_10010_11011, 20);
    const k2 = new Key(0b10000_10010_11011, 25);
    const k3 = new Key(0b00000_10110_11011, 20);
    const cfg = mkHashConfig<Key>();
    const [node1, inserted1] = insert(cfg, k1, setNewVal(100), null);
    const [node2, inserted2] = insert(cfg, k2, setNewVal(200), node1);
    const [node3, inserted3] = insert(cfg, k3, setNewVal(300), node2);

    expect(inserted1).to.be.true;
    expect(inserted2).to.be.true;
    expect(inserted3).to.be.true;

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
                { hash: k2.hash, key: k2, val: 200 }, // k2 has smaller hash, so it is first
                { hash: k1.hash, key: k1, val: 100 },
              ],
            },
          ],
        },
      ],
    });
    expect(node3).to.deep.equal({
      bitmap: 1 << 0b11011,
      children: [
        {
          bitmap: (1 << 0b10010) | (1 << 0b10110),
          children: [
            {
              bitmap: (1 << 0b10101) | (1 << 0b10000),
              children: [
                { hash: k2.hash, key: k2, val: 200 },
                { hash: k1.hash, key: k1, val: 100 },
              ],
            },
            { hash: k3.hash, key: k3, val: 300 },
          ],
        },
      ],
    });

    // check persisting values

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    expect(node1).to.equal((node2 as any).children[0].children[0].children[1]);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    expect(node1).to.equal((node3 as any).children[0].children[0].children[1]);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    expect((node2 as any).children[0].children[0]).to.equal((node3 as any).children[0].children[0]);

    expect(lookup(cfg, k1, node2)).to.equal(100);
    expect(lookup(cfg, k2, node2)).to.equal(200);

    expect(lookup(cfg, new Key(3, 10), node2)).to.be.undefined;
  });

  it("creates a full node", () => {
    const cfg = mkHashConfig<Key>();
    const tree = LazySeq.ofRange(0, 32).foldLeft(null as HamtNode<Key, number> | null, (node, i) => {
      const [n, inserted] = insert(cfg, new Key(i, i), setNewVal(i * 100), node);
      expect(inserted).to.be.true;
      return n;
    });

    expect(tree).to.deep.equal({
      children: LazySeq.ofRange(0, 32)
        .map((i) => ({
          hash: i,
          key: new Key(i, i),
          val: i * 100,
        }))
        .toRArray(),
    });

    const [after, inserted] = insert(cfg, new Key(32, 32), setNewVal(32 * 100), tree);

    expect(inserted).to.be.true;
    expect(after).to.deep.equal({
      children: [
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

      if (i > 1) {
        // check that the nodes were re-used so shallow equal
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        expect((tree as any).children[i]).to.equal((after as any).children[i]);
      }
    }
  });

  it("creates a collision node", () => {
    const cfg = mkHashConfig<Key>();
    const k1 = new Key(10, 25);
    const k2 = new Key(10, 30);
    const k3 = new Key(10, 40);

    const [node1, inserted1] = insert(cfg, k1, setNewVal(100), null);
    const [node2, inserted2] = insert(cfg, k2, setNewVal(200), node1);
    const [node3, inserted3] = insert(cfg, k3, setNewVal(300), node2);

    expect(inserted1).to.be.true;
    expect(inserted2).to.be.true;
    expect(inserted3).to.be.true;

    expect(node2).to.deep.equal({
      hash: 10,
      collision: [
        { key: k2, val: 200 },
        { key: k1, val: 100 },
      ],
    });

    expect(node3).to.deep.equal({
      hash: 10,
      collision: [
        { key: k3, val: 300 },
        { key: k2, val: 200 },
        { key: k1, val: 100 },
      ],
    });

    expect(lookup(cfg, k1, node3)).to.equal(100);
    expect(lookup(cfg, k2, node3)).to.equal(200);
    expect(lookup(cfg, new Key(10, 50), node3)).to.be.undefined;
    expect(lookup(cfg, new Key(30, 25), node3)).to.be.undefined;
  });

  it("merges existing value", () => {
    const cfg = mkHashConfig<Key>();
    const k1 = new Key(10, 25);

    const [node1, inserted1] = insert(cfg, k1, setNewVal(100), null);
    const [node2, inserted2] = insert(
      cfg,
      k1,
      (old) => {
        expect(old).to.equal(100);
        return 200;
      },
      node1
    );

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

  it("doesn't create a new tree when inserting the same value", () => {
    const k1 = new Key(5, 20);
    const k2 = new Key(8, 25);
    const cfg = mkHashConfig<Key>();
    const [node1, inserted1] = insert(cfg, k1, setNewVal(100), null);
    const [node2, inserted2] = insert(cfg, k2, setNewVal(200), node1);
    const [node3, inserted3] = insert(
      cfg,
      k2,
      (old) => {
        expect(old).to.equal(200);
        return 200;
      },
      node2
    );

    expect(inserted1).to.be.true;
    expect(inserted2).to.be.true;
    expect(inserted3).to.be.false;

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

    // no deep equal, should have returned unchanged
    expect(node3).to.equal(node2);
  });
});
