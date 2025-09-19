class Node<T> {
  readonly size: number;
  readonly v1: T;
  readonly v2: T;
  readonly v3?: T;
  constructor(v1: T, v2: T, v3?: T) {
    this.size =
      (v1 instanceof Node ? v1.size : 1) +
      (v2 instanceof Node ? v2.size : 1) +
      (v3 === undefined ? 0 : v3 instanceof Node ? v3.size : 1);
    this.v1 = v1;
    this.v2 = v2;
    if (v3 !== undefined) {
      this.v3 = v3;
    }
  }
  children(): ReadonlyArray<T> {
    return this.v3 === undefined ? [this.v1, this.v2] : [this.v1, this.v2, this.v3];
  }
}

// Digits have length 1 to 4
type Digit<T> = ReadonlyArray<T>;

class DeepNode<T> {
  readonly size: number;
  readonly left: Digit<T>;
  readonly middle: FingerTree<Node<T>>;
  readonly right: Digit<T>;

  constructor(
    size: number,
    left: Digit<T>,
    middle: FingerTree<Node<T>>,
    right: Digit<T>,
  ) {
    this.size = size;
    this.left = left;
    this.middle = middle;
    this.right = right;
  }
}

const emptyTree = Symbol("emptyTree");
export type EmptyTree = typeof emptyTree;

export type FingerTree<T> = EmptyTree | T | DeepNode<T>;

export function isEmpty<T>(tree: FingerTree<T>): tree is EmptyTree {
  return tree === emptyTree;
}

export function size<T>(tree: FingerTree<T>): number {
  if (tree === emptyTree) {
    return 0;
  } else if (tree instanceof DeepNode) {
    return tree.size;
  } else if (tree instanceof Node) {
    return tree.size;
  } else {
    return 1;
  }
}

export function unshift<T>(value: T, tree: FingerTree<T>): FingerTree<T> {
  if (tree === emptyTree) {
    return value;
  }
  const addingSize = size(value);
  if (tree instanceof DeepNode) {
    if (tree.left.length === 4) {
      // left digit is full, need to move them into the middle
      // Deep([d1, d2, d3 d4], mi, right) becomes Deep([v, d1], Node [d2 d3 d4] added to mi, right)
      return new DeepNode(
        tree.size + addingSize,
        [value, tree.left[0]],
        unshift(new Node(tree.left[1], tree.left[2], tree.left[3]), tree.middle),
        tree.right,
      );
    } else {
      // add to left digit
      return new DeepNode(
        tree.size + addingSize,
        [value, ...tree.left],
        tree.middle,
        tree.right,
      );
    }
  } else {
    const treeSize = size(tree);
    return new DeepNode(addingSize + treeSize, [value], emptyTree, [tree]);
  }
}

export function push<T>(tree: FingerTree<T>, value: T): FingerTree<T> {
  if (tree === emptyTree) {
    return value;
  }
  const addingSize = size(value);
  if (tree instanceof DeepNode) {
    if (tree.right.length === 4) {
      // right digit is full, need to move them into the middle
      // Deep(left, mi, [d1, d2, d3 d4]) becomes Deep(left, mi with [d1 d2 d3], [d4, v])
      return new DeepNode(
        tree.size + addingSize,
        tree.left,
        push(tree.middle, new Node(tree.right[0], tree.right[1], tree.right[2])),
        [tree.right[3], value],
      );
    } else {
      // add to right digit
      return new DeepNode(tree.size + addingSize, tree.left, tree.middle, [
        ...tree.right,
        value,
      ]);
    }
  } else {
    const treeSize = size(tree);
    return new DeepNode(treeSize + addingSize, [tree], emptyTree, [value]);
  }
}

export function head<T>(tree: FingerTree<T>): T | undefined {
  if (tree instanceof DeepNode) {
    return tree.left[0];
  } else if (tree === emptyTree) {
    return undefined;
  } else {
    return tree;
  }
}

export function tail<T>(tree: FingerTree<T>): FingerTree<T> {
  if (tree === emptyTree) {
    return emptyTree;
  } else if (tree instanceof DeepNode) {
    // remove the first element from the left digit
    const removeSize = size(tree.left[0]);
    if (tree.left.length > 1) {
      // left digit has more than one element, just remove the first
      return new DeepNode(
        tree.size - removeSize,
        tree.left.slice(1),
        tree.middle,
        tree.right,
      );
    } else if (tree.middle === emptyTree) {
      // single left digit, no middle.  Right becomes the new tree
      if (tree.right.length === 1) {
        // right has only one element, so the result is a single element tree
        return tree.right[0];
      } else if (tree.right.length === 4) {
        // keep balanced, so put 2 on each side
        return new DeepNode(
          tree.size - removeSize,
          [tree.right[0], tree.right[1]],
          emptyTree,
          [tree.right[2], tree.right[3]],
        );
      } else {
        // put one on the left, rest on the right
        return new DeepNode(
          tree.size - removeSize,
          [tree.right[0]],
          emptyTree,
          tree.right.slice(1),
        );
      }
    } else {
      const a = tree.middle instanceof DeepNode ? tree.left[0] : tree.middle;
      const restMiddle = tail(tree.middle);
      return new DeepNode(
        tree.size - removeSize,
        a instanceof Node ? a.children() : [a],
        restMiddle,
        tree.right,
      );
    }
  } else {
    // tree is a single element
    return emptyTree;
  }
}

function mkNodes<T>(vals: ReadonlyArray<T>): Node<T>[] {
  if (vals.length === 0) {
    return [];
  } else if (vals.length <= 3) {
    // single node
    return [new Node(vals[0], vals[1], vals[2])];
  } else if (vals.length === 4) {
    // two nodes, balanced as size 2, 2
    return [new Node(vals[0], vals[1]), new Node(vals[2], vals[3])];
  } else {
    // first node of size 3, added to the rest
    const n = mkNodes(vals.slice(3));
    n.unshift(new Node(vals[0], vals[1], vals[2]));
    return n;
  }
}

function addInMiddle<T>(
  t1: FingerTree<T>,
  vals: ReadonlyArray<T>,
  t2: FingerTree<T>,
): FingerTree<T> {
  if (t1 === emptyTree) {
    for (let i = vals.length - 1; i >= 0; i--) {
      t2 = unshift(vals[i], t2);
    }
    return t2;
  } else if (t2 === emptyTree) {
    for (let i = 0; i < vals.length; i++) {
      t1 = push(t1, vals[i]);
    }
    return t1;
  } else if (!(t1 instanceof DeepNode)) {
    for (let i = vals.length - 1; i >= 0; i--) {
      t2 = unshift(vals[i], t2);
    }
    return unshift(t1, t2);
  } else if (!(t2 instanceof DeepNode)) {
    for (let i = 0; i < vals.length; i++) {
      t1 = push(t1, vals[i]);
    }
    return push(t1, t2);
  } else {
    // two deep trees, need to merge the right of t1, the nodes, and the left of t2
    const valsSize = vals.reduce((sum, v) => sum + size(v), 0);
    return new DeepNode(
      t1.size + t2.size + valsSize,
      t1.left,
      addInMiddle(t1.middle, mkNodes([...t1.right, ...vals, ...t2.left]), t2.middle),
      t2.right,
    );
  }
}

export function concat<T>(t1: FingerTree<T>, t2: FingerTree<T>): FingerTree<T> {
  return addInMiddle(t1, [], t2);
}

export function* iterate<T>(tree: FingerTree<T>): Iterable<T> {
  if (tree === emptyTree) {
    return;
  }
  if (tree instanceof DeepNode) {
    yield* tree.left;
    if (tree.middle) {
      for (const node of iterate(tree.middle)) {
        yield node.v1;
        yield node.v2;
        if (node.v3 !== undefined) {
          yield node.v3;
        }
      }
    }
    yield* tree.right;
  }
}

function lookupNode<T>([index, node]: [index: number, node: Node<T>]): [number, T] {
  const v1Size = size(node.v1);
  if (index < v1Size) {
    return [index, node.v1];
  }
  const v2Size = size(node.v2);
  if (node.v3 === undefined || index < v1Size + v2Size) {
    return [index - v1Size, node.v2];
  } else {
    return [index - v1Size - v2Size, node.v3];
  }
}

function lookupTree<T>(index: number, tree: T | DeepNode<T>): [number, T] {
  if (tree instanceof DeepNode) {
    for (let i = 0; i < tree.left.length; i++) {
      const node = tree.left[i];
      const nodeSize = size(node);
      if (index < nodeSize) {
        return [index, node];
      } else {
        index -= nodeSize;
      }
    }

    const middleSize = size(tree.middle);
    if (tree.middle !== emptyTree && index < middleSize) {
      return lookupNode(lookupTree(index, tree.middle));
    }

    index -= middleSize;

    for (let i = 0; i < tree.right.length; i++) {
      const node = tree.right[i];
      const nodeSize = size(node);
      if (index < nodeSize) {
        return [index, node];
      }
      index -= nodeSize;
    }
    // Not reachable, because of the size check in lookup
    throw new Error("Index out of bounds");
  } else {
    return [index, tree];
  }
}

export function lookup<T>(tree: FingerTree<T>, index: number): T {
  if (tree === emptyTree || index < 0 || index >= size(tree)) {
    throw new Error("Index out of bounds");
  }
  return lookupTree(index, tree)[1];
}

function adjustDigit<T>(
  f: (idx: number, n: T) => T,
  idx: number,
  digit: Digit<T>,
): Digit<T> {
  if (idx < 0 || idx >= digit.length) {
    return digit;
  }
  const copy = digit.slice();
  copy[idx] = f(idx, copy[idx]);
  return copy;
}

function adjustNode<T>(f: (idx: number, n: T) => T, idx: number, node: Node<T>): Node<T> {
  const size1 = size(node.v1);
  if (idx < size1) {
    return new Node(f(idx, node.v1), node.v2, node.v3);
  } else {
    idx -= size1;
  }

  const size2 = size(node.v2);
  if (idx < size2) {
    return new Node(node.v1, f(idx, node.v2), node.v3);
  } else if (node.v3 !== undefined) {
    return new Node(node.v1, node.v2, f(idx - size2, node.v3));
  } else {
    // Not reachable, because of the size check in adjust
    throw new Error("Index out of bounds");
  }
}

function adjustTree<T>(
  f: (idx: number, n: T) => T,
  idx: number,
  tree: FingerTree<T>,
): FingerTree<T> {
  if (tree === emptyTree) {
    return tree;
  }
  if (tree instanceof DeepNode) {
    const leftSize = tree.left.reduce((sum, node) => sum + size(node), 0);
    if (idx < leftSize) {
      return new DeepNode(
        tree.size,
        adjustDigit(f, idx, tree.left),
        tree.middle,
        tree.right,
      );
    }
    const middleSize = size(tree.middle);
    if (tree.middle !== emptyTree && idx < leftSize + middleSize) {
      const f2 = (i: number, n: Node<T>) => adjustNode(f, i, n);
      return new DeepNode(
        tree.size,
        tree.left,
        adjustTree(f2, idx - leftSize, tree.middle),
        tree.right,
      );
    }
    return new DeepNode(
      tree.size,
      tree.left,
      tree.middle,
      adjustDigit(f, idx - leftSize - middleSize, tree.right),
    );
  } else {
    return f(idx, tree);
  }
}

export function adjust<T>(
  f: (x: T) => T,
  idx: number,
  tree: FingerTree<T>,
): FingerTree<T> {
  if (tree === emptyTree || idx < 0 || idx >= size(tree)) {
    return tree;
  }
  const f2 = (_: number, n: T) => f(n);
  return adjustTree(f2, idx, tree);
}
