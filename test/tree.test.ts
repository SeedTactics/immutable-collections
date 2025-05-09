/* Copyright John Lenz, BSD license, see LICENSE file for details */
/* eslint-disable @typescript-eslint/no-unused-expressions */

import { expect } from "chai";
import { alter, iterateAsc, iterateDesc, lookup } from "../src/data-structures/tree.js";
import { checkBalanceAndSize } from "./check-balance.js";

const compareNum = {
  compare: (a: number, b: number) => a - b,
};

describe("Tree", () => {
  it("inserts some values", () => {
    const n1 = alter(compareNum, 10, () => "aaa", null)!;
    const n2 = alter(compareNum, 20, () => "bbb", n1)!;
    const n3 = alter(compareNum, 5, () => "ccc", n2)!;

    expect(lookup(compareNum, 10, n1)).to.equal("aaa");
    expect(lookup(compareNum, 10, n2)).to.equal("aaa");
    expect(lookup(compareNum, 10, n3)).to.equal("aaa");

    expect(lookup(compareNum, 20, n1)).to.be.undefined;
    expect(lookup(compareNum, 20, n2)).to.equal("bbb");
    expect(lookup(compareNum, 20, n3)).to.equal("bbb");

    expect(lookup(compareNum, 5, n1)).to.be.undefined;
    expect(lookup(compareNum, 5, n2)).to.be.undefined;
    expect(lookup(compareNum, 5, n3)).to.equal("ccc");

    checkBalanceAndSize(compareNum, n1);
    checkBalanceAndSize(compareNum, n2);
    checkBalanceAndSize(compareNum, n3);
  });

  it("replaces a value", () => {
    const n1 = alter(
      compareNum,
      10,
      (old) => {
        expect(old).to.be.undefined;
        return "aaa";
      },
      null
    )!;
    const n2 = alter(compareNum, 20, () => "bbb", n1)!;

    // insert the same value
    const n3 = alter(
      compareNum,
      10,
      (old) => {
        expect(old).to.equal("aaa");
        return "aaa";
      },
      n2
    )!;
    expect(n2).to.equal(n3);

    // insert a new value
    const n4 = alter(
      compareNum,
      10,
      (old) => {
        expect(old).to.equal("aaa");
        return "aaa2";
      },
      n2
    )!;

    expect(lookup(compareNum, 10, n1)).to.equal("aaa");
    expect(lookup(compareNum, 10, n2)).to.equal("aaa");
    expect(lookup(compareNum, 10, n4)).to.equal("aaa2");

    checkBalanceAndSize(compareNum, n1);
    checkBalanceAndSize(compareNum, n2);
    checkBalanceAndSize(compareNum, n4);
  });

  it("removes a value", () => {
    const n1 = alter(compareNum, 10, () => "aaa", null);
    const n2 = alter(compareNum, 20, () => "bbb", n1);
    const n3 = alter(compareNum, 5, () => "ccc", n2);

    const n4 = alter(compareNum, 20, () => undefined, n3);

    expect(lookup(compareNum, 20, n3)).to.equal("bbb");
    expect(lookup(compareNum, 20, n4)).to.be.undefined;

    checkBalanceAndSize(compareNum, n4!);
  });

  it("iterates values", () => {
    const n1 = alter(compareNum, 10, () => "aaa", null);
    const n2 = alter(compareNum, 20, () => "bbb", n1);
    const n3 = alter(compareNum, 5, () => "ccc", n2);

    expect([...iterateAsc((k, v) => [k, v], n3)]).to.deep.equal([
      [5, "ccc"],
      [10, "aaa"],
      [20, "bbb"],
    ]);

    expect([...iterateDesc((k, v) => [k, v], n3)]).to.deep.equal([
      [20, "bbb"],
      [10, "aaa"],
      [5, "ccc"],
    ]);
  });
});
