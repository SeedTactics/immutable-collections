/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { ComparisionConfig } from "./comparison.js";
import {
  combineAfterInsertOrRemove,
  combineDifferentSizes,
  glueDifferentSizes,
  glueSizeBalanced,
  MutableTreeNode,
  mutateBalanceAfterLeftIncrease,
  mutateBalanceAfterRightIncrease,
  TreeNode,
} from "./rotations.js";
export { TreeNode, MutableTreeNode } from "./rotations.js";

/*
Implementation of a size-balanced binary tree.

The algorithms here are copied pretty much directly from haskell's containers
library: https://github.com/haskell/containers/blob/master/containers/src/Data/Map/Internal.hs
*/

export function lookup<K, V>({ compare }: ComparisionConfig<K>, k: K, root: TreeNode<K, V> | null): V | undefined {
  let node = root;
  while (node) {
    const c = compare(k, node.key);
    if (c === 0) {
      return node.val;
    } else if (c < 0) {
      node = node.left;
    } else {
      node = node.right;
    }
  }

  return undefined;
}

// TODO: lookupLT, lookupLE, lookupGT, lookupGE

/* Benchmarking a variety of implementation strategies (see  commit 785942937019aa44527605bb4231d68f2692ec56)
   showed that a recursive function was faster than a loop+stack, and that dedicated insert/remove
   functions had roughly the same performance as the generalized alter function.
*/
export function alter<K, V>(
  { compare }: ComparisionConfig<K>,
  k: K,
  f: (oldV: V | undefined) => V | undefined,
  root: TreeNode<K, V> | null
): TreeNode<K, V> | null {
  function loop(node: TreeNode<K, V> | null): TreeNode<K, V> | null {
    if (node === null) {
      const newVal = f(undefined);
      if (newVal === undefined) {
        return null;
      } else {
        return { key: k, val: newVal, size: 1, left: null, right: null };
      }
    }

    const c = compare(k, node.key);
    if (c === 0) {
      const newVal = f(node.val);
      if (newVal === undefined) {
        return glueSizeBalanced(node.left, node.right);
      } else if (newVal === node.val) {
        return node;
      } else {
        return { key: k, val: newVal, size: node.size, left: node.left, right: node.right };
      }
    } else if (c < 0) {
      const newLeft = loop(node.left);
      if (newLeft === node.left) {
        return node;
      } else {
        return combineAfterInsertOrRemove(newLeft, node.key, node.val, node.right);
      }
    } else {
      const newRight = loop(node.right);
      if (newRight === node.right) {
        return node;
      } else {
        return combineAfterInsertOrRemove(node.left, node.key, node.val, newRight);
      }
    }
  }

  return loop(root);
}

export function two<K, V>(cmp: number, k1: K, v1: V, k2: K, v2: V): TreeNode<K, V> {
  if (cmp < 0) {
    return {
      key: k1,
      val: v1,
      size: 2,
      left: null,
      right: {
        key: k2,
        val: v2,
        size: 1,
        left: null,
        right: null,
      },
    };
  } else {
    return {
      key: k1,
      val: v1,
      size: 2,
      left: {
        key: k2,
        val: v2,
        size: 1,
        left: null,
        right: null,
      },
      right: null,
    };
  }
}

export function mutateInsert<K, V, T>(
  { compare }: ComparisionConfig<K>,
  k: K,
  t: T,
  getVal: (old: V | undefined, t: T) => V,
  root: MutableTreeNode<K, V> | null
): MutableTreeNode<K, V> {
  let newLeaf = true;
  function insertLoop(node: MutableTreeNode<K, V> | null): MutableTreeNode<K, V> {
    if (node === null) return { key: k, val: getVal(undefined, t), size: 1, left: null, right: null };
    const c = compare(k, node.key);
    if (c < 0) {
      node.left = insertLoop(node.left);
      if (newLeaf) node.size += 1;
      return mutateBalanceAfterLeftIncrease(node);
    } else if (c > 0) {
      node.right = insertLoop(node.right);
      if (newLeaf) node.size += 1;
      return mutateBalanceAfterRightIncrease(node);
    } else {
      const newVal = getVal(node.val, t);
      if (newVal === node.val) {
        newLeaf = false;
        return node;
      } else {
        newLeaf = false;
        return {
          key: node.key,
          val: newVal,
          size: node.size,
          left: node.left,
          right: node.right,
        };
      }
    }
  }

  return insertLoop(root);
}

export function from<K, V>(
  { compare }: ComparisionConfig<K>,
  items: Iterable<readonly [K, V]>,
  merge?: (v1: V, v2: V) => V
): TreeNode<K, V> | null {
  let k: K;
  let v: V;
  let root = null;
  let newLeaf = true;

  function insertLoop(node: MutableTreeNode<K, V> | null): MutableTreeNode<K, V> {
    if (node === null) return { key: k, val: v, size: 1, left: null, right: null };
    const c = compare(k, node.key);
    if (c < 0) {
      node.left = insertLoop(node.left);
      if (newLeaf) node.size += 1;
      return mutateBalanceAfterLeftIncrease(node);
    } else if (c > 0) {
      node.right = insertLoop(node.right);
      if (newLeaf) node.size += 1;
      return mutateBalanceAfterRightIncrease(node);
    } else if (v === node.val) {
      newLeaf = false;
      return node;
    } else {
      newLeaf = false;
      return {
        key: node.key,
        val: merge ? merge(node.val, v) : v,
        size: node.size,
        left: node.left,
        right: node.right,
      };
    }
  }

  for ([k, v] of items) {
    root = insertLoop(root);
    newLeaf = true;
  }

  return root;
}

export function build<T, K, V>(
  { compare }: ComparisionConfig<K>,
  items: Iterable<T>,
  key: (t: T) => K,
  val?: (old: V | undefined, t: T) => V
): TreeNode<K, V> | null {
  let k: K;
  let t: T;
  let root = null;
  let newLeaf = true;

  function insertLoop(node: MutableTreeNode<K, V> | null): MutableTreeNode<K, V> {
    if (node === null)
      return { key: k, val: val ? val(undefined, t) : (t as unknown as V), size: 1, left: null, right: null };
    const c = compare(k, node.key);
    if (c < 0) {
      node.left = insertLoop(node.left);
      if (newLeaf) node.size += 1;
      return mutateBalanceAfterLeftIncrease(node);
    } else if (c > 0) {
      node.right = insertLoop(node.right);
      if (newLeaf) node.size += 1;
      return mutateBalanceAfterRightIncrease(node);
    } else {
      newLeaf = false;
      const newVal = val ? val(node.val, t) : (t as unknown as V);
      if (newVal === node.val) {
        return node;
      } else {
        return {
          key: node.key,
          val: newVal,
          size: node.size,
          left: node.left,
          right: node.right,
        };
      }
    }
  }

  for (t of items) {
    k = key(t);
    root = insertLoop(root);
    newLeaf = true;
  }

  return root;
}

export function* iterateAsc<K, V, T>(f: (k: K, v: V) => T, root: TreeNode<K, V> | null): IterableIterator<T> {
  const nodes: Array<TreeNode<K, V>> = [];
  let node: TreeNode<K, V> | null = root;
  while (node !== null || nodes.length > 0) {
    if (node !== null) {
      nodes.push(node);
      node = node.left;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      node = nodes.pop()!;
      yield f(node.key, node.val);
      node = node.right;
    }
  }
}

export function* iterateDesc<K, V, T>(f: (k: K, v: V) => T, root: TreeNode<K, V> | null): IterableIterator<T> {
  const nodes: Array<TreeNode<K, V>> = [];
  let node: TreeNode<K, V> | null = root;
  while (node !== null || nodes.length > 0) {
    if (node !== null) {
      nodes.push(node);
      node = node.right;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      node = nodes.pop()!;
      yield f(node.key, node.val);
      node = node.left;
    }
  }
}

export function foldl<K, V, T>(f: (acc: T, k: K, v: V) => T, zero: T, root: TreeNode<K, V> | null): T {
  const nodes: Array<TreeNode<K, V>> = [];
  let node: TreeNode<K, V> | null = root;
  let acc = zero;
  while (node !== null || nodes.length > 0) {
    if (node !== null) {
      nodes.push(node);
      node = node.left;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      node = nodes.pop()!;
      acc = f(acc, node.key, node.val);
      node = node.right;
    }
  }

  return acc;
}

export function foldr<K, V, T>(f: (k: K, v: V, acc: T) => T, zero: T, root: TreeNode<K, V> | null): T {
  const nodes: Array<TreeNode<K, V>> = [];
  let node: TreeNode<K, V> | null = root;
  let acc = zero;
  while (node !== null || nodes.length > 0) {
    if (node !== null) {
      nodes.push(node);
      node = node.right;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      node = nodes.pop()!;
      acc = f(node.key, node.val, acc);
      node = node.left;
    }
  }

  return acc;
}

export function mapValues<K, V1, V2>(f: (v: V1, k: K) => V2, root: TreeNode<K, V1> | null): TreeNode<K, V2> | null {
  function loop(n: TreeNode<K, V1> | null): TreeNode<K, V2> | null {
    if (!n) return null;
    const newLeft = loop(n.left);
    const newVal = f(n.val, n.key);
    const newRight = loop(n.right);

    // typescript won't let us compare V1 with V2, but if the types V1 are equal to V2 and the values are equal, we want to
    // return the tree unchanged.
    if ((newVal as unknown) === (n.val as unknown) && newLeft === n.left && newRight === n.right) {
      // if the values are equal, the types must be equal as well
      return n as unknown as TreeNode<K, V2>;
    } else {
      return { key: n.key, val: newVal, size: n.size, left: newLeft, right: newRight };
    }
  }

  return loop(root);
}

export function collectValues<K, V1, V2>(
  f: (v: V1, k: K) => V2 | undefined,
  filterNull: boolean,
  root: TreeNode<K, V1> | null
): TreeNode<K, V2> | null {
  function loop(n: TreeNode<K, V1> | null): TreeNode<K, V2> | null {
    if (!n) return null;
    const newLeft = loop(n.left);
    const newVal = f(n.val, n.key);
    const newRight = loop(n.right);
    if (newVal === undefined || (filterNull && newVal === null)) {
      return glueDifferentSizes(newLeft, newRight);
    }
    // typescript won't let us compare V1 with V2, but if the types V1 are equal to V2 and the values are equal, we want to
    // return the tree unchanged.
    else if ((newVal as unknown) === (n.val as unknown) && newLeft === n.left && newRight === n.right) {
      // if the values are equal, the types must be equal as well
      return n as unknown as TreeNode<K, V2>;
    } else {
      return combineDifferentSizes(newLeft, n.key, newVal, newRight);
    }
  }

  return loop(root);
}

export interface SplitResult<K, V> {
  readonly below: TreeNode<K, V> | null;
  readonly val: V | undefined;
  readonly above: TreeNode<K, V> | null;
}

export function split<K, V>({ compare }: ComparisionConfig<K>, k: K, root: TreeNode<K, V> | null): SplitResult<K, V> {
  function loop(n: TreeNode<K, V> | null): SplitResult<K, V> {
    if (!n) return { below: null, val: undefined, above: null };
    const c = compare(k, n.key);
    if (c < 0) {
      const splitLeft = loop(n.left);
      const above = combineDifferentSizes(splitLeft.above, n.key, n.val, n.right);
      return { below: splitLeft.below, val: splitLeft.val, above };
    } else if (c > 0) {
      const splitRight = loop(n.right);
      const below = combineDifferentSizes(n.left, n.key, n.val, splitRight.below);
      return { below, val: splitRight.val, above: splitRight.above };
    } else {
      return { below: n.left, val: n.val, above: n.right };
    }
  }

  return loop(root);
}

export function union<K, V>(
  cfg: ComparisionConfig<K>,
  f: (v1: V, v2: V, k: K) => V,
  root1: TreeNode<K, V> | null,
  root2: TreeNode<K, V> | null
): TreeNode<K, V> | null {
  function loop(n1: TreeNode<K, V> | null, n2: TreeNode<K, V> | null): TreeNode<K, V> | null {
    if (!n1) return n2;
    if (!n2) return n1;
    if (!n1.left && !n1.right) {
      return alter(cfg, n1.key, (oldVal) => (oldVal === undefined ? n1.val : f(n1.val, oldVal, n1.key)), n2);
    }
    if (!n2.left && !n2.right) {
      return alter(cfg, n2.key, (oldVal) => (oldVal === undefined ? n2.val : f(oldVal, n2.val, n2.key)), n1);
    }

    const s = split(cfg, n1.key, n2);
    const newLeft = loop(n1.left, s.below);
    const newRight = loop(n1.right, s.above);
    if (newLeft === n1.left && newRight === n1.right && (s.val === undefined || s.val === n1.val)) {
      return n1;
    } else if (s.val !== undefined) {
      return combineDifferentSizes(newLeft, n1.key, f(n1.val, s.val, n1.key), newRight);
    } else {
      return combineDifferentSizes(newLeft, n1.key, n1.val, newRight);
    }
  }

  return loop(root1, root2);
}

export function intersection<K, V>(
  cfg: ComparisionConfig<K>,
  f: (v1: V, v2: V, k: K) => V,
  root1: TreeNode<K, V> | null,
  root2: TreeNode<K, V> | null
): TreeNode<K, V> | null {
  function loop(n1: TreeNode<K, V> | null, n2: TreeNode<K, V> | null): TreeNode<K, V> | null {
    if (!n1) return null;
    if (!n2) return null;

    const s = split(cfg, n1.key, n2);
    const newLeft = loop(n1.left, s.below);
    const newRight = loop(n1.right, s.above);
    if (s.val !== undefined) {
      if (newLeft === n1.left && newRight === n1.right && s.val === n1.val) {
        return n1;
      } else {
        return combineDifferentSizes(newLeft, n1.key, f(n1.val, s.val, n1.key), newRight);
      }
    } else {
      return glueDifferentSizes(newLeft, newRight);
    }
  }

  return loop(root1, root2);
}

export function difference<K, V1, V2>(
  cfg: ComparisionConfig<K>,
  root1: TreeNode<K, V1> | null,
  root2: TreeNode<K, V2> | null
): TreeNode<K, V1> | null {
  function loop(n1: TreeNode<K, V1> | null, n2: TreeNode<K, V2> | null): TreeNode<K, V1> | null {
    if (!n1) return null;
    if (!n2) return n1;

    const s = split(cfg, n1.key, n2);
    const newLeft = loop(n1.left, s.below);
    const newRight = loop(n1.right, s.above);

    if (s.val !== undefined) {
      // remove node
      return glueDifferentSizes(newLeft, newRight);
    } else {
      if (newLeft === n1.left && newRight === n1.right) {
        return n1;
      } else {
        return combineDifferentSizes(newLeft, n1.key, n1.val, newRight);
      }
    }
  }

  return loop(root1, root2);
}

export function adjust<K, V1, V2>(
  cfg: ComparisionConfig<K>,
  f: (v1: V1 | undefined, v2: V2, k: K) => V1 | undefined,
  root1: TreeNode<K, V1> | null,
  root2: TreeNode<K, V2> | null
): TreeNode<K, V1> | null {
  function fWithUndefined(v2: V2, k: K): V1 | undefined {
    return f(undefined, v2, k);
  }

  function loop(n1: TreeNode<K, V1> | null, n2: TreeNode<K, V2> | null): TreeNode<K, V1> | null {
    if (!n2) return n1;
    if (!n1) return collectValues(fWithUndefined, false, n2);

    const s = split(cfg, n1.key, n2);
    const newLeft = loop(n1.left, s.below);
    const newRight = loop(n1.right, s.above);

    if (s.val !== undefined) {
      const newVal = f(n1.val, s.val, n1.key);
      if (newVal === undefined) {
        // remove node
        return glueDifferentSizes(newLeft, newRight);
      } else if (newVal === n1.val && newLeft === n1.left && newRight === n1.right) {
        return n1;
      } else {
        return combineDifferentSizes(newLeft, n1.key, newVal, newRight);
      }
    } else {
      if (newLeft === n1.left && newRight === n1.right) {
        return n1;
      } else {
        return combineDifferentSizes(newLeft, n1.key, n1.val, newRight);
      }
    }
  }

  return loop(root1, root2);
}
