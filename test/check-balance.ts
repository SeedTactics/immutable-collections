/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { TreeNode } from "../src/rotations.js";
import { expect } from "chai";
import { ComparisionConfig, OrderedMapKey } from "../src/comparison.js";
import { OrderedMap } from "../src/orderedmap.js";

export function checkMapBalanceAndSize<K extends OrderedMapKey, V>(map: OrderedMap<K, V>) {
  // access private properties
  const privateMap = map as unknown as { root: TreeNode<K, V> | undefined; cfg: ComparisionConfig<K> };
  if (privateMap.root) {
    return checkBalanceAndSize(privateMap.cfg, privateMap.root);
  }
}

export function checkBalanceAndSize<K, V>({ compare }: ComparisionConfig<K>, root: TreeNode<K, V>) {
  function loop(node: TreeNode<K, V>, min: K | undefined, max: K | undefined) {
    if (min !== undefined) {
      expect(compare(node.key, min)).to.be.greaterThan(0);
    }
    if (max !== undefined) {
      expect(compare(node.key, max)).to.be.lessThan(0);
    }

    let leftSize, rightSize: number;
    if (node.left) {
      loop(node.left, min, node.key);
      leftSize = node.left.size;
    } else {
      leftSize = 0;
    }
    if (node.right) {
      loop(node.right, node.key, max);
      rightSize = node.right.size;
    } else {
      rightSize = 0;
    }

    expect(node.size).to.equal(leftSize + rightSize + 1);

    if (leftSize + rightSize > 1) {
      expect(leftSize).to.be.lessThanOrEqual(3 * rightSize);
      expect(rightSize).to.be.lessThanOrEqual(3 * leftSize);
    }
  }

  loop(root, undefined, undefined);
}
