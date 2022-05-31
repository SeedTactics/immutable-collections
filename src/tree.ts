import { ComparisionConfig } from "./comparison.js";
import { balanceL, balanceR, TreeNode } from "./rotations.js";

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
    if (node === undefined) return { key: k, val: getVal(undefined), size: 1 };
    const c = compare(k, node.key);
    if (c === 0) {
      const newVal = getVal(node.val);
      if (newVal === node.val) {
        return node;
      } else {
        return { ...node, val: newVal };
      }
    } else if (c < 0) {
      const newLeft = loop(node.left);
      if (newLeft === node.left) {
        return node;
      } else {
        return balanceL(node.key, node.val, newLeft, node.right);
      }
    } else {
      const newRight = loop(node.right);
      if (newRight === node.right) {
        return node;
      } else {
        return balanceR(node.key, node.val, node.left, newRight);
      }
    }
  }

  return loop(root);
}

export function removeMin<K, V>(node: TreeNode<K, V>): { k: K; v: V; rest: TreeNode<K, V> | undefined } {
  const left = node.left;
  if (left === undefined) {
    return { k: node.key, v: node.val, rest: node.right };
  } else {
    const ret = removeMin(left);
    ret.rest = balanceR(node.key, node.val, ret.rest, node.right);
    return ret;
  }
}

export function removeMax<K, V>(node: TreeNode<K, V>): { k: K; v: V; rest: TreeNode<K, V> | undefined } {
  const right = node.right;
  if (right === undefined) {
    return { k: node.key, v: node.val, rest: node.left };
  } else {
    const ret = removeMax(right);
    ret.rest = balanceL(node.key, node.val, node.left, ret.rest);
    return ret;
  }
}

function glue<K, V>(left: TreeNode<K, V> | undefined, right: TreeNode<K, V> | undefined): TreeNode<K, V> | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  if (left.size > right.size) {
    const { k, v, rest } = removeMax(left);
    return balanceR(k, v, rest, right);
  } else {
    const { k, v, rest } = removeMin(right);
    return balanceL(k, v, left, rest);
  }
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
      return glue(node.left, node.right);
    } else if (c < 0) {
      const newLeft = loop(node.left);
      if (newLeft === node.left) {
        return node;
      } else {
        return balanceR(node.key, node.val, newLeft, node.right);
      }
    } else {
      const newRight = loop(node.right);
      if (newRight === node.right) {
        return node;
      } else {
        return balanceR(node.key, node.val, node.left, newRight);
      }
    }
  }

  return loop(root);
}
