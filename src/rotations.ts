/* eslint-disable @typescript-eslint/no-non-null-assertion */

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

// call when either left or right has changed size
export function balance<K, V>(
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

// call ths when the left subtree might have been inserted to or the right subtree might have been deleted from
export function balanceL<K, V>(k: K, v: V, left: TreeNode<K, V> | undefined, right: TreeNode<K, V> | undefined) {
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

// call ths when the right subtree might have been inserted to or the left subtree might have been deleted from
export function balanceR<K, V>(k: K, v: V, left: TreeNode<K, V> | undefined, right: TreeNode<K, V> | undefined) {
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
