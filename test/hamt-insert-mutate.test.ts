import { expect } from "chai";
import { CollidingKey as Key } from "./collision-key.js";
import { mkHashConfig } from "../src/hashing.js";
import { InternalNode, mutateInsert } from "../src/hamt.js";
import { LazySeq } from "../src/lazyseq.js";

function setNewVal(str: string, val: number): (old: number | undefined, t: string) => number {
  return (old, t) => {
    expect(t).to.equal(str);
    expect(old).to.be.undefined;
    return val;
  };
}

describe("hamt mutate insert", () => {
  it("inserts a single value", () => {
    const k = new Key(10, 20);
    const cfg = mkHashConfig<Key>();
    const node = mutateInsert(cfg, k, "Hello", setNewVal("Hello", 100), null);

    expect(node).to.deep.equal({
      hash: 10,
      key: k,
      val: 100,
    });
  });

  it("inserts some values on the same bitmaped node", () => {
    const k1 = new Key(5, 20);
    const k2 = new Key(8, 25);
    const k3 = new Key(6, 25);
    const cfg = mkHashConfig<Key>();
    const node1 = mutateInsert(cfg, k1, "AAA", setNewVal("AAA", 100), null);
    const node2 = mutateInsert(cfg, k2, "BBB", setNewVal("BBB", 200), node1);
    const node3 = mutateInsert(cfg, k3, "CCC", setNewVal("CCC", 300), node2);

    expect(node1).to.deep.equal({
      hash: 5,
      key: k1,
      val: 100,
    });

    // node should not be changed, check shallow equality
    expect(node2).to.equal(node3);

    // the node2 children array should have been modified so should have all three
    expect(node2).to.deep.equal({
      bitmap: (1 << 5) | (1 << 6) | (1 << 8),
      children: [
        { hash: 5, key: k1, val: 100 },
        { hash: 6, key: k3, val: 300 },
        { hash: 8, key: k2, val: 200 },
      ],
    });
  });

  it("mutates nodes deep in the tree", () => {
    const k1 = new Key(0b10101_10010_11011, 20);
    const k2 = new Key(0b10000_10010_11011, 25);
    const k3 = new Key(0b00000_10110_11011, 20);
    const cfg = mkHashConfig<Key>();
    const node1 = mutateInsert(cfg, k1, "AA", setNewVal("AA", 100), null);
    const node2 = mutateInsert(cfg, k2, "BB", setNewVal("BB", 200), node1);
    const node3 = mutateInsert(cfg, k3, "CC", setNewVal("CC", 300), node2);

    expect(node1).to.deep.equal({
      hash: k1.hash,
      key: k1,
      val: 100,
    });

    // check we are mutating nodes
    expect(node2).to.equal(node3);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    expect((node2 as any).children).to.equal((node3 as any).children);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    expect((node2 as any).children[0]).to.equal((node3 as any).children[0]);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    expect((node2 as any).children[0].children).to.equal((node3 as any).children[0].children);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    expect((node2 as any).children[0].children[0]).to.equal((node3 as any).children[0].children[0]);

    expect(node2).to.deep.equal({
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
  });

  it("creates a full node", () => {
    const cfg = mkHashConfig<Key>();
    const node0 = mutateInsert(cfg, new Key(0, 0), "AA", setNewVal("AA", 0), null);
    const node1 = mutateInsert(cfg, new Key(1, 1), "BB", setNewVal("BB", 100), node0);

    const tree = LazySeq.ofRange(2, 32).foldLeft(node1, (node, i) =>
      mutateInsert(cfg, new Key(i, i), "aa" + i.toString(), setNewVal("aa" + i.toString(), i * 100), node)
    );

    // check array was re-used
    expect((node1 as InternalNode<Key, number>).children).to.equal((tree as InternalNode<Key, number>).children);

    expect(tree).to.deep.equal({
      children: LazySeq.ofRange(0, 32)
        .map((i) => ({
          hash: i,
          key: new Key(i, i),
          val: i * 100,
        }))
        .toRArray(),
    });

    const after = mutateInsert(cfg, new Key(32, 32), "after", setNewVal("after", 32 * 100), tree);

    // check node and array was re-used
    expect(tree).to.equal(after);
    expect((after as InternalNode<Key, number>).children).to.equal((tree as InternalNode<Key, number>).children);

    // note, checking tree deep equals the result of inserting 32 since it should have been mutated
    expect(tree).to.deep.equal({
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
  });

  it("creates a collision node", () => {
    const cfg = mkHashConfig<Key>();
    const k1 = new Key(10, 25);
    const k2 = new Key(10, 30);
    const k3 = new Key(10, 40);

    const node1 = mutateInsert(cfg, k1, "AB", setNewVal("AB", 100), null);
    const node2 = mutateInsert(cfg, k2, "CD", setNewVal("CD", 200), node1);
    const node3 = mutateInsert(cfg, k3, "EF", setNewVal("EF", 300), node2);

    expect(node2).to.equal(node3);

    // note, checking node2 deep equals the result of inserting k3 since it should have been mutated
    expect(node2).to.deep.equal({
      hash: 10,
      collision: [
        { key: k3, val: 300 },
        { key: k2, val: 200 },
        { key: k1, val: 100 },
      ],
    });
  });

  it("merges in an existing value", () => {
    const cfg = mkHashConfig<Key>();
    const k1 = new Key(10, 25);

    const node1 = mutateInsert(cfg, k1, "XX", setNewVal("XX", 100), null);
    const node2 = mutateInsert(
      cfg,
      k1,
      "YY",
      (old, t) => {
        expect(t).to.equal("YY");
        expect(old).to.equal(100);
        return 200;
      },
      node1
    );

    expect(node1).to.equal(node2);

    expect(node1).to.deep.equal({
      hash: 10,
      key: k1,
      val: 200,
    });
  });
});
