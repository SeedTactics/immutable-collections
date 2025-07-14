import { bench, describe } from "vitest";
import { mkComparisonConfig } from "../src/data-structures/comparison.js";
import {
  build,
  from,
  alter,
  mutateInsert,
  TreeNode,
  MutableTreeNode,
} from "../src/data-structures/tree.js";

const size = 50_000;

const elems = new Array<[number, string]>();
for (let i = 0; i < size; i++) {
  elems[i] = [i, i.toString()];
}

const nums = new Array<number>();
for (let i = 0; i < size; i++) {
  nums[i] = i;
}

describe("Tree Insert", () => {
  bench("modify", () => {
    let n: TreeNode<number, string> | null = null;
    const compare = mkComparisonConfig();
    for (let i = 0; i < size; i++) {
      n = alter(compare, i, () => i.toString(), n);
    }
  });

  bench("from", () => {
    const compare = mkComparisonConfig();
    from(compare, elems);
  });

  function snd<A, B>(_: A, b: B): B {
    return b;
  }

  bench("mutate insert", () => {
    const compare = mkComparisonConfig();
    let n: MutableTreeNode<number, string> | null = null;
    for (const [k, v] of elems) {
      n = mutateInsert(compare, k, v, snd, n);
    }
  });

  bench("build", () => {
    const compare = mkComparisonConfig();
    build(
      compare,
      nums,
      (k) => k,
      (_, k) => k.toString(),
    );
  });

  bench("JS Map", () => {
    const m = new Map<number, string>();
    for (let i = 0; i < size; i++) {
      m.set(i, i.toString());
    }
  });
});
