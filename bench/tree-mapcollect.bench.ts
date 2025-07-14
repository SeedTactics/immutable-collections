import { describe, bench } from "vitest";
import { mkComparisonConfig } from "../src/data-structures/comparison.js";
import {
  collectValues,
  mapValues,
  alter,
  TreeNode,
} from "../src/data-structures/tree.js";

const size = 100_000;

const compare = mkComparisonConfig();

let evens: TreeNode<number, string> | null = null;
for (let i = 0; i < size; i += 2) {
  evens = alter(compare, i, () => i.toString(), evens);
}

describe("Tree Map vs Collect", () => {
  bench("map", () => {
    mapValues((k) => k + "!!!", evens);
  });

  bench("collect", () => {
    collectValues((k) => k + "!!!", false, evens);
  });
});
