/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { expect } from "chai";
//import { faker } from "@faker-js/faker";
import { HamtNode, insert, lookup, remove } from "../src/hamt.js";
import { mkHashConfig } from "../src/hashing.js";
import { LazySeq } from "../src/lazyseq.js";
import { CollidingKey } from "./collision-key.js";

function setNewVal(val: number): (old: number | undefined) => number {
  return (old) => {
    expect(old).to.be.undefined;
    return val;
  };
}

describe("HAMT Remove", () => {
  it("removes from empty", () => {
    const cfg = mkHashConfig<number>();
    expect(remove(cfg, 50, null)).to.be.null;
  });

  it("removes from a single leaf", () => {
    const cfg = mkHashConfig<number>();
    const [leaf] = insert(cfg, 50, () => "Hello", null);

    expect(remove(cfg, 50, leaf)).to.be.null;

    // leaf is unchanged
    expect(leaf).to.deep.equal({ hash: 50, key: 50, val: "Hello" });

    // remove a key not in the tree
    expect(remove(cfg, 40, leaf)).to.equal(leaf); // same object, not a copy
  });

  it("removes from a full node", () => {
    const cfg = mkHashConfig<CollidingKey>();
    const tree = LazySeq.ofRange(0, 32).foldLeft(null as HamtNode<CollidingKey, number> | null, (node, i) => {
      const [n, inserted] = insert(cfg, new CollidingKey(i, i), setNewVal(i * 100), node);
      expect(inserted).to.be.true;
      return n;
    });

    const newTree = remove(cfg, new CollidingKey(3, 3), tree);
    expect(newTree).to.deep.equal({
      bitmap: ~(1 << 3),
      children: LazySeq.ofRange(0, 3)
        .concat(LazySeq.ofRange(4, 32))
        .map((i) => ({
          hash: i,
          key: new CollidingKey(i, i),
          val: i * 100,
        }))
        .toRArray(),
    });

    expect(lookup(cfg, 2, 0, new CollidingKey(2, 2), newTree!)).to.equal(2 * 100);
    expect(lookup(cfg, 3, 0, new CollidingKey(3, 3), newTree!)).to.be.undefined;
    expect(lookup(cfg, 3, 0, new CollidingKey(3, 3), tree!)).to.equal(3 * 100);
    expect(lookup(cfg, 4, 0, new CollidingKey(4, 4), newTree!)).to.equal(4 * 100);

    // remove some stuff not in the tree
    expect(remove(cfg, new CollidingKey(50, 50), newTree)).to.equal(newTree);
    expect(remove(cfg, new CollidingKey(18, 400), newTree)).to.equal(newTree);
  });

  it("removes from a bitmap node", () => {
    const cfg = mkHashConfig<CollidingKey>();
    const tree = LazySeq.ofRange(0, 20).foldLeft(null as HamtNode<CollidingKey, number> | null, (node, i) => {
      const [n, inserted] = insert(cfg, new CollidingKey(i, i), setNewVal(i * 100), node);
      expect(inserted).to.be.true;
      return n;
    });

    const newTree = remove(cfg, new CollidingKey(3, 3), tree);
    expect(newTree).to.deep.equal({
      bitmap: ((1 << 20) - 1) & ~(1 << 3),
      children: LazySeq.ofRange(0, 3)
        .concat(LazySeq.ofRange(4, 20))
        .map((i) => ({
          hash: i,
          key: new CollidingKey(i, i),
          val: i * 100,
        }))
        .toRArray(),
    });

    expect(lookup(cfg, 2, 0, new CollidingKey(2, 2), newTree!)).to.equal(2 * 100);
    expect(lookup(cfg, 3, 0, new CollidingKey(3, 3), newTree!)).to.be.undefined;
    expect(lookup(cfg, 3, 0, new CollidingKey(3, 3), tree!)).to.equal(3 * 100);
    expect(lookup(cfg, 4, 0, new CollidingKey(4, 4), newTree!)).to.equal(4 * 100);

    // remove some stuff not in the tree
    expect(remove(cfg, new CollidingKey(50, 50), newTree)).to.equal(newTree);
    expect(remove(cfg, new CollidingKey(18, 400), newTree)).to.equal(newTree);

    // remove all the way down to a single leaf with key 6
    const leaf = LazySeq.ofRange(0, 6)
      .concat(LazySeq.ofRange(7, 20))
      .foldLeft(tree, (t, i) => remove(cfg, new CollidingKey(i, i), t));

    expect(leaf).to.deep.equal({ hash: 6, key: new CollidingKey(6, 6), val: 6 * 100 });

    // no changes to tree or newTree
    expect(lookup(cfg, 4, 0, new CollidingKey(4, 4), tree!)).to.equal(4 * 100);
    expect(lookup(cfg, 4, 0, new CollidingKey(4, 4), newTree!)).to.equal(4 * 100);
  });

  it("removes a chain of single-child nodes", () => {
    const k1 = new CollidingKey(0b10101_10010_11011, 20);
    const k2 = new CollidingKey(0b10000_10010_11011, 25);
    const cfg = mkHashConfig<CollidingKey>();
    const [node1] = insert(cfg, k1, setNewVal(100), null);
    const [node2] = insert(cfg, k2, setNewVal(200), node1);

    expect(remove(cfg, k1, node2)).to.deep.equal({
      hash: k2.hash,
      key: k2,
      val: 200,
    });

    // didn't adjust node2
    expect(lookup(cfg, cfg.hash(k1), 0, k1, node2)).to.equal(100);

    //try removing k2
    expect(remove(cfg, k2, node2)).to.deep.equal({
      hash: k1.hash,
      key: k1,
      val: 100,
    });
  });

  it("aborts early when removing a chain of single-child nodes", () => {
    const k1 = new CollidingKey(0b10101_10010_11011, 20);
    const k2 = new CollidingKey(0b10000_10010_11011, 25);
    const k3 = new CollidingKey(0b00000_10110_11011, 20);
    const cfg = mkHashConfig<CollidingKey>();
    const [node1] = insert(cfg, k1, setNewVal(100), null);
    const [node2] = insert(cfg, k2, setNewVal(200), node1);
    const [node3] = insert(cfg, k3, setNewVal(300), node2);

    expect(remove(cfg, k1, node3)).to.deep.equal({
      bitmap: 1 << 0b11011,
      children: [
        {
          bitmap: (1 << 0b10010) | (1 << 0b10110),
          children: [
            { hash: k2.hash, key: k2, val: 200 },
            { hash: k3.hash, key: k3, val: 300 },
          ],
        },
      ],
    });

    // didn't touch node3
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
  });

  it("removes from collision node", () => {
    const k1 = new CollidingKey(20, 1);
    const k2 = new CollidingKey(20, 2);
    const k3 = new CollidingKey(20, 3);

    const cfg = mkHashConfig<CollidingKey>();
    const [node1] = insert(cfg, k1, setNewVal(100), null);
    const [node2] = insert(cfg, k2, setNewVal(200), node1);
    const [node3] = insert(cfg, k3, setNewVal(300), node2);

    const afterRemove1 = remove(cfg, k1, node3);
    expect(afterRemove1).to.deep.equal({
      hash: 20,
      collision: [
        { key: k3, val: 300 },
        { key: k2, val: 200 },
      ],
    });

    expect(lookup(cfg, cfg.hash(k1), 0, k1, node3)).to.equal(100);

    expect(remove(cfg, k2, afterRemove1)).to.deep.equal({
      hash: 20,
      key: k3,
      val: 300,
    });

    expect(lookup(cfg, cfg.hash(k2), 0, k2, node2)).to.equal(200);
  });
});
