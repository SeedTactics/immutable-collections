import { ComparisonConfig } from "./comparison";

export type MeasurableConfig<M> = ComparisonConfig<M> & {
  readonly zero: M;
  readonly add: (k1: M, k2: M) => M;
};

export type HasMeasure<M> = { readonly m: M };

export class Elem<T> implements HasMeasure<number> {
  readonly v: T;
  constructor(v: T) {
    this.v = v;
  }
  get m(): number {
    return 1;
  }
}

class Node<M, T extends HasMeasure<M>> implements HasMeasure<M> {
  readonly m: M;
  readonly left: T;
  readonly middle: T;
  readonly right?: T;
  constructor({ add }: MeasurableConfig<M>, left: T, middle: T, right?: T) {
    this.m = add(left.m, middle.m);
    if (right !== undefined) {
      this.m = add(this.m, right.m);
    }
    this.left = left;
    this.middle = middle;
    if (right !== undefined) {
      this.right = right;
    }
  }
  children(): ReadonlyArray<T> {
    return this.right === undefined
      ? [this.left, this.middle]
      : [this.left, this.middle, this.right];
  }
}

// Digits have length 1 to 4
type Digit<T> = ReadonlyArray<T>;

class DeepNode<M, T extends HasMeasure<M>> implements HasMeasure<M> {
  readonly m: M;
  readonly left: Digit<T>;
  readonly middle: FingerTree<M, Node<M, T>>;
  readonly right: Digit<T>;

  constructor(
    { add }: MeasurableConfig<M>,
    left: Digit<T>,
    middle: FingerTree<M, Node<M, T>>,
    right: Digit<T>,
  ) {
    this.m = left[0].m;
    for (let i = 1; i < left.length; i++) {
      this.m = add(this.m, left[i].m);
    }
    if (middle !== emptyTree) {
      this.m = add(this.m, middle.m);
    }
    for (let i = 0; i < right.length; i++) {
      this.m = add(this.m, right[i].m);
    }

    this.left = left;
    this.middle = middle;
    this.right = right;
  }
}

const emptyTree = Symbol("emptyTree");
export type EmptyTree = typeof emptyTree;

export type FingerTree<M, T extends HasMeasure<M>> = EmptyTree | T | DeepNode<M, T>;

export function isEmpty<M, T extends HasMeasure<M>>(
  tree: FingerTree<M, T>,
): tree is EmptyTree {
  return tree === emptyTree;
}

export function unshift<M, T extends HasMeasure<M>>(
  cfg: MeasurableConfig<M>,
  value: T,
  tree: FingerTree<M, T>,
): FingerTree<M, T> {
  if (tree === emptyTree) {
    return value;
  }
  if (tree instanceof DeepNode) {
    if (tree.left.length === 4) {
      // left digit is full, need to move them into the middle
      // Deep([d1, d2, d3 d4], mi, right) becomes Deep([v, d1], Node(d2 d3 d4) added to mi, right)
      return new DeepNode(
        cfg,
        [value, tree.left[0]],
        unshift(
          cfg,
          new Node(cfg, tree.left[1], tree.left[2], tree.left[3]),
          tree.middle,
        ),
        tree.right,
      );
    } else {
      // add to left digit
      return new DeepNode(cfg, [value, ...tree.left], tree.middle, tree.right);
    }
  } else {
    return new DeepNode(cfg, [value], emptyTree, [tree]);
  }
}

export function push<M, T extends HasMeasure<M>>(
  cfg: MeasurableConfig<M>,
  tree: FingerTree<M, T>,
  value: T,
): FingerTree<M, T> {
  if (tree === emptyTree) {
    return value;
  }
  if (tree instanceof DeepNode) {
    if (tree.right.length === 4) {
      // right digit is full, need to move them into the middle
      // Deep(left, mi, [d1, d2, d3 d4]) becomes Deep(left, mi with Node(d1 d2 d3), [d4, v])
      return new DeepNode(
        cfg,
        tree.left,
        push(
          cfg,
          tree.middle,
          new Node(cfg, tree.right[0], tree.right[1], tree.right[2]),
        ),
        [tree.right[3], value],
      );
    } else {
      // add to right digit
      return new DeepNode(cfg, tree.left, tree.middle, [...tree.right, value]);
    }
  } else {
    return new DeepNode(cfg, [tree], emptyTree, [value]);
  }
}

export function from<M, T extends HasMeasure<M>>(
  cfg: MeasurableConfig<M>,
  values: Iterable<T>,
): FingerTree<M, T> {
  // TODO: use mutation
  let result: FingerTree<M, T> = emptyTree;
  for (const v of values) {
    result = push(cfg, result, v);
  }
  return result;
}

function mkDeepWithLeftPossiblyEmpty<M, T extends HasMeasure<M>>(
  cfg: MeasurableConfig<M>,
  left: ReadonlyArray<T>,
  middle: FingerTree<M, Node<M, T>>,
  right: ReadonlyArray<T>,
): FingerTree<M, T> {
  if (left.length === 0) {
    if (middle === emptyTree) {
      // right is the new tree
      return from(cfg, right);
    } else if (middle instanceof DeepNode) {
      // children of the head become the new left digit,
      // and everything except the head becomes the new middle
      return new DeepNode(cfg, middle.left[0].children(), tail(cfg, middle), right);
    } else {
      // middle is a node, with 2 or 3 children, so can become the left digit
      return new DeepNode(cfg, middle.children(), emptyTree, right);
    }
  } else {
    return new DeepNode(cfg, left, middle, right);
  }
}

function mkDeepWithRightPossiblyEmpty<M, T extends HasMeasure<M>>(
  cfg: MeasurableConfig<M>,
  left: ReadonlyArray<T>,
  middle: FingerTree<M, Node<M, T>>,
  right: ReadonlyArray<T>,
): FingerTree<M, T> {
  if (right.length === 0) {
    if (middle === emptyTree) {
      // left is the new tree
      return from(cfg, left);
    } else if (middle instanceof DeepNode) {
      // children of the last become the new right digit,
      // and everything except the last becomes the new middle
      return new DeepNode(
        cfg,
        left,
        allButLast(cfg, middle),
        middle.right[middle.right.length - 1].children(),
      );
    } else {
      // middle is a node, with 2 or 3 children, so can become the right digit
      return new DeepNode(cfg, left, emptyTree, middle.children());
    }
  } else {
    return new DeepNode(cfg, left, middle, right);
  }
}

export function head<M, T extends HasMeasure<M>>(tree: FingerTree<M, T>): T | undefined {
  if (tree instanceof DeepNode) {
    return tree.left[0];
  } else if (tree === emptyTree) {
    return undefined;
  } else {
    return tree;
  }
}

export function last<M, T extends HasMeasure<M>>(tree: FingerTree<M, T>): T | undefined {
  if (tree instanceof DeepNode) {
    return tree.right[tree.right.length - 1];
  } else if (tree === emptyTree) {
    return undefined;
  } else {
    return tree;
  }
}

export function tail<M, T extends HasMeasure<M>>(
  cfg: MeasurableConfig<M>,
  tree: FingerTree<M, T>,
): FingerTree<M, T> {
  if (tree === emptyTree) {
    return emptyTree;
  } else if (tree instanceof DeepNode) {
    // remove the first element from the left digit
    if (tree.left.length > 1) {
      // left digit has more than one element, just remove the first
      return new DeepNode(cfg, tree.left.slice(1), tree.middle, tree.right);
    } else if (tree.middle === emptyTree) {
      // single left digit, no middle.  Right becomes the new tree
      if (tree.right.length === 1) {
        // right has only one element, so the result is a single element tree
        return tree.right[0];
      } else if (tree.right.length === 4) {
        // keep balanced, so put 2 on each side
        return new DeepNode(cfg, [tree.right[0], tree.right[1]], emptyTree, [
          tree.right[2],
          tree.right[3],
        ]);
      } else {
        // put one on the left, rest on the right
        return new DeepNode(cfg, [tree.right[0]], emptyTree, tree.right.slice(1));
      }
    } else {
      // the middle is not empty, need to pull an element up from there
      const headMiddle = tree.middle instanceof DeepNode ? tree.left[0] : tree.middle;
      const restMiddle = tail(cfg, tree.middle);
      return new DeepNode(
        cfg,
        headMiddle instanceof Node ? headMiddle.children() : [headMiddle],
        restMiddle,
        tree.right,
      );
    }
  } else {
    // tree is a single element
    return emptyTree;
  }
}

export function allButLast<M, T extends HasMeasure<M>>(
  cfg: MeasurableConfig<M>,
  tree: FingerTree<M, T>,
): FingerTree<M, T> {
  if (tree === emptyTree) {
    return emptyTree;
  } else if (tree instanceof DeepNode) {
    // remove the last element from the right digit
    if (tree.right.length > 1) {
      // right digit has more than one element, just remove the last
      return new DeepNode(
        cfg,
        tree.left,
        tree.middle,
        tree.right.slice(0, tree.right.length - 1),
      );
    } else if (tree.middle === emptyTree) {
      // single right digit, no middle.  Left becomes the new tree
      if (tree.left.length === 1) {
        // left has only one element, so the result is a single element tree
        return tree.left[0];
      } else if (tree.left.length === 4) {
        // keep balanced, so put 2 on each side
        return new DeepNode(cfg, [tree.left[0], tree.left[1]], emptyTree, [
          tree.left[2],
          tree.left[3],
        ]);
      } else {
        // put one on the right, rest on the left
        return new DeepNode(cfg, tree.left.slice(0, tree.left.length - 1), emptyTree, [
          tree.left[tree.left.length - 1],
        ]);
      }
    } else {
      // single right digit, the middle is not empty, need to pull an element up from there
      const lastMiddle =
        tree.middle instanceof DeepNode ? tree.right[tree.right.length - 1] : tree.middle;
      const restMiddle = allButLast(cfg, tree.middle);
      return new DeepNode(
        cfg,
        tree.left,
        restMiddle,
        lastMiddle instanceof Node ? lastMiddle.children() : [lastMiddle],
      );
    }
  } else {
    // tree is a single element
    return emptyTree;
  }
}

function mkNodes<M, T extends HasMeasure<M>>(
  cfg: MeasurableConfig<M>,
  vals: ReadonlyArray<T>,
): ReadonlyArray<Node<M, T>> {
  const result: Node<M, T>[] = [];
  let i = 0;
  while (i < vals.length) {
    // if exactly 4 left, make two nodes of size 2
    if (vals.length - i === 4) {
      result.push(new Node(cfg, vals[i], vals[i + 1]));
      result.push(new Node(cfg, vals[i + 2], vals[i + 3]));
      return result;
    }
    // if at least 3 left, make a node of size 3
    if (vals.length - i >= 3) {
      result.push(new Node(cfg, vals[i], vals[i + 1], vals[i + 2]));
      i += 3;
    } else {
      // make a node of size 2
      result.push(new Node(cfg, vals[i], vals[i + 1]));
      return result;
    }
  }
  return result;
}

export function join<M, T extends HasMeasure<M>>(
  cfg: MeasurableConfig<M>,
  t1: FingerTree<M, T>,
  vals: ReadonlyArray<T>,
  t2: FingerTree<M, T>,
): FingerTree<M, T> {
  if (t1 === emptyTree) {
    for (let i = vals.length - 1; i >= 0; i--) {
      t2 = unshift(cfg, vals[i], t2);
    }
    return t2;
  } else if (t2 === emptyTree) {
    for (let i = 0; i < vals.length; i++) {
      t1 = push(cfg, t1, vals[i]);
    }
    return t1;
  } else if (!(t1 instanceof DeepNode)) {
    for (let i = vals.length - 1; i >= 0; i--) {
      t2 = unshift(cfg, vals[i], t2);
    }
    return unshift(cfg, t1, t2);
  } else if (!(t2 instanceof DeepNode)) {
    for (let i = 0; i < vals.length; i++) {
      t1 = push(cfg, t1, vals[i]);
    }
    return push(cfg, t1, t2);
  } else {
    // two deep trees, need to merge the right of t1, the nodes, and the left of t2
    return new DeepNode(
      cfg,
      t1.left,
      join(cfg, t1.middle, mkNodes(cfg, [...t1.right, ...vals, ...t2.left]), t2.middle),
      t2.right,
    );
  }
}

export function concat<M, T extends HasMeasure<M>>(
  cfg: MeasurableConfig<M>,
  t1: FingerTree<M, T>,
  t2: FingerTree<M, T>,
): FingerTree<M, T> {
  return join(cfg, t1, [], t2);
}

type SplitResult<M, T extends HasMeasure<M>> = {
  readonly belowOrEqual: FingerTree<M, T>;
  readonly above: FingerTree<M, T>;
};

type DigitSplitResult<M> =
  | {
      readonly type: "contains";
      readonly idx: number;
      readonly seen: M;
    }
  | { readonly type: "allBelow"; readonly seen: M };

function splitDigit<M, T extends HasMeasure<M>>(
  cfg: MeasurableConfig<M>,
  digit: Digit<T>,
  seen: M,
  measure: M,
): DigitSplitResult<M> {
  for (let i = 0; i < digit.length; i++) {
    const seenAfter = cfg.add(seen, digit[i].m);
    if (cfg.compare(measure, seenAfter) < 0) {
      return {
        type: "contains",
        idx: i,
        seen,
      };
    } else {
      seen = seenAfter;
    }
  }
  return { type: "allBelow", seen };
}

type TreeSplitResult<M, T extends HasMeasure<M>> = {
  readonly belowOrEqual: FingerTree<M, T>;
  readonly containingSplit: T;
  readonly above: FingerTree<M, T>;
  readonly seen: M;
};

function splitTree<M, T extends HasMeasure<M>>(
  cfg: MeasurableConfig<M>,
  tree: FingerTree<M, T>,
  seen: M,
  measure: M,
): TreeSplitResult<M, T> {
  if (tree instanceof DeepNode) {
    const leftSplit = splitDigit(cfg, tree.left, seen, measure);
    if (leftSplit.type === "contains") {
      // split is in the left digit
      return {
        belowOrEqual: from(cfg, tree.left.slice(0, leftSplit.idx)),
        containingSplit: tree.left[leftSplit.idx],
        above: mkDeepWithLeftPossiblyEmpty(
          cfg,
          tree.left.slice(leftSplit.idx + 1),
          tree.middle,
          tree.right,
        ),
        seen: leftSplit.seen,
      };
    } else {
      seen = leftSplit.seen;
    }

    if (
      tree.middle !== emptyTree &&
      cfg.compare(measure, cfg.add(seen, tree.middle.m)) < 0
    ) {
      const {
        belowOrEqual,
        containingSplit,
        seen: seenAfterSplit,
        above,
      } = splitTree(cfg, tree.middle, seen, measure);

      const toSplit = containingSplit.children();

      // We are guaranteed to find the split here, so can cast the result
      const middleSplit = splitDigit(
        cfg,
        toSplit,
        seenAfterSplit,
        measure,
      ) as DigitSplitResult<M> & { type: "contains" };

      return {
        belowOrEqual: mkDeepWithRightPossiblyEmpty(
          cfg,
          tree.left,
          belowOrEqual,
          toSplit.slice(0, middleSplit.idx),
        ),
        containingSplit: toSplit[middleSplit.idx],
        above: mkDeepWithLeftPossiblyEmpty(
          cfg,
          toSplit.slice(middleSplit.idx + 1),
          above,
          tree.right,
        ),
        seen: middleSplit.seen,
      };
    }

    // must be in the right
    const rightSplit = splitDigit(cfg, tree.right, seen, measure);
    if (rightSplit.type === "contains") {
      return {
        belowOrEqual: mkDeepWithRightPossiblyEmpty(
          cfg,
          tree.left,
          tree.middle,
          tree.right.slice(0, rightSplit.idx),
        ),
        containingSplit: tree.right[rightSplit.idx],
        above: from(cfg, tree.right.slice(rightSplit.idx + 1)),
        seen: rightSplit.seen,
      };
    } else {
      throw new Error("split measure is out of bounds");
    }
  } else {
    return {
      belowOrEqual: emptyTree,
      containingSplit: tree as T, // can't be empty tree here
      above: emptyTree,
      seen,
    };
  }
}

export function split<M, T extends HasMeasure<M>>(
  cfg: MeasurableConfig<M>,
  tree: FingerTree<M, T>,
  measure: M,
): SplitResult<M, T> {
  if (tree === emptyTree) {
    return { belowOrEqual: emptyTree, above: emptyTree };
  } else if (tree instanceof DeepNode) {
    if (cfg.compare(measure, tree.m) >= 0) {
      // everything is below or equal
      return { belowOrEqual: tree, above: emptyTree };
    } else {
      // split is in the tree, so can call splitTree
      const { belowOrEqual, containingSplit, above, seen } = splitTree(
        cfg,
        tree,
        cfg.zero,
        measure,
      );
      if (cfg.compare(measure, cfg.add(seen, containingSplit.m)) < 0) {
        // add containingSplit to above
        return {
          belowOrEqual,
          above: unshift(cfg, containingSplit, above),
        };
      } else {
        return {
          belowOrEqual: push(cfg, belowOrEqual, containingSplit),
          above,
        };
      }
    }
  } else {
    // single element tree
    if (cfg.compare(measure, tree.m) < 0) {
      return { belowOrEqual: emptyTree, above: tree };
    } else {
      return { belowOrEqual: tree, above: emptyTree };
    }
  }
}

export function* iterate<M, T extends HasMeasure<M>>(
  tree: FingerTree<M, T>,
): Iterable<T> {
  if (tree === emptyTree) {
    return;
  }
  if (tree instanceof DeepNode) {
    yield* tree.left;
    if (tree.middle) {
      for (const node of iterate(tree.middle)) {
        yield node.left;
        yield node.middle;
        if (node.right !== undefined) {
          yield node.right;
        }
      }
    }
    yield* tree.right;
  }
}

export function lookup<M, T extends HasMeasure<M>>(
  { zero, add, compare }: MeasurableConfig<M>,
  tree: FingerTree<M, T>,
  measure: M,
): T {
  if (tree === emptyTree) {
    throw new Error("Index out of bounds");
  }

  let current: HasMeasure<M> = tree;
  let seen = zero;
  mainLoop: while (true) {
    if (current instanceof DeepNode) {
      // Check left digit
      for (let i = 0; i < current.left.length; i++) {
        const node = current.left[i] as HasMeasure<M>;
        const seenAfterNode = add(seen, node.m);
        if (compare(measure, seenAfterNode) < 0) {
          // recurse into this node
          current = node;
          continue mainLoop;
        } else {
          seen = seenAfterNode;
        }
      }

      // Check middle tree
      if (current.middle !== emptyTree) {
        const seenAfterMiddle = add(seen, (current.middle as HasMeasure<M>).m);
        if (compare(measure, seenAfterMiddle) < 0) {
          // recurse into middle tree
          current = current.middle;
          continue mainLoop;
        } else {
          seen = seenAfterMiddle;
        }
      }

      // Check right digit.
      for (let i = 0; i < current.right.length; i++) {
        const node = current.right[i] as HasMeasure<M>;
        const seenAfterNode = add(seen, node.m);
        if (compare(measure, seenAfterNode) < 0) {
          // recurse into this node
          current = node;
          continue mainLoop;
        } else {
          seen = seenAfterNode;
        }
      }
    } else if (current instanceof Node) {
      const v1 = current.left as HasMeasure<M>;
      const v2 = current.middle as HasMeasure<M>;
      const v3 = current.right as HasMeasure<M> | undefined;

      const seenAfterLeft = add(seen, v1.m);
      if (compare(measure, seenAfterLeft) < 0) {
        // must be in v1
        current = v1;
        continue;
      } else if (v3 === undefined) {
        // must be in v2
        seen = seenAfterLeft;
        current = v2;
        continue;
      } else {
        const seenAfterMiddle = add(seenAfterLeft, v2.m);
        if (compare(measure, seenAfterMiddle) < 0) {
          // must be in v2
          seen = seenAfterLeft;
          current = v2;
          continue;
        } else {
          // must be in v3
          seen = seenAfterMiddle;
          current = v3;
          continue;
        }
      }
    } else {
      // single leaf node, return the value.
      return current as T;
    }

    throw new Error("Index out of bounds");
  }
}

function adjustDigit<M, T extends HasMeasure<M>>(
  { add, compare }: MeasurableConfig<M>,
  f: (seen: M, n: T) => T,
  seen: M,
  measure: M,
  digit: Digit<T>,
): Digit<T> {
  const copy = digit.slice();
  for (let i = 0; i < copy.length; i++) {
    const seenAfter = add(seen, copy[i].m);
    if (compare(measure, seenAfter) < 0) {
      copy[i] = f(seen, copy[i]);
      return copy;
    } else {
      seen = seenAfter;
    }
  }
  return copy;
}

function adjustNode<M, T extends HasMeasure<M>>(
  cfg: MeasurableConfig<M>,
  f: (seen: M, n: T) => T,
  seen: M,
  measure: M,
  node: Node<M, T>,
): Node<M, T> {
  const seenAfterLeft = cfg.add(seen, node.left.m);
  if (cfg.compare(measure, seenAfterLeft) < 0) {
    return new Node(cfg, f(seen, node.left), node.middle, node.right);
  } else {
    seen = seenAfterLeft;
  }

  const seenAfterMiddle = cfg.add(seen, node.middle.m);
  if (cfg.compare(measure, seenAfterMiddle) < 0) {
    return new Node(cfg, node.left, f(seenAfterLeft, node.middle), node.right);
  } else if (node.right !== undefined) {
    return new Node(cfg, node.left, node.middle, f(seenAfterMiddle, node.right));
  } else {
    throw new Error("Index out of bounds");
  }
}

function adjustTree<M, T extends HasMeasure<M>>(
  cfg: MeasurableConfig<M>,
  f: (seen: M, n: T) => T,
  seen: M,
  measure: M,
  tree: FingerTree<M, T>,
): FingerTree<M, T> {
  if (tree === emptyTree) {
    return tree;
  } else if (tree instanceof DeepNode) {
    const seenAfterLeft = tree.left.reduce((sum, d) => cfg.add(sum, d.m), seen);
    if (cfg.compare(measure, seenAfterLeft) < 0) {
      return new DeepNode(
        cfg,
        adjustDigit(cfg, f, seen, measure, tree.left),
        tree.middle,
        tree.right,
      );
    }
    seen = seenAfterLeft;

    if (tree.middle !== emptyTree) {
      const seenAfterMiddle = cfg.add(seen, (tree.middle as HasMeasure<M>).m);

      if (cfg.compare(measure, seenAfterMiddle) < 0) {
        const f2 = (seen: M, n: Node<M, T>) => adjustNode(cfg, f, seen, measure, n);
        return new DeepNode(
          cfg,
          tree.left,
          adjustTree(cfg, f2, seen, measure, tree.middle),
          tree.right,
        );
      } else {
        seen = seenAfterMiddle;
      }
    }

    return new DeepNode(
      cfg,
      tree.left,
      tree.middle,
      adjustDigit(cfg, f, seen, measure, tree.right),
    );
  } else {
    return f(seen, tree);
  }
}

export function adjust<M, T extends HasMeasure<M>>(
  cfg: MeasurableConfig<M>,
  f: (x: T) => T,
  measure: M,
  tree: FingerTree<M, T>,
): FingerTree<M, T> {
  if (tree === emptyTree) {
    return tree;
  }
  const f2 = (_: M, n: T) => f(n);
  return adjustTree(cfg, f2, cfg.zero, measure, tree);
}
