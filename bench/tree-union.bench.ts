import { describe, bench } from "vitest";
import { mkComparisonConfig } from "../src/data-structures/comparison.js";
import {
  adjust,
  difference,
  alter,
  union,
  TreeNode,
} from "../src/data-structures/tree.js";

const size = 50_000;

const compare = mkComparisonConfig();

let evens: TreeNode<number, string> | null = null;
for (let i = 0; i < size; i += 2) {
  evens = alter(compare, i, () => i.toString(), evens);
}

let mult3: TreeNode<number, string> | null = null;
for (let i = 0; i < size; i += 3) {
  mult3 = alter(compare, i, () => i.toString(), mult3);
}

describe("Tree Union", () => {
  bench("union", () => {
    union(compare, (a, b) => a + b, evens, mult3);
  });

  bench("union via adjust", () => {
    adjust(compare, (a, b) => (a === undefined ? b : a + b), evens, mult3);
  });

  bench("difference", () => {
    difference(compare, evens, mult3);
  });

  function constUndefined() {
    return undefined;
  }

  bench("difference via adjust", () => {
    adjust(compare, constUndefined, evens, mult3);
  });
});
