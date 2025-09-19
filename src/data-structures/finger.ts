type Node<T> = {
  readonly v1: T;
  readonly v2: T;
  readonly v3?: T;
};

type Digit<T> = {
  readonly d1: T;
  readonly d2?: T;
  readonly d3?: T;
  readonly d4?: T;
};

type FingerTree<T> =
  | { readonly v: T }
  | {
      readonly left: Digit<T>;
      readonly middle: FingerTree<Node<T>> | null;
      readonly right: Digit<T>;
    };

function nodeToDigit<T>(node: Node<T>): Digit<T> {
  return {
    d1: node.v1,
    d2: node.v2,
    d3: node.v3,
  };
}

export function unshift<T>(value: T, tree: FingerTree<T> | null): FingerTree<T> {
  if (tree === null) {
    return { v: value };
  } else if ("v" in tree) {
    return {
      left: { d1: value },
      middle: null,
      right: { d1: tree.v },
    };
  } else if (tree.left.d4 !== undefined) {
    // left digit is full, need to move them into the middle
    // Tree [d1, d2, d3 d4] mi right becomse Tree [v, d1] (Node3 d2 d3 d4 added to mi) right
    const newNode: Node<T> = {
      v1: tree.left.d2!, // maintain an invariant that d4 is defined, then d2 and d3 are also defined
      v2: tree.left.d3!,
      v3: tree.left.d4,
    };
    return {
      left: { d1: value },
      middle: unshift(newNode, tree.middle),
      right: tree.right,
    };
  } else {
    // add to left digit
    return {
      left: {
        d1: value,
        d2: tree.left.d1,
        d3: tree.left.d2,
        d4: tree.left.d3,
      },
      middle: tree.middle,
      right: tree.right,
    };
  }
}

export function push<T>(tree: FingerTree<T> | null, value: T): FingerTree<T> {
  if (tree === null) {
    return { v: value };
  } else if ("v" in tree) {
    return {
      left: { d1: tree.v },
      middle: null,
      right: { d1: value },
    };
  } else if (tree.right.d4 !== undefined) {
    // right digit is full, need to move them into the middle
    // Tree left mi [d1, d2, d3 d4] becomes Tree left (mi with Node3 d1 d2 d3 added) [d4, v]
    const newNode: Node<T> = {
      v1: tree.right.d1,
      v2: tree.right.d2!, // maintain an invariant that d4 is defined, then d2 and d3 are also defined
      v3: tree.right.d3,
    };
    return {
      left: tree.left,
      middle: push(tree.middle, newNode),
      right: { d1: tree.right.d4, d2: value },
    };
  } else {
    // add to right digit
    return {
      left: tree.left,
      middle: tree.middle,
      right: {
        d1: tree.right.d1,
        d2: tree.right.d2,
        d3: tree.right.d3,
        d4: value,
      },
    };
  }
}

export function head<T>(tree: FingerTree<T>): T {
  if ("v" in tree) {
    return tree.v;
  } else {
    return tree.left.d1;
  }
}

export function tail<T>(tree: FingerTree<T>): FingerTree<T> | null {
  if ("v" in tree) {
    return null;
  } else if (tree.left.d2 !== undefined) {
    // left digit has more than one element, just remove the first
    return {
      left: {
        d1: tree.left.d2,
        d2: tree.left.d3,
        d3: tree.left.d4,
      },
      middle: tree.middle,
      right: tree.right,
    };
  } else if (tree.middle === null) {
    // single left digit, no middle.  Right becomes the new tree
    if (tree.right.d2 === undefined) {
      // right has only one element, so the result is a single element tree
      return { v: tree.right.d1 };
    } else {
      return {
        left: {
          d1: tree.right.d1,
        },
        middle: null,
        right: {
          d1: tree.right.d2,
          d2: tree.right.d3,
          d3: tree.right.d4,
        },
      };
    }
  } else {
    const a = head(tree.middle);
    const restMiddle = tail(tree.middle);
    return {
      left: nodeToDigit(a),
      middle: restMiddle,
      right: tree.right,
    };
  }
}

function mkNodesMaxLen9<T>(vals: T[]): Node<T>[] {
  if (vals.length === 0) {
    return [];
  } else if (vals.length <= 3) {
    // single node
    return [{ v1: vals[0], v2: vals[1], v3: vals[2] }];
  } else if (vals.length === 4) {
    // two nodes, balanced (need v1 and v2 not undefined)
    return [
      { v1: vals[0], v2: vals[1] },
      { v1: vals[2], v2: vals[3] },
    ];
  } else if (vals.length <= 6) {
    // two nodes
    return [
      { v1: vals[0], v2: vals[1], v3: vals[2] },
      { v1: vals[3], v2: vals[4], v3: vals[5] },
    ];
  } else if (vals.length === 7) {
    // three nodes, balanced
    return [
      { v1: vals[0], v2: vals[1], v3: vals[2] },
      { v1: vals[3], v2: vals[4] },
      { v1: vals[5], v2: vals[6] },
    ];
  } else {
    // three nodes
    return [
      { v1: vals[0], v2: vals[1], v3: vals[2] },
      { v1: vals[3], v2: vals[4], v3: vals[5] },
      { v1: vals[6], v2: vals[7], v3: vals[8] },
    ];
  }
}

function addInMiddle<T>(
  t1: FingerTree<T> | null,
  vals: T[],
  t2: FingerTree<T> | null,
): FingerTree<T> | null {
  if (t1 === null) {
    for (let i = vals.length - 1; i >= 0; i--) {
      t2 = unshift(vals[i], t2);
    }
    return t2;
  } else if (t2 === null) {
    for (let i = 0; i < vals.length; i++) {
      t1 = push(t1, vals[i]);
    }
    return t1;
  } else if ("v" in t1) {
    for (let i = vals.length - 1; i >= 0; i--) {
      t2 = unshift(vals[i], t2);
    }
    return unshift(t1.v, t2);
  } else if ("v" in t2) {
    for (let i = 0; i < vals.length; i++) {
      t1 = push(t1, vals[i]);
    }
    return push(t1, t2.v);
  } else {
    // two deep trees, need to merge the right of t1, the nodes, and the left of t2
    const allNodes: T[] = [];
    allNodes.push(t1.right.d1);
    if (t1.right.d2 !== undefined) allNodes.push(t1.right.d2);
    if (t1.right.d3 !== undefined) allNodes.push(t1.right.d3);
    if (t1.right.d4 !== undefined) allNodes.push(t1.right.d4);
    allNodes.push(...vals);
    allNodes.push(t2.left.d1);
    if (t2.left.d2 !== undefined) allNodes.push(t2.left.d2);
    if (t2.left.d3 !== undefined) allNodes.push(t2.left.d3);
    if (t2.left.d4 !== undefined) allNodes.push(t2.left.d4);
    return {
      left: t1.left,
      middle: addInMiddle(t1.middle, mkNodesMaxLen9(allNodes), t2.middle),
      right: t2.right,
    };
  }
}

export function concat<T>(
  t1: FingerTree<T> | null,
  t2: FingerTree<T> | null,
): FingerTree<T> | null {
  return addInMiddle(t1, [], t2);
}

export function* iterate<T>(tree: FingerTree<T> | null): Iterable<T> {
  if (tree === null) {
    return;
  }
  if ("v" in tree) {
    yield tree.v;
  } else {
    yield tree.left.d1;
    if (tree.left.d2 !== undefined) yield tree.left.d2;
    if (tree.left.d3 !== undefined) yield tree.left.d3;
    if (tree.left.d4 !== undefined) yield tree.left.d4;
    if (tree.middle !== undefined) {
      for (const node of iterate(tree.middle)) {
        yield node.v1;
        yield node.v2;
        if (node.v3 !== undefined) yield node.v3;
      }
    }
    yield tree.right.d1;
    if (tree.right.d2 !== undefined) yield tree.right.d2;
    if (tree.right.d3 !== undefined) yield tree.right.d3;
    if (tree.right.d4 !== undefined) yield tree.right.d4;
  }
}
