/* eslint-disable @typescript-eslint/no-non-null-assertion */

/*
This modules exports a variety of functions to combine two different trees into
a single tree and maintain the balance invariant.

All the functions assume that the individual trees being combined are balanced already;
the functions differ on the assumption of the relative sizes of the left vs right.

First, if you want to combine a left tree, a (key, val), and a right tree, use one of the following:

- combineAfterLeftIncrease: use if the left tree has only grown and/or the right tree has only gotten smaller.
- combineAfterRightIncrease: use if the right tree has only grown and/or the left tree has only gotten smaller.
- combineAfterInsertOrRemove: use if the sizes of the left or right subtrees has changed by at most 1.
- combineDifferentSizes: use if the sizes of the left and right subtrees differ by any amount.

Alternatively, if you just want to combine a left and right tree into a single tree, use one of the following:

- glueSizeBalanced: use if the size of the left and right are known to be balanced.
- glueDifferentSizes: use if the size of the left and right differ by any amount.
*/

export interface TreeNode<K, V> {
  readonly size: number;
  readonly key: K;
  readonly val: V;
  readonly left?: TreeNode<K, V>;
  readonly right?: TreeNode<K, V>;
}

export interface MutableNode {
  size: number;
  left?: MutableNode;
  right?: MutableNode;
}

const delta = 3;
const ratio = 2;

function balanceLeftUndefined<K, V>(k: K, v: V, right: TreeNode<K, V>): TreeNode<K, V> {
  const rl = right.left;
  const rr = right.right;
  if (rl === undefined) {
    if (rr === undefined) {
      return { key: k, val: v, size: 2, right };
    } else {
      return { key: right.key, val: right.val, size: 3, left: { key: k, val: v, size: 1 }, right: rr };
    }
  }
  if (rr === undefined) {
    return {
      key: rl.key,
      val: rl.val,
      size: 3,
      left: { key: k, val: v, size: 1 },
      right: { key: right.key, val: right.val, size: 1 },
    };
  }

  if (rl.size < ratio * rr.size) {
    // single rotation, making right the root
    return {
      key: right.key,
      val: right.val,
      size: 1 + right.size,
      left: { key: k, val: v, size: 1 + rl.size, right: rl },
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
  if (ll === undefined) {
    if (lr === undefined) {
      return { key: k, val: v, size: 2, left };
    } else {
      return {
        key: lr.key,
        val: lr.val,
        size: 3,
        left: { key: left.key, val: left.val, size: 1 },
        right: { key: k, val: v, size: 1 },
      };
    }
  }

  if (lr === undefined) {
    return {
      key: left.key,
      val: left.val,
      size: 3,
      left: ll,
      right: { key: k, val: v, size: 1 },
    };
  }

  if (lr.size < ratio * ll.size) {
    // single rotation, making left the root
    return {
      key: left.key,
      val: left.val,
      size: 1 + left.size,
      left: ll,
      right: { key: k, val: v, size: 1 + lr.size, left: lr },
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

// call ths when the left subtree might have been inserted to or the right subtree might have been deleted from
export function combineAfterLeftIncrease<K, V>(
  k: K,
  v: V,
  left: TreeNode<K, V> | undefined,
  right: TreeNode<K, V> | undefined
) {
  if (right === undefined) {
    if (left === undefined) {
      return { key: k, val: v, size: 1 };
    }
    return balanceRightUndefined(k, v, left);
  }

  if (left === undefined) {
    return { size: 1 + right.size, key: k, val: v, right };
  }

  if (left.size > delta * right.size) {
    rotateRight(k, v, left, right);
  }

  return { key: k, val: v, size: 1 + left.size + right.size, left, right };
}

// call this when the right subtree might have been inserted to or the left subtree might have been deleted from
export function combineAfterRightIncrease<K, V>(
  k: K,
  v: V,
  left: TreeNode<K, V> | undefined,
  right: TreeNode<K, V> | undefined
) {
  if (left === undefined) {
    if (right === undefined) {
      return { key: k, val: v, size: 1 };
    }
    return balanceLeftUndefined(k, v, right);
  }

  if (right === undefined) {
    return { size: 1 + left.size, key: k, val: v, left };
  }

  if (right.size > delta * left.size) {
    rotateLeft(k, v, left, right);
  }

  return { key: k, val: v, size: 1 + left.size + right.size, left, right };
}

// call when either left or right has changed size by at most one
export function combineAfterInsertOrRemove<K, V>(
  k: K,
  v: V,
  left: TreeNode<K, V> | undefined,
  right: TreeNode<K, V> | undefined
): TreeNode<K, V> {
  if (left === undefined) {
    if (right === undefined) {
      return { key: k, val: v, size: 1 };
    }
    return balanceLeftUndefined(k, v, right);
  }
  if (right === undefined) {
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

function insertMin<K, V>(k: K, v: V, root: TreeNode<K, V> | undefined): TreeNode<K, V> {
  if (root === undefined) return { key: k, val: v, size: 1 };
  const newLeft = insertMin(k, v, root.left);
  return combineAfterLeftIncrease(k, v, newLeft, root.right);
}

function insertMax<K, V>(k: K, v: V, root: TreeNode<K, V> | undefined): TreeNode<K, V> {
  if (root === undefined) return { key: k, val: v, size: 1 };
  const newRight = insertMax(k, v, root.right);
  return combineAfterRightIncrease(k, v, root.left, newRight);
}

// Combines two trees into one and restores balance, no matter the size difference between left and right
// Assumes each of left and right are individually balanced
export function combineDifferentSizes<K, V>(
  k: K,
  v: V,
  left: TreeNode<K, V> | undefined,
  right: TreeNode<K, V> | undefined
): TreeNode<K, V> {
  if (left === undefined) return insertMin(k, v, right);
  if (right === undefined) return insertMax(k, v, left);
  if (right.size > delta * left.size) {
    return combineAfterLeftIncrease(right.key, right.val, combineDifferentSizes(k, v, left, right.left), right.right);
  }
  if (left.size > delta * right.size) {
    return combineAfterRightIncrease(left.key, left.val, left.left, combineDifferentSizes(k, v, left.right, right));
  }
  return { key: k, val: v, size: 1 + left.size + right.size, left, right };
}

function removeMin<K, V>(node: TreeNode<K, V>): { k: K; v: V; rest: TreeNode<K, V> | undefined } {
  const left = node.left;
  if (left === undefined) {
    return { k: node.key, v: node.val, rest: node.right };
  } else {
    const ret = removeMin(left);
    ret.rest = combineAfterRightIncrease(node.key, node.val, ret.rest, node.right);
    return ret;
  }
}

function removeMax<K, V>(node: TreeNode<K, V>): { k: K; v: V; rest: TreeNode<K, V> | undefined } {
  const right = node.right;
  if (right === undefined) {
    return { k: node.key, v: node.val, rest: node.left };
  } else {
    const ret = removeMax(right);
    ret.rest = combineAfterLeftIncrease(node.key, node.val, node.left, ret.rest);
    return ret;
  }
}

// combines two trees that are individually balanced and also the size is balanced between left and right
export function glueSizeBalanced<K, V>(
  left: TreeNode<K, V> | undefined,
  right: TreeNode<K, V> | undefined
): TreeNode<K, V> | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  if (left.size > right.size) {
    const { k, v, rest } = removeMax(left);
    return combineAfterRightIncrease(k, v, rest, right);
  } else {
    const { k, v, rest } = removeMin(right);
    return combineAfterLeftIncrease(k, v, left, rest);
  }
}

// combines two trees that are individually balanced but the size of left compared to right might be unbalanced
export function glueDifferentSizes<K, V>(
  left: TreeNode<K, V> | undefined,
  right: TreeNode<K, V> | undefined
): TreeNode<K, V> | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  if (right.size > delta * left.size) {
    return combineAfterLeftIncrease(right.key, right.val, glueDifferentSizes(left, right.left), right.right);
  }
  if (left.size > delta * right.size) {
    return combineAfterRightIncrease(left.key, left.val, left.left, glueDifferentSizes(left.right, right));
  }
  return glueSizeBalanced(left, right);
}

/*
function mutateSingleL(node: MutableNode): MutableNode {
  // right will become the new root
  const right = node.right!;
  const oldRightSize = right.size;
  right.size = node.size;

  // node is the new left child of root
  node.right = right.left;
  node.size = node.size - oldRightSize + (node.right?.size ?? 0);

  right.left = node;

  return right;
}

function mutateSingleR(node: MutableNode): MutableNode {
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

*/
