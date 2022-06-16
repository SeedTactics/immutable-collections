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

// For javascript optimization, ensure all nodes created share the same shape.
// This means that each time a node is created, the properties must be initialized
// in the same order: key, val, size, left, right.
// https://mathiasbynens.be/notes/shapes-ics
export interface TreeNode<K, V> {
  readonly key: K;
  readonly val: V;
  readonly size: number;
  readonly left: TreeNode<K, V> | undefined;
  readonly right: TreeNode<K, V> | undefined;
}

export interface MutableNode<K, V> {
  key: K;
  val: V;
  size: number;
  left: MutableNode<K, V> | undefined;
  right: MutableNode<K, V> | undefined;
}

const delta = 3;
const ratio = 2;

function balanceLeftUndefined<K, V>(k: K, v: V, right: TreeNode<K, V>): TreeNode<K, V> {
  const rl = right.left;
  const rr = right.right;
  if (rl === undefined) {
    if (rr === undefined) {
      return { key: k, val: v, size: 2, left: undefined, right };
    } else {
      return {
        key: right.key,
        val: right.val,
        size: 3,
        left: { key: k, val: v, size: 1, left: undefined, right: undefined },
        right: rr,
      };
    }
  }
  if (rr === undefined) {
    return {
      key: rl.key,
      val: rl.val,
      size: 3,
      left: { key: k, val: v, size: 1, left: undefined, right: undefined },
      right: { key: right.key, val: right.val, size: 1, left: undefined, right: undefined },
    };
  }

  if (rl.size < ratio * rr.size) {
    // single rotation, making right the root
    return {
      key: right.key,
      val: right.val,
      size: 1 + right.size,
      left: { key: k, val: v, size: 1 + rl.size, left: undefined, right: rl },
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
      left: undefined,
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
      return { key: k, val: v, size: 2, left, right: undefined };
    } else {
      return {
        key: lr.key,
        val: lr.val,
        size: 3,
        left: { key: left.key, val: left.val, size: 1, left: undefined, right: undefined },
        right: { key: k, val: v, size: 1, left: undefined, right: undefined },
      };
    }
  }

  if (lr === undefined) {
    return {
      key: left.key,
      val: left.val,
      size: 3,
      left: ll,
      right: { key: k, val: v, size: 1, left: undefined, right: undefined },
    };
  }

  if (lr.size < ratio * ll.size) {
    // single rotation, making left the root
    return {
      key: left.key,
      val: left.val,
      size: 1 + left.size,
      left: ll,
      right: { key: k, val: v, size: 1 + lr.size, left: lr, right: undefined },
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
      right: undefined,
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
  left: TreeNode<K, V> | undefined,
  k: K,
  v: V,
  right: TreeNode<K, V> | undefined
): TreeNode<K, V> {
  if (right === undefined) {
    if (left === undefined) {
      return { key: k, val: v, size: 1, left: undefined, right: undefined };
    }
    return balanceRightUndefined(k, v, left);
  }

  if (left === undefined) {
    return { key: k, val: v, size: 1 + right.size, left: undefined, right };
  }

  if (left.size > delta * right.size) {
    return rotateRight(k, v, left, right);
  }

  return { key: k, val: v, size: 1 + left.size + right.size, left, right };
}

// call this when the right subtree might have been inserted to or the left subtree might have been deleted from
export function combineAfterRightIncrease<K, V>(
  left: TreeNode<K, V> | undefined,
  k: K,
  v: V,
  right: TreeNode<K, V> | undefined
): TreeNode<K, V> {
  if (left === undefined) {
    if (right === undefined) {
      return { key: k, val: v, size: 1, left: undefined, right: undefined };
    }
    return balanceLeftUndefined(k, v, right);
  }

  if (right === undefined) {
    return { key: k, val: v, size: 1 + left.size, left, right: undefined };
  }

  if (right.size > delta * left.size) {
    return rotateLeft(k, v, left, right);
  }

  return { key: k, val: v, size: 1 + left.size + right.size, left, right };
}

// call when either left or right has changed size by at most one
export function combineAfterInsertOrRemove<K, V>(
  left: TreeNode<K, V> | undefined,
  k: K,
  v: V,
  right: TreeNode<K, V> | undefined
): TreeNode<K, V> {
  if (left === undefined) {
    if (right === undefined) {
      return { key: k, val: v, size: 1, left: undefined, right: undefined };
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
  if (root === undefined) return { key: k, val: v, size: 1, left: undefined, right: undefined };
  const newLeft = insertMin(k, v, root.left);
  return combineAfterLeftIncrease(newLeft, k, v, root.right);
}

function insertMax<K, V>(k: K, v: V, root: TreeNode<K, V> | undefined): TreeNode<K, V> {
  if (root === undefined) return { key: k, val: v, size: 1, left: undefined, right: undefined };
  const newRight = insertMax(k, v, root.right);
  return combineAfterRightIncrease(root.left, k, v, newRight);
}

// Combines two trees into one and restores balance, no matter the size difference between left and right
// Assumes each of left and right are individually balanced
export function combineDifferentSizes<K, V>(
  left: TreeNode<K, V> | undefined,
  k: K,
  v: V,
  right: TreeNode<K, V> | undefined
): TreeNode<K, V> {
  if (left === undefined) return insertMin(k, v, right);
  if (right === undefined) return insertMax(k, v, left);
  if (right.size > delta * left.size) {
    return combineAfterLeftIncrease(combineDifferentSizes(left, k, v, right.left), right.key, right.val, right.right);
  }
  if (left.size > delta * right.size) {
    return combineAfterRightIncrease(left.left, left.key, left.val, combineDifferentSizes(left.right, k, v, right));
  }
  return { key: k, val: v, size: 1 + left.size + right.size, left, right };
}

function removeMin<K, V>(node: TreeNode<K, V>): { k: K; v: V; rest: TreeNode<K, V> | undefined } {
  const left = node.left;
  if (left === undefined) {
    return { k: node.key, v: node.val, rest: node.right };
  } else {
    const ret = removeMin(left);
    ret.rest = combineAfterRightIncrease(ret.rest, node.key, node.val, node.right);
    return ret;
  }
}

function removeMax<K, V>(node: TreeNode<K, V>): { k: K; v: V; rest: TreeNode<K, V> | undefined } {
  const right = node.right;
  if (right === undefined) {
    return { k: node.key, v: node.val, rest: node.left };
  } else {
    const ret = removeMax(right);
    ret.rest = combineAfterLeftIncrease(node.left, node.key, node.val, ret.rest);
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
    return combineAfterRightIncrease(rest, k, v, right);
  } else {
    const { k, v, rest } = removeMin(right);
    return combineAfterLeftIncrease(left, k, v, rest);
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
    return combineAfterLeftIncrease(glueDifferentSizes(left, right.left), right.key, right.val, right.right);
  }
  if (left.size > delta * right.size) {
    return combineAfterRightIncrease(left.left, left.key, left.val, glueDifferentSizes(left.right, right));
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
