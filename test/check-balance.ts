import { TreeNode } from "../src/rotations.js";
import { expect } from "chai";
import { ComparisionConfig } from "../src/comparison.js";

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

  return loop(root, undefined, undefined);
}
