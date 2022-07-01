import type { Event } from "benchmark";
import Benchmark from "benchmark";
import { mkComparisonConfig } from "../src/data-structures/comparison.js";
import { TreeNode } from "../src/data-structures/rotations.js";
import { adjust, difference, alter, union } from "../src/data-structures/tree.js";

const size = 50_000;
const suite = new Benchmark.Suite("Tree Union");

const compare = mkComparisonConfig();

let evens: TreeNode<number, string> | undefined = undefined;
for (let i = 0; i < size; i += 2) {
  evens = alter(compare, i, () => i.toString(), evens);
}

let mult3: TreeNode<number, string> | undefined = undefined;
for (let i = 0; i < size; i += 3) {
  mult3 = alter(compare, i, () => i.toString(), mult3);
}

suite.add("union", () => {
  union(compare, (a, b) => a + b, evens, mult3);
});

suite.add("union via adjust", () => {
  adjust(compare, (a, b) => (a === undefined ? b : a + b), evens, mult3);
});

suite.add("difference", () => {
  difference(compare, evens, mult3);
});

function constUndefined() {
  return undefined;
}

suite.add("difference via adjust", () => {
  adjust(compare, constUndefined, evens, mult3);
});

suite
  .on("cycle", function (event: Event) {
    console.log(String(event.target));
  })
  .run({ async: true });
