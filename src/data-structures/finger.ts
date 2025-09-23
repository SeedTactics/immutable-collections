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
      // Deep([d1, d2, d3 d4], mi, right) becomes Deep([v, d1], Node(d2 d3 d4) added to mi, right)
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
      // Deep(left, mi, [d1, d2, d3 d4]) becomes Deep(left, mi with Node(d1 d2 d3), [d4, v])
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

export function last<T>(tree: FingerTree<T>): T | undefined {
  if (tree instanceof DeepNode) {
    return tree.right[tree.right.length - 1];
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
      // the middle is not empty, need to pull an element up from there
      const headMiddle = tree.middle instanceof DeepNode ? tree.left[0] : tree.middle;
      const restMiddle = tail(tree.middle);
      return new DeepNode(
        tree.size - removeSize,
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

export function allButLast<T>(tree: FingerTree<T>): FingerTree<T> {
  if (tree === emptyTree) {
    return emptyTree;
  } else if (tree instanceof DeepNode) {
    // remove the last element from the right digit
    const removeSize = size(tree.right[tree.right.length - 1]);
    if (tree.right.length > 1) {
      // right digit has more than one element, just remove the last
      return new DeepNode(
        tree.size - removeSize,
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
        return new DeepNode(
          tree.size - removeSize,
          [tree.left[0], tree.left[1]],
          emptyTree,
          [tree.left[2], tree.left[3]],
        );
      } else {
        // put one on the right, rest on the left
        return new DeepNode(
          tree.size - removeSize,
          tree.left.slice(0, tree.left.length - 1),
          emptyTree,
          [tree.left[tree.left.length - 1]],
        );
      }
    } else {
      // single right digit, the middle is not empty, need to pull an element up from there
      const lastMiddle =
        tree.middle instanceof DeepNode ? tree.right[tree.right.length - 1] : tree.middle;
      const restMiddle = allButLast(tree.middle);
      return new DeepNode(
        tree.size - removeSize,
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

function mkNodes<T>(vals: ReadonlyArray<T>): ReadonlyArray<Node<T>> {
  const result: Node<T>[] = [];
  let i = 0;
  while (i < vals.length) {
    // if exactly 4 left, make two nodes of size 2
    if (vals.length - i === 4) {
      result.push(new Node(vals[i], vals[i + 1]));
      result.push(new Node(vals[i + 2], vals[i + 3]));
      return result;
    }
    // if at least 3 left, make a node of size 3
    if (vals.length - i >= 3) {
      result.push(new Node(vals[i], vals[i + 1], vals[i + 2]));
      i += 3;
    } else {
      // make a node of size 2
      result.push(new Node(vals[i], vals[i + 1]));
      return result;
    }
  }
  return result;
}

export function join<T>(
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
      join(t1.middle, mkNodes([...t1.right, ...vals, ...t2.left]), t2.middle),
      t2.right,
    );
  }
}

export function concat<T>(t1: FingerTree<T>, t2: FingerTree<T>): FingerTree<T> {
  return join(t1, [], t2);
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

export function lookup2<T>(tree: FingerTree<T>, index: number): T {
  let current: FingerTree<unknown> = tree;
  if (tree === emptyTree || index < 0 || index >= size(tree)) {
    throw new Error("Index out of bounds");
  }

  // iterative version of the above
  let idx = index;
  mainLoop: while (true) {
    if (current instanceof DeepNode) {
      // Check left digit
      if (current.left[0] instanceof Node) {
        // left digit is all nodes
        for (let i = 0; i < current.left.length; i++) {
          const node = current.left[i] as Node<unknown>;
          if (idx < node.size) {
            // recurse into this node
            current = node as FingerTree<unknown>;
            continue mainLoop;
          } else {
            idx -= node.size;
          }
        }
      } else {
        // leaf node, return the value
        return current.left[idx] as T;
      }

      // Check middle tree
      if (current.middle !== emptyTree) {
        if (idx < current.middle.size) {
          // recurse into middle tree
          current = current.middle;
          continue mainLoop;
        } else {
          idx -= current.middle.size;
        }
      }

      // Check right digit.
      if (current.right[0] instanceof Node) {
        // right digit is all nodes
        for (let i = 0; i < current.right.length; i++) {
          const node = current.right[i] as Node<unknown>;
          if (idx < node.size) {
            // recurse into this node
            current = node as FingerTree<unknown>;
            continue mainLoop;
          } else {
            idx -= node.size;
          }
        }
      } else {
        // leaf node, return the value
        return current.right[idx] as T;
      }
    } else if (current instanceof Node) {
      const v1Size = size(current.v1);
      if (idx < v1Size) {
        current = current.v1 as FingerTree<unknown>;
        continue;
      } else if (current.v3 === undefined) {
        // must be in v2
        idx -= v1Size;
        current = current.v2 as FingerTree<unknown>;
        continue;
      } else {
        const v2Size = size(current.v2);
        if (idx < v1Size + v2Size) {
          // must be in v2
          idx -= v1Size;
          current = current.v2 as FingerTree<unknown>;
          continue;
        } else {
          // must be in v3
          idx -= v1Size + v2Size;
          current = current.v3 as FingerTree<unknown>;
          continue;
        }
      }
    } else {
      // single leaf node, return the value.  The overall index checks guarantee idx is 0
      return current as T;
    }

    // Because of the overall size checks, we should never get here.  The loop should always
    // either return or continue
    throw new Error("Invalid tree detected");
  }
}

function adjustDigit<T>(
  f: (idx: number, n: T) => T,
  idx: number,
  digit: Digit<T>,
): Digit<T> {
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
  } else if (tree instanceof DeepNode) {
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
