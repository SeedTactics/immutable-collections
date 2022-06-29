import type { Event } from "benchmark";
import Benchmark from "benchmark";
import { mkComparisonConfig } from "../src/data-structures/comparison.js";
import { MutableTreeNode, TreeNode } from "../src/data-structures/rotations.js";
import {
  alter,
  alterFullRecursive,
  build,
  from,
  insert,
  insertArrayStack,
  insertFullRecursive,
  insertLLStack,
  insertSet,
  mutateInsert,
} from "../src/data-structures/tree.js";

const size = 50_000;
const suite = new Benchmark.Suite("Tree Insert");

const elems = new Array<[number, string]>();
for (let i = 0; i < size; i++) {
  elems[i] = [i, i.toString()];
}

const nums = new Array<number>();
for (let i = 0; i < size; i++) {
  nums[i] = i;
}

suite.add("insert", () => {
  let n: TreeNode<number, string> | undefined = undefined;
  const compare = mkComparisonConfig();
  for (let i = 0; i < size; i++) {
    n = insert(compare, i, () => i.toString(), n);
  }
});

suite.add("insert full recursive", () => {
  let n: TreeNode<number, string> | undefined = undefined;
  const compare = mkComparisonConfig();
  for (let i = 0; i < size; i++) {
    n = insertFullRecursive(compare, i, () => i.toString(), n);
  }
});

suite.add("insert Array Stack", () => {
  let n: TreeNode<number, string> | undefined = undefined;
  const compare = mkComparisonConfig();
  for (let i = 0; i < size; i++) {
    n = insertArrayStack(compare, i, () => i.toString(), n);
  }
});

suite.add("insert LL Stack", () => {
  let n: TreeNode<number, string> | undefined = undefined;
  const compare = mkComparisonConfig();
  for (let i = 0; i < size; i++) {
    n = insertLLStack(compare, i, () => i.toString(), n);
  }
});

suite.add("insert set", () => {
  let n: TreeNode<number, string> | undefined = undefined;
  const compare = mkComparisonConfig();
  for (let i = 0; i < size; i++) {
    n = insertSet(compare, i, i.toString(), n);
  }
});

suite.add("alter recursive", () => {
  let n: TreeNode<number, string> | undefined = undefined;
  const compare = mkComparisonConfig();
  for (let i = 0; i < size; i++) {
    n = alter(compare, i, () => i.toString(), n);
  }
});

suite.add("alter full recursive", () => {
  let n: TreeNode<number, string> | undefined = undefined;
  const compare = mkComparisonConfig();
  for (let i = 0; i < size; i++) {
    n = alterFullRecursive(compare, i, () => i.toString(), n);
  }
});

suite.add("from", () => {
  const compare = mkComparisonConfig();
  from(compare, elems);
});

function snd<A, B>(_: A, b: B): B {
  return b;
}

suite.add("mutate insert", () => {
  const compare = mkComparisonConfig();
  let n: MutableTreeNode<number, string> | undefined = undefined;
  for (const [k, v] of elems) {
    n = mutateInsert(compare, k, v, snd, n);
  }
});

suite.add("mutate insert full recursive", () => {
  const compare = mkComparisonConfig();
  let n: MutableTreeNode<number, string> | undefined = undefined;
  for (const [k, v] of elems) {
    n = mutateInsert(compare, k, v, snd, n);
  }
});

suite.add("build", () => {
  const compare = mkComparisonConfig();
  build(
    compare,
    nums,
    (k) => k,
    (_, k) => k.toString()
  );
});

suite.add("JS Map", () => {
  const m = new Map<number, string>();
  for (let i = 0; i < size; i++) {
    m.set(i, i.toString());
  }
});

suite
  .on("cycle", function (event: Event) {
    console.log(String(event.target));
  })
  .run({ async: true });
