/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { expect } from "chai";
import { CollidingKey as Key, createKeyWithSameHash } from "./collision-key.js";
import { mkHashConfig } from "../src/data-structures/hashing.js";
import { InternalNode, alter, Node } from "../src/data-structures/hamt.js";

function setNewVal(
  val: number | undefined,
  expected?: number | undefined
): (old: number | undefined) => number | undefined {
  return (old) => {
    expect(old).to.equal(expected);
    return val;
  };
}

describe("HAMT alter", () => {
  it("alters into an empty tree", () => {
    const k = new Key(10, 20);
    const cfg = mkHashConfig<Key>();
    const [node, inserted] = alter(cfg, k, setNewVal(100), null);

    expect(inserted).to.equal(1);
    expect(node).to.deep.equal({
      hash: 10,
      key: k,
      val: 100,
    });

    const [empty, removed] = alter(cfg, k, setNewVal(undefined, 100), node);
    expect(removed).to.equal(-1);
    expect(empty).to.be.null;
  });

  it("creates three nodes directly at the root", () => {
    const k1 = new Key(5, 20);
    const k2 = new Key(8, 25);
    const k3 = new Key(10, 30);
    const cfg = mkHashConfig<Key>();
    const [node1, inserted1] = alter(cfg, k1, setNewVal(100), null);
    const [node2, inserted2] = alter(cfg, k2, setNewVal(200), node1);
    const [node3, inserted3] = alter(cfg, k3, setNewVal(300), node2);

    expect(inserted1).to.equal(1);
    expect(inserted2).to.equal(1);
    expect(inserted3).to.equal(1);
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

    expect(node3).to.deep.equal({
      bitmap: (1 << 5) | (1 << 8) | (1 << 10),
      children: [
        { hash: 5, key: k1, val: 100 },
        { hash: 8, key: k2, val: 200 },
        { hash: 10, key: k3, val: 300 },
      ],
    });
  });

  it("inserts to collision node", () => {
    const [k1, k2, k3] = createKeyWithSameHash(3);
    const cfg = mkHashConfig<Key>();
    const [node1, inserted1] = alter(cfg, k1, setNewVal(100), null);
    const [node2, inserted2] = alter(cfg, k2, setNewVal(200), node1);
    const [node3, inserted3] = alter(cfg, k3, setNewVal(300), node2);
    expect(inserted1).to.equal(1);
    expect(inserted2).to.equal(1);
    expect(inserted3).to.equal(1);

    expect(node3).to.deep.equal({
      hash: k1.h,
      collision: {
        key: k2,
        val: 200,
        size: 3,
        left: { key: k1, val: 100, size: 1, left: null, right: null },
        right: { key: k3, val: 300, size: 1, left: null, right: null },
      },
    });
  });

  it("merges existing value", () => {
    const cfg = mkHashConfig<Key>();
    const k1 = new Key(10, 25);

    const [node1, inserted1] = alter(cfg, k1, setNewVal(100), null);
    const [node2, inserted2] = alter(
      cfg,
      k1,
      (old) => {
        expect(old).to.equal(100);
        return 200;
      },
      node1
    );

    expect(inserted1).to.be.equal(1);
    expect(inserted2).to.be.equal(0);

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
    const [node1, inserted1] = alter(cfg, k1, setNewVal(100), null);
    const [node2, inserted2] = alter(cfg, k2, setNewVal(200), node1);
    const [node3, inserted3] = alter(
      cfg,
      k2,
      (old) => {
        expect(old).to.equal(200);
        return 200;
      },
      node2
    );

    expect(inserted1).to.equal(1);
    expect(inserted2).to.equal(1);
    expect(inserted3).to.equal(0);

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

  it("does not go into an infinite loop", () => {
    // this is impossible unless nodes get corrupted/modified outside of immutable-collections (or there is a bug in immutable collections)
    // check that lookup and insert on invalid trees don't go into an infinite loop

    const cfg = mkHashConfig<number>();
    const badNode = { bitmap: 1 << 5, children: [null] } as unknown as Node<
      number,
      string
    >;

    expect(() => alter(cfg, 5, () => "hello", badNode)).to.throw(
      "Internal immutable-collections violation: hamt alter reached null"
    );
  });
});
