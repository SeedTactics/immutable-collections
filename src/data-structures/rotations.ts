/* Copyright John Lenz, BSD license, see LICENSE file for details */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

/*
This modules exports a variety of functions to combine two different trees into
a single tree and maintain the balance invariant.

All the functions assume that the individual trees being combined are balanced already;
the functions differ on the assumption of the relative sizes of the left vs right.

First, if you want to combine a left tree, a (key, val), and a right tree, use one of the following:

- combineAfterLeftIncrease: use if the left tree has only grown or the right tree has only gotten smaller.
- combineAfterRightIncrease: use if the right tree has only grown or the left tree has only gotten smaller.
- combineAfterInsertOrRemove: use if the sizes of the left or right subtrees has changed by at most 1.
- combineDifferentSizes: use if the sizes of the left and right subtrees differ by any amount.

Alternatively, if you just want to combine a left and right tree into a single tree, use one of the following:

- glueSizeBalanced: use if the size of the left and right are known to be balanced.
- glueDifferentSizes: use if the size of the left and right differ by any amount.
*/

/*
The algorithms here are copied pretty much directly from haskell's containers
library: https://github.com/haskell/containers/blob/master/containers/src/Data/Map/Internal.hs
*/

// For javascript optimization, ensure all nodes created share the same shape.
// This means that each time a node is created, the properties must be initialized
// in the same order: key, val, size, left, right.
// https://mathiasbynens.be/notes/shapes-ics
export interface TreeNode<K, V> {
  readonly key: K;
  readonly val: V;
  readonly size: number;
  readonly left: TreeNode<K, V> | null;
  readonly right: TreeNode<K, V> | null;
}

export interface MutableTreeNode<K, V> {
  key: K;
  val: V;
  size: number;
  left: MutableTreeNode<K, V> | null;
  right: MutableTreeNode<K, V> | null;
}

// the rotations maintain that the size of the left and right
// subtrees are within a delta multiple of each other.
const delta = 3;

// ratio is used to determine if a double or single rotation is used
const ratio = 2;

function balanceLeftUndefined<K, V>(k: K, v: V, right: TreeNode<K, V>): TreeNode<K, V> {
  const rl = right.left;
  const rr = right.right;
  if (rl === null) {
    if (rr === null) {
      return { key: k, val: v, size: 2, left: null, right };
    } else {
      return {
        key: right.key,
        val: right.val,
        size: 3,
        left: { key: k, val: v, size: 1, left: null, right: null },
        right: rr,
      };
    }
  }
  if (rr === null) {
    return {
      key: rl.key,
      val: rl.val,
      size: 3,
      left: { key: k, val: v, size: 1, left: null, right: null },
      right: { key: right.key, val: right.val, size: 1, left: null, right: null },
    };
  }

  if (rl.size < ratio * rr.size) {
    // single rotation, making right the root
    return {
      key: right.key,
      val: right.val,
      size: 1 + right.size,
      left: { key: k, val: v, size: 1 + rl.size, left: null, right: rl },
      right: rr,
    };
  }

  // double rotation, making rl the new root
  return {
    key: rl.key,
    val: rl.val,
    size: 1 + right.size,
    left: {
      key: k,
      val: v,
      size: 1 + (rl.left?.size ?? 0),
      left: null,
      right: rl.left,
    },
    right: {
      key: right.key,
      val: right.val,
      size: 1 + rr.size + (rl.right?.size ?? 0),
      left: rl.right,
      right: rr,
    },
  };
}

function balanceRightUndefined<K, V>(k: K, v: V, left: TreeNode<K, V>): TreeNode<K, V> {
  const ll = left.left;
  const lr = left.right;
  if (ll === null) {
    if (lr === null) {
      return { key: k, val: v, size: 2, left, right: null };
    } else {
      return {
        key: lr.key,
        val: lr.val,
        size: 3,
        left: { key: left.key, val: left.val, size: 1, left: null, right: null },
        right: { key: k, val: v, size: 1, left: null, right: null },
      };
    }
  }

  if (lr === null) {
    return {
      key: left.key,
      val: left.val,
      size: 3,
      left: ll,
      right: { key: k, val: v, size: 1, left: null, right: null },
    };
  }

  if (lr.size < ratio * ll.size) {
    // single rotation, making left the root
    return {
      key: left.key,
      val: left.val,
      size: 1 + left.size,
      left: ll,
      right: { key: k, val: v, size: 1 + lr.size, left: lr, right: null },
    };
  }

  // double rotation, making lr the new root
  return {
    key: lr.key,
    val: lr.val,
    size: 1 + left.size,
    left: {
      key: left.key,
      val: left.val,
      size: 1 + ll.size + (lr.left?.size ?? 0),
      left: ll,
      right: lr.left,
    },
    right: {
      key: k,
      val: v,
      size: 1 + (lr.right?.size ?? 0),
      left: lr.right,
      right: null,
    },
  };
}

function rotateLeft<K, V>(k: K, v: V, left: TreeNode<K, V>, right: TreeNode<K, V>): TreeNode<K, V> {
  const rl = right.left!;
  const rr = right.right!;
  if (rl.size < ratio * rr.size) {
    // single rotation
    return {
      key: right.key,
      val: right.val,
      size: 1 + left.size + right.size,
      left: {
        key: k,
        val: v,
        size: 1 + left.size + rl.size,
        left: left,
        right: rl,
      },
      right: rr,
    };
  }

  // double rotation
  return {
    key: rl.key,
    val: rl.val,
    size: 1 + left.size + right.size,
    left: {
      key: k,
      val: v,
      size: 1 + left.size + (rl.left?.size ?? 0),
      left: left,
      right: rl.left,
    },
    right: {
      key: right.key,
      val: right.val,
      size: 1 + rr.size + (rl.right?.size ?? 0),
      left: rl.right,
      right: rr,
    },
  };
}

function rotateRight<K, V>(k: K, v: V, left: TreeNode<K, V>, right: TreeNode<K, V>): TreeNode<K, V> {
  const ll = left.left!;
  const lr = left.right!;
  if (lr.size < ratio * ll.size) {
    // single rotation
    return {
      key: left.key,
      val: left.val,
      size: 1 + left.size + right.size,
      left: ll,
      right: {
        key: k,
        val: v,
        size: 1 + right.size + lr.size,
        left: lr,
        right: right,
      },
    };
  }

  //double rotation
  return {
    key: lr.key,
    val: lr.val,
    size: 1 + left.size + right.size,
    left: {
      key: left.key,
      val: left.val,
      size: 1 + ll.size + (lr.left?.size ?? 0),
      left: ll,
      right: lr.left,
    },
    right: {
      key: k,
      val: v,
      size: 1 + right.size + (lr.right?.size ?? 0),
      left: lr.right,
      right: right,
    },
  };
}

// call this when the left subtree might have been inserted to or the right subtree might have been deleted from, but not both
function combineAfterLeftIncrease<K, V>(
  left: TreeNode<K, V> | null,
  k: K,
  v: V,
  right: TreeNode<K, V> | null
): TreeNode<K, V> {
  if (right === null) {
    if (left === null) {
      return { key: k, val: v, size: 1, left: null, right: null };
    }
    return balanceRightUndefined(k, v, left);
  }

  // We know right is not null because it was checked above.
  // Left cannot be null here
  // There are two cases:
  //   - If the left tree increased in size, it of course is not null
  //   - If the right tree decreased in size, we know it is not null so it must have started
  //     with at least 2 elements before the change.  But then left = null would have
  //     been an inbalanced tree since the right had 2 elements before the change.
  const l = left!;

  if (l.size > delta * right.size) {
    return rotateRight(k, v, l, right);
  }

  return { key: k, val: v, size: 1 + l.size + right.size, left, right };
}

// call this when the right subtree might have been inserted to or the left subtree might have been deleted from, but not both
function combineAfterRightIncrease<K, V>(
  left: TreeNode<K, V> | null,
  k: K,
  v: V,
  right: TreeNode<K, V> | null
): TreeNode<K, V> {
  if (left === null) {
    if (right === null) {
      return { key: k, val: v, size: 1, left: null, right: null };
    }
    return balanceLeftUndefined(k, v, right);
  }

  // We know left is not null because it was checked above.
  // Right cannot be null here
  // There are two cases:
  //   - If the right tree increased in size, it of course is not null
  //   - If the left tree decreased in size, we know it is not null so it must have started
  //     with at least 2 elements before the change.  But then right = null would have
  //     been an inbalanced tree since the left had 2 elements before the change.
  const r = right!;

  if (r.size > delta * left.size) {
    return rotateLeft(k, v, left, r);
  }

  return { key: k, val: v, size: 1 + left.size + r.size, left, right };
}

// call when either left or right has changed size by at most one
export function combineAfterInsertOrRemove<K, V>(
  left: TreeNode<K, V> | null,
  k: K,
  v: V,
  right: TreeNode<K, V> | null
): TreeNode<K, V> {
  if (left === null) {
    if (right === null) {
      return { key: k, val: v, size: 1, left: null, right: null };
    }
    return balanceLeftUndefined(k, v, right);
  }
  if (right === null) {
    return balanceRightUndefined(k, v, left);
  }

  if (right.size > delta * left.size) {
    return rotateLeft(k, v, left, right);
  }
  if (left.size > delta * right.size) {
    return rotateRight(k, v, left, right);
  }

  return { key: k, val: v, size: 1 + left.size + right.size, left, right };
}

function insertMin<K, V>(k: K, v: V, root: TreeNode<K, V> | null): TreeNode<K, V> {
  if (root === null) return { key: k, val: v, size: 1, left: null, right: null };
  const newLeft = insertMin(k, v, root.left);
  return combineAfterLeftIncrease(newLeft, root.key, root.val, root.right);
}

function insertMax<K, V>(k: K, v: V, root: TreeNode<K, V> | null): TreeNode<K, V> {
  if (root === null) return { key: k, val: v, size: 1, left: null, right: null };
  const newRight = insertMax(k, v, root.right);
  return combineAfterRightIncrease(root.left, root.key, root.val, newRight);
}

// Combines two trees into one and restores balance, no matter the size difference between left and right
// Assumes each of left and right are individually balanced
export function combineDifferentSizes<K, V>(
  left: TreeNode<K, V> | null,
  k: K,
  v: V,
  right: TreeNode<K, V> | null
): TreeNode<K, V> {
  if (left === null) return insertMin(k, v, right);
  if (right === null) return insertMax(k, v, left);
  if (right.size > delta * left.size) {
    return combineAfterLeftIncrease(combineDifferentSizes(left, k, v, right.left), right.key, right.val, right.right);
  }
  if (left.size > delta * right.size) {
    return combineAfterRightIncrease(left.left, left.key, left.val, combineDifferentSizes(left.right, k, v, right));
  }
  return { key: k, val: v, size: 1 + left.size + right.size, left, right };
}

export function removeMin<K, V>(node: TreeNode<K, V>): { k: K; v: V; rest: TreeNode<K, V> | null } {
  const left = node.left;
  if (left === null) {
    return { k: node.key, v: node.val, rest: node.right };
  } else {
    const ret = removeMin(left);
    ret.rest = combineAfterRightIncrease(ret.rest, node.key, node.val, node.right);
    return ret;
  }
}

export function removeMax<K, V>(node: TreeNode<K, V>): { k: K; v: V; rest: TreeNode<K, V> | null } {
  const right = node.right;
  if (right === null) {
    return { k: node.key, v: node.val, rest: node.left };
  } else {
    const ret = removeMax(right);
    ret.rest = combineAfterLeftIncrease(node.left, node.key, node.val, ret.rest);
    return ret;
  }
}

// combines two trees that are individually balanced and also the size is balanced between left and right
export function glueSizeBalanced<K, V>(
  left: TreeNode<K, V> | null,
  right: TreeNode<K, V> | null
): TreeNode<K, V> | null {
  if (left === null) return right;
  if (right === null) return left;
  if (left.size > right.size) {
    const { k, v, rest } = removeMax(left);
    return combineAfterRightIncrease(rest, k, v, right);
  } else {
    const { k, v, rest } = removeMin(right);
    return combineAfterLeftIncrease(left, k, v, rest);
  }
}

// combines two trees that are individually balanced but the size of left compared to right might be unbalanced
export function glueDifferentSizes<K, V>(
  left: TreeNode<K, V> | null,
  right: TreeNode<K, V> | null
): TreeNode<K, V> | null {
  if (left === null) return right;
  if (right === null) return left;
  if (right.size > delta * left.size) {
    return combineAfterLeftIncrease(glueDifferentSizes(left, right.left), right.key, right.val, right.right);
  }
  if (left.size > delta * right.size) {
    return combineAfterRightIncrease(left.left, left.key, left.val, glueDifferentSizes(left.right, right));
  }
  return glueSizeBalanced(left, right);
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

function mutateRotateLeft<K, V>(node: MutableTreeNode<K, V>): MutableTreeNode<K, V> {
  // right will become the new root
  const right = node.right!;
  const oldRightSize = right.size;
  right.size = node.size;

  // node is the new left child of right (the new root)
  node.right = right.left;
  node.size = node.size - oldRightSize + (node.right?.size ?? 0);

  right.left = node;

  return right;
}

function mutateRotateRight<K, V>(node: MutableTreeNode<K, V>): MutableTreeNode<K, V> {
  // left will become the new root
  const left = node.left!;
  const oldLeftSize = left.size;
  left.size = node.size;

  // node is the new right child of root
  node.left = left.right;
  node.size = node.size - oldLeftSize + (node.left?.size ?? 0);

  left.right = node;

  return left;
}

export function mutateBalanceAfterLeftIncrease<K, V>(node: MutableTreeNode<K, V>): MutableTreeNode<K, V> {
  const leftSize = node.left?.size ?? 0;
  const rightSize = node.right?.size ?? 0;

  if (leftSize > delta * rightSize && leftSize + rightSize > 1) {
    const llSize = node.left!.left?.size ?? 0;
    const lrSize = node.left!.right?.size ?? 0;
    if (lrSize < ratio * llSize) {
      return mutateRotateRight(node);
    } else {
      // double rotation
      node.left = mutateRotateLeft(node.left!);
      return mutateRotateRight(node);
    }
  }

  return node;
}

export function mutateBalanceAfterRightIncrease<K, V>(node: MutableTreeNode<K, V>): MutableTreeNode<K, V> {
  const leftSize = node.left?.size ?? 0;
  const rightSize = node.right?.size ?? 0;

  if (rightSize > delta * leftSize && leftSize + rightSize > 1) {
    const rlSize = node.right!.left?.size ?? 0;
    const rrSize = node.right!.right?.size ?? 0;
    if (rlSize < ratio * rrSize) {
      return mutateRotateLeft(node);
    } else {
      // double rotation
      node.right = mutateRotateRight(node.right!);
      return mutateRotateLeft(node);
    }
  }

  return node;
}
