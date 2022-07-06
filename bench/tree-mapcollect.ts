import type { Event } from "benchmark";
import Benchmark from "benchmark";
import { mkComparisonConfig } from "../src/data-structures/comparison.js";
import { collectValues, mapValues, alter, TreeNode } from "../src/data-structures/tree.js";

const size = 100_000;
const suite = new Benchmark.Suite("Tree Map vs Collect");

const compare = mkComparisonConfig();

let evens: TreeNode<number, string> | null = null;
for (let i = 0; i < size; i += 2) {
  evens = alter(compare, i, () => i.toString(), evens);
}

suite.add("map", () => {
  mapValues((k) => k + "!!!", evens);
});

suite.add("collect", () => {
  collectValues((k) => k + "!!!", false, evens);
});

suite
  .on("cycle", function (event: Event) {
    console.log(String(event.target));
  })
  .run({ async: true });
