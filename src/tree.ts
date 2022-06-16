import { ComparisionConfig } from "./comparison.js";
import {
  combineAfterLeftIncrease,
  combineAfterRightIncrease,
  combineDifferentSizes,
  glueDifferentSizes,
  glueSizeBalanced,
  TreeNode,
} from "./rotations.js";

export function lookup<K, V>({ compare }: ComparisionConfig<K>, k: K, root: TreeNode<K, V> | undefined): V | undefined {
  let node = root;
  while (node !== undefined) {
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

export function insert<K, V>(
  { compare }: ComparisionConfig<K>,
  k: K,
  getVal: (v: V | undefined) => V,
  root: TreeNode<K, V> | undefined
): TreeNode<K, V> {
  function loop(node: TreeNode<K, V> | undefined): TreeNode<K, V> {
    if (node === undefined) return { key: k, val: getVal(undefined), size: 1, left: undefined, right: undefined };
    const c = compare(k, node.key);
    if (c === 0) {
      const newVal = getVal(node.val);
      if (newVal === node.val) {
        return node;
      } else {
        return { key: k, val: newVal, size: node.size, left: node.left, right: node.right };
      }
    } else if (c < 0) {
      const newLeft = loop(node.left);
      if (newLeft === node.left) {
        return node;
      } else {
        return combineAfterLeftIncrease(node.key, node.val, newLeft, node.right);
      }
    } else {
      const newRight = loop(node.right);
      if (newRight === node.right) {
        return node;
      } else {
        return combineAfterRightIncrease(node.key, node.val, node.left, newRight);
      }
    }
  }

  return loop(root);
}

export function remove<K, V>(
  { compare }: ComparisionConfig<K>,
  k: K,
  root: TreeNode<K, V> | undefined
): TreeNode<K, V> | undefined {
  function loop(node: TreeNode<K, V> | undefined): TreeNode<K, V> | undefined {
    if (node === undefined) return undefined;
    const c = compare(k, node.key);
    if (c === 0) {
      return glueSizeBalanced(node.left, node.right);
    } else if (c < 0) {
      const newLeft = loop(node.left);
      if (newLeft === node.left) {
        return node;
      } else {
        return combineAfterRightIncrease(node.key, node.val, newLeft, node.right);
      }
    } else {
      const newRight = loop(node.right);
      if (newRight === node.right) {
        return node;
      } else {
        return combineAfterRightIncrease(node.key, node.val, node.left, newRight);
      }
    }
  }

  return loop(root);
}

export function* iterateAsc<K, V, T>(root: TreeNode<K, V> | undefined, f: (k: K, v: V) => T): IterableIterator<T> {
  const nodes: Array<TreeNode<K, V>> = [];
  let node: TreeNode<K, V> | undefined = root;
  while (node !== undefined || nodes.length > 0) {
    if (node !== undefined) {
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

export function* iterateDesc<K, V, T>(root: TreeNode<K, V> | undefined, f: (k: K, v: V) => T): IterableIterator<T> {
  const nodes: Array<TreeNode<K, V>> = [];
  let node: TreeNode<K, V> | undefined = root;
  while (node !== undefined || nodes.length > 0) {
    if (node !== undefined) {
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

export function foldl<K, V, T>(f: (acc: T, k: K, v: V) => T, zero: T, root: TreeNode<K, V> | undefined): T {
  const nodes: Array<TreeNode<K, V>> = [];
  let node: TreeNode<K, V> | undefined = root;
  let acc = zero;
  while (node !== undefined || nodes.length > 0) {
    if (node !== undefined) {
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

export function foldr<K, V, T>(f: (k: K, v: V, acc: T) => T, zero: T, root: TreeNode<K, V> | undefined): T {
  const nodes: Array<TreeNode<K, V>> = [];
  let node: TreeNode<K, V> | undefined = root;
  let acc = zero;
  while (node !== undefined || nodes.length > 0) {
    if (node !== undefined) {
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

export function mapValues<K, V>(f: (v: V, k: K) => V, root: TreeNode<K, V> | undefined) {
  function loop(n: TreeNode<K, V> | undefined): TreeNode<K, V> | undefined {
    if (!n) return undefined;
    const newLeft = loop(n.left);
    const newVal = f(n.val, n.key);
    const newRight = loop(n.right);
    if (newVal === n.val && newLeft === n.left && newRight === n.right) {
      return n;
    } else {
      return { key: n.key, val: newVal, size: n.size, left: newLeft, right: newRight };
    }
  }

  loop(root);
}

export function collectValues<K, V>(
  f: (v: V, k: K) => V | undefined,
  filterNull: boolean,
  root: TreeNode<K, V> | undefined
): TreeNode<K, V> | undefined {
  function loop(n: TreeNode<K, V> | undefined): TreeNode<K, V> | undefined {
    if (!n) return undefined;
    const newLeft = loop(n.left);
    const newVal = f(n.val, n.key);
    const newRight = loop(n.right);
    if (newVal === undefined || (filterNull && newVal === null)) {
      return glueDifferentSizes(newLeft, newRight);
    } else if (newVal === n.val && newLeft === n.left && newRight === n.right) {
      return n;
    } else {
      return combineDifferentSizes(n.key, newVal, newLeft, newRight);
    }
  }

  return loop(root);
}
