/* Copyright John Lenz, BSD license, see LICENSE file for details */

/** Size-Balanced Binary Tree
 *
 * @remarks
 * This module contains the implementation of a size-balanced binary tree,
 * which is the backing data structure for the {@link ../api/orderedmap#OrderedMap} and {@link ../api/orderedmap#OrderedSet} classes.
 *
 * The OrderedMap and OrderedSet classes are easier to use, but the downside is current bundlers such as
 * webpack, esbuild, swc, etc. do not tree-shake classes.  Thus, this module exposes the tree as
 * a collection of functions so that if you wish you can use this directly and get the benefit of tree-shaking.
 * There is no additional functionality available in this module, so if you are already using the OrderedMap or
 * OrderedSet classes, there is no reason to use this module.
 *
 * To use, import the functions from the tree module:
 *
 * ```ts
 * import * as tree from "@seedtactics/immutable-collections/tree";
 * ```
 */

import { ComparisonConfig } from "./comparison.js";
import {
  combineAfterInsertOrRemove,
  combineDifferentSizes,
  glueDifferentSizes,
  glueSizeBalanced,
  insertMin,
  MutableTreeNode,
  mutateBalanceAfterLeftIncrease,
  mutateBalanceAfterRightIncrease,
  removeMax,
  removeMin,
  TreeNode,
} from "./rotations.js";
export { TreeNode, MutableTreeNode } from "./rotations.js";

export {
  ComparisonConfig,
  mkComparisonConfig,
  ComparableObj,
  mkCompareByProperties,
} from "./comparison.js";

/*
Implementation of a size-balanced binary tree.

The algorithms here are copied pretty much directly from haskell's containers
library: https://github.com/haskell/containers/blob/master/containers/src/Data/Map/Internal.hs
*/

/** Lookup a key in the tree
 *
 * @category Lookup
 */
export function lookup<K, V>(
  { compare }: ComparisonConfig<K>,
  k: K,
  root: TreeNode<K, V> | null,
): V | undefined {
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

/** Find the minimum key in the tree and return the key and value.
 *
 * @category Lookup
 */
export function lookupMin<K, V>(root: TreeNode<K, V>): readonly [K, V] {
  let node = root;
  while (true) {
    const left = node.left;
    if (left) {
      node = left;
    } else {
      return [node.key, node.val];
    }
  }
}

/** Find the maximum key in the tree and return the key and value.
 *
 * @category Lookup
 */
export function lookupMax<K, V>(root: TreeNode<K, V>): readonly [K, V] {
  let node = root;
  while (true) {
    const right = node.right;
    if (right) {
      node = right;
    } else {
      return [node.key, node.val];
    }
  }
}

/* Benchmarking a variety of implementation strategies (see  commit 785942937019aa44527605bb4231d68f2692ec56)
   showed that a recursive function was faster than a loop+stack, and that dedicated insert/remove
   functions had roughly the same performance as the generalized alter function.
*/

/** Insert, update or delete an entry in the tree
 *
 * @remarks
 * Benchmarking showed that dedicated insert and remove functions were the same speed as a generalized
 * alter function, so we only implement alter (which helps bundle size as well).
 *
 * `alter` first looks for the key in the tree.  The function `f` is then applied to the existing value
 * if the key was found and `undefined` if the key does not exist.  If the function `f`
 * returns `undefined`, the entry is deleted and if `f` returns a value, the entry is updated
 * to use the new value.
 *
 * If the key is not found and `f` returns undefined or the key exists and the function `f` returns
 * a value `===` to the existing value, then the tree object instance is returned unchanged.
 *
 * Runs in time O(log n)
 *
 * @category Modification
 */
export function alter<K, V>(
  { compare }: ComparisonConfig<K>,
  k: K,
  f: (oldV: V | undefined) => V | undefined,
  root: TreeNode<K, V> | null,
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
        return {
          key: k,
          val: newVal,
          size: node.size,
          left: node.left,
          right: node.right,
        };
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

/** Insert mutably a key and value into a mutable tree
 *
 * @remarks
 * This function is designed to only be used during the initial construction of
 * a tree from a network request or other data structure.
 * {@link from} and {@link build} internally use `mutateInsert` and are easier to use,
 * this is exported for advanced use.
 *
 * An empty tree is represented as null and the tree will be mutated as values
 * are inserted.  The return value is the new root and the old root should not be referenced
 * again.  Once the tree is built, the type can be converted from {@link MutableTreeNode} to {@link TreeNode}.
 * Typically this should happen in a single function whose return value is {@link TreeNode}.
 *
 * @category Initial Construction
 */
export function mutateInsert<K, V, T>(
  { compare }: ComparisonConfig<K>,
  k: K,
  t: T,
  getVal: (old: V | undefined, t: T) => V,
  root: MutableTreeNode<K, V> | null,
): MutableTreeNode<K, V> {
  let newLeaf = true;
  function insertLoop(node: MutableTreeNode<K, V> | null): MutableTreeNode<K, V> {
    if (node === null)
      return { key: k, val: getVal(undefined, t), size: 1, left: null, right: null };
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

/** Efficiently create a tree from a sequence of key-value pairs
 *
 * @category Initial Construction
 *
 * @remarks
 * `from` efficiently creates a tree from a sequence of key-value pairs.  An optional `merge` function
 * can be provided.  When `from` detects a duplicate key, the merge function is called to determine
 * the value associated to the key.  The first parameter `v1` to the merge function is the existing value
 * and the second parameter `v2` is the new value just recieved from the sequence. The return value from the
 * merge function is the value associated to the key.  If no merge function is provided, the second value `v2`
 * is used, overwriting the first value `v1`.
 */
export function from<K, V>(
  { compare }: ComparisonConfig<K>,
  items: Iterable<readonly [K, V]>,
  merge?: (v1: V, v2: V) => V,
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

/** Efficently create a new tree
 *
 * @category Initial Construction
 *
 * @remarks
 * `build` efficiently creates a tree from a sequence of values and a key extraction function.  If a
 * duplicate key is found, the later value is used and the earlier value is overwritten.  If this is
 * not desired, use the more generalized version of `build` which also provides a value extraction function.
 */
export function build<K, V>(
  { compare }: ComparisonConfig<K>,
  items: Iterable<V>,
  key: (t: V) => K,
): TreeNode<K, V> | null;

/** Efficently create a new tree
 *
 * @category Initial Construction
 *
 * @remarks
 * `build` efficiently creates a tree from a sequence of items, a key extraction function, and a value extraction
 * function.  The sequence of initial items can have any type `T`, and for each item the key is extracted.  If the key does not
 * yet exist, the `val` extraction function is called with `undefined` to retrieve the value associated to the key.
 * If the key already exists in the tree, the `val` extraction function is called with the `old` value to
 * merge the new item `t` into the existing value `old`.
 */
export function build<T, K, V>(
  { compare }: ComparisonConfig<K>,
  items: Iterable<T>,
  key: (t: T) => K,
  val: (old: V | undefined, t: T) => V,
): TreeNode<K, V> | null;

/** Efficently create a new tree
 *
 * @internal
 */
export function build<T, K, V>(
  { compare }: ComparisonConfig<K>,
  items: Iterable<T>,
  key: (t: T) => K,
  val?: (old: V | undefined, t: T) => V,
): TreeNode<K, V> | null {
  let k: K;
  let t: T;
  let root = null;
  let newLeaf = true;

  function insertLoop(node: MutableTreeNode<K, V> | null): MutableTreeNode<K, V> {
    if (node === null)
      return {
        key: k,
        val: val ? val(undefined, t) : (t as unknown as V),
        size: 1,
        left: null,
        right: null,
      };
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

/** Iterates the entries in ascending order
 *
 * @category Iteration
 *
 * @remarks This function produces an [iterator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#The_iterator_protocol)
 * that applies the function `f` to each key and value in ascending order of keys and yields the results.  This iterator can be used only once, you must
 * call `iterateAsc` again if you want to iterate the tree again.
 */
export function* iterateAsc<K, V, T>(
  f: (k: K, v: V) => T,
  root: TreeNode<K, V> | null,
): MapIterator<T> {
  const nodes: Array<TreeNode<K, V>> = [];
  let node: TreeNode<K, V> | null = root;
  while (node !== null || nodes.length > 0) {
    if (node !== null) {
      nodes.push(node);
      node = node.left;
    } else {
      node = nodes.pop()!;
      yield f(node.key, node.val);
      node = node.right;
    }
  }
}

/** Iterates the entries in descending order
 *
 * @category Iteration
 *
 * @remarks This function produces an [iterator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#The_iterator_protocol)
 * that applies the function `f` to each key and value in descending order of keys and yields the results.  This iterator can be used only once, you must
 * call `iterateDesc` again if you want to iterate the tree again.
 */
export function* iterateDesc<K, V, T>(
  f: (k: K, v: V) => T,
  root: TreeNode<K, V> | null,
): MapIterator<T> {
  const nodes: Array<TreeNode<K, V>> = [];
  let node: TreeNode<K, V> | null = root;
  while (node !== null || nodes.length > 0) {
    if (node !== null) {
      nodes.push(node);
      node = node.right;
    } else {
      node = nodes.pop()!;
      yield f(node.key, node.val);
      node = node.left;
    }
  }
}

/** Reduce all the entries in the tree to a single value
 *
 * @category Iteration
 *
 * @remarks
 * The letter-l in `foldl` stands for left.  Thinking of all the entries as an ascending list, `foldl` starts
 * combining entries from the left side.  Thus, the entry with the smallest key is combined with the zero value,
 * which is then combined with the next smallest key, and so on.
 */
export function foldl<K, V, T>(
  f: (acc: T, k: K, v: V) => T,
  zero: T,
  root: TreeNode<K, V> | null,
): T {
  const nodes: Array<TreeNode<K, V>> = [];
  let node: TreeNode<K, V> | null = root;
  let acc = zero;
  while (node !== null || nodes.length > 0) {
    if (node !== null) {
      nodes.push(node);
      node = node.left;
    } else {
      node = nodes.pop()!;
      acc = f(acc, node.key, node.val);
      node = node.right;
    }
  }

  return acc;
}

/** Reduce all the entries in the tree to a single value
 *
 * @category Iteration
 *
 * @remarks
 * The letter-r in `foldr` stands for right.  Thinking of all the entries as an ascending list, `foldr` starts
 * combining entries from the right side.  Thus, the entry with the largest key is combined with the zero value,
 * which is then combined with the second-to-largest key, and so on.
 */
export function foldr<K, V, T>(
  f: (k: K, v: V, acc: T) => T,
  zero: T,
  root: TreeNode<K, V> | null,
): T {
  const nodes: Array<TreeNode<K, V>> = [];
  let node: TreeNode<K, V> | null = root;
  let acc = zero;
  while (node !== null || nodes.length > 0) {
    if (node !== null) {
      nodes.push(node);
      node = node.right;
    } else {
      node = nodes.pop()!;
      acc = f(node.key, node.val, acc);
      node = node.left;
    }
  }

  return acc;
}

/** Transform the values in the tree using a function
 *
 * @category Transformation
 *
 * @remarks
 * `mapValues` applies the function `f` to each value and key in the tree and returns a new tree
 * with the same keys but the values adjusted to the result of the function `f`.  This can be done efficiently because
 * the keys are unchanged the arrangement of the tree is unchanged.
 * `mapValues` guarantees that if no values are changed, then the tree object instance is returned
 * unchanged.
 *
 * This runs in O(n) time.
 */
export function mapValues<K, V1, V2>(
  f: (v: V1, k: K) => V2,
  root: TreeNode<K, V1> | null,
): TreeNode<K, V2> | null {
  function loop(n: TreeNode<K, V1> | null): TreeNode<K, V2> | null {
    if (!n) return null;
    const newLeft = loop(n.left);
    const newVal = f(n.val, n.key);
    const newRight = loop(n.right);

    // typescript won't let us compare V1 with V2, but if the types V1 are equal to V2 and the values are equal, we want to
    // return the tree unchanged.
    if (
      (newVal as unknown) === (n.val as unknown) &&
      newLeft === n.left &&
      newRight === n.right
    ) {
      // if the values are equal, the types must be equal as well
      return n as unknown as TreeNode<K, V2>;
    } else {
      return { key: n.key, val: newVal, size: n.size, left: newLeft, right: newRight };
    }
  }

  return loop(root);
}

/** Transform or delete the values in the tree using a function
 *
 * @category Transformation
 *
 * @remarks
 * `collectValues` applies the function `f` to each value and key in the tree and uses the return value from
 * `f` as the new value.  If `f` returns undefined, the key and value is removed.  If `filterNull` is true and
 * `f` returns null, the key and value are also removed.
 * `collectValues` guarantees that if no values are changed, then the tree object instance is returned
 * unchanged.
 *
 * This runs in O(n) time.
 */
export function collectValues<K, V1, V2>(
  f: (v: V1, k: K) => V2 | undefined,
  filterNull: boolean,
  root: TreeNode<K, V1> | null,
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
    else if (
      (newVal as unknown) === (n.val as unknown) &&
      newLeft === n.left &&
      newRight === n.right
    ) {
      // if the values are equal, the types must be equal as well
      return n as unknown as TreeNode<K, V2>;
    } else {
      return combineDifferentSizes(newLeft, n.key, newVal, newRight);
    }
  }

  return loop(root);
}

/** The result of splitting a tree into keys above and below a given key
 *
 * @category Views
 */
export type SplitResult<K, V> = {
  readonly below: TreeNode<K, V> | null;
  readonly val: V | undefined;
  readonly above: TreeNode<K, V> | null;
};

/** Split a tree on a key
 *
 * @remarks
 * `split` splits a tree into keys below and above a given key.  The return type consists of
 * a balanced tree of all keys less than the given key, the value associated to the given key if
 * it exists, and a balanced tree of all keys greater than the given key.
 *
 * Runs in O(log n) time.
 *
 * @category Views
 */
export function split<K, V>(
  { compare }: ComparisonConfig<K>,
  k: K,
  root: TreeNode<K, V> | null,
): SplitResult<K, V> {
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

/** Partition a tree based on a boolean function
 *
 * @remarks
 * The function `f` is applied to each key and value.  The entries for which `f` returns `true`
 * are placed in one tree and entries for which `f` returns false are placed in the other.
 * The two trees are returned as a tuple, with the `true` tree returned as the first
 * element of the tuple.
 *
 * If the function `f` returns `true` for all entries, then the first tree object instance
 * is guaranteed to be === to the initial tree object instance.  Similar for if `f` returns `false` for
 * all entries.
 *
 * This runs in O(n) time.
 *
 * @category Views
 */
export function partition<K, V>(
  f: (k: K, v: V) => boolean,
  root: TreeNode<K, V> | null,
): readonly [TreeNode<K, V> | null, TreeNode<K, V> | null] {
  function loop(
    node: TreeNode<K, V> | null,
  ): readonly [TreeNode<K, V> | null, TreeNode<K, V> | null] {
    if (node === null) return [null, null];
    const [leftTrue, leftFalse] = loop(node.left);
    const [rightTrue, rightFalse] = loop(node.right);
    if (f(node.key, node.val)) {
      const newL =
        leftTrue === node.left && rightTrue === node.right
          ? node
          : combineDifferentSizes(leftTrue, node.key, node.val, rightTrue);
      return [newL, glueDifferentSizes(leftFalse, rightFalse)];
    } else {
      const newR =
        rightFalse === node.right && leftFalse === node.left
          ? node
          : combineDifferentSizes(leftFalse, node.key, node.val, rightFalse);
      return [glueDifferentSizes(leftTrue, rightTrue), newR];
    }
  }
  return loop(root);
}

/** The combination of a single key-value and a balanced tree of all remaining values
 *
 * @category Views
 */
export type ViewResult<K, V> = {
  k: K;
  v: V;
  rest: TreeNode<K, V> | null;
};

/** Extract the minimum key and compute a balanced tree of all other values
 *
 * @category Views
 *
 * @remarks
 * `minView` finds the minimum key and then removes it, producing a new balanced
 * tree of all other keys and values.  Both the removed key and value and the newly
 * balanced tree is returned.
 *
 * Runs in O(log n) time, so can be used to efficiently pop the minimum key.
 */
export function minView<K, V>(root: TreeNode<K, V>): ViewResult<K, V> {
  return removeMin(root);
}

/** Extract the maximum key and compute a balanced tree of all other values
 *
 * @category Views
 *
 * @remarks
 * `maxView` finds the maximum key and then removes it, producing a new balanced
 * tree of all other keys and values.  Both the removed key and value and the newly
 * balanced tree is returned.
 *
 * Runs in O(log n) time, so can be used to efficiently pop the maximum key.
 */
export function maxView<K, V>(root: TreeNode<K, V>): ViewResult<K, V> {
  return removeMax(root);
}

/** Returns true if every key in root1 is also present in root2
 *
 * @category Views
 *
 * @remarks
 * isKeySubset checks if the keys in root1 are a subset of the keys in root2.
 *
 * Runs in time O(m log(n/m + 1)) where m is the size of root1 and n is the size of root2.
 */
export function isKeySubset<K, V1, V2>(
  cfg: ComparisonConfig<K>,
  root1: TreeNode<K, V1> | null,
  root2: TreeNode<K, V2> | null,
): boolean {
  if (!root1) return true;
  if (!root2) return false;
  if (root1.size > root2.size) return false;

  function loop(n1: TreeNode<K, V1> | null, n2: TreeNode<K, V2> | null): boolean {
    if (!n1) return true;
    //no need to check n2 null, the size checks before the recursion will catch that
    //if (!n2) return false;

    const s = split(cfg, n1.key, n2);
    if (s.val === undefined) return false;

    // cheap size checks can sometimes save expenseve recursion.  Do it here before
    // recursion because the size check on the right side should happen before recursing
    // into the left side.
    if ((n1.left?.size ?? 0) > (s.below?.size ?? 0)) return false;
    if ((n1.right?.size ?? 0) > (s.above?.size ?? 0)) return false;
    return loop(n1.left, s.below) && loop(n1.right, s.above);
  }

  return loop(root1, root2);
}

/** Returns true if keys are disjoint between the two trees
 *
 * @category Views
 *
 * @remarks
 * disjoint checks if the keys in root1 are disjoint from the keys in root2, i.e. the
 * intersection is empty.
 *
 * Runs in time O(m log(n/m + 1)) where m is the size of the smaller set and n is the size of the larger set.
 */
export function isDisjoint<K, V1, V2>(
  cfg: ComparisonConfig<K>,
  root1: TreeNode<K, V1> | null,
  root2: TreeNode<K, V2> | null,
): boolean {
  if (!root1 || !root2) return true;

  function loop(n1: TreeNode<K, V1> | null, n2: TreeNode<K, V2> | null): boolean {
    if (!n1 || !n2) return true;

    if (n1.size === 1) {
      // avoid a split for the singleton case
      return lookup(cfg, n1.key, n2) === undefined;
    }

    const s = split(cfg, n1.key, n2);
    if (s.val !== undefined) return false;
    return loop(n1.left, s.below) && loop(n1.right, s.above);
  }

  return loop(root1, root2);
}

/** Find the index of a key
 *
 * @category Indexing
 *
 * @remarks
 * Find the index of a key, which is its zero-based index in the sequence
 * sorted by key.  The index is a number from 0 to size-1.  If the key is not found,
 * -1 is returned.
 *
 * Runs in O(log n) time.
 */
export function indexOf<K, V>(
  { compare }: ComparisonConfig<K>,
  k: K,
  root: TreeNode<K, V> | null,
): number {
  let node = root;
  let index = 0;
  while (node) {
    const c = compare(k, node.key);
    if (c === 0) {
      if (node.left) {
        index += node.left.size;
      }
      return index;
    } else if (c < 0) {
      node = node.left;
    } else {
      if (node.left) {
        index += node.left.size;
      }
      index += 1;
      node = node.right;
    }
  }

  return -1;
}

/** Lookup a key and value by index
 *
 * @category Indexing
 *
 * @remarks
 * Lookup the key and value at the given zero-based index in key order.  If the index is out of range,
 * undefined is returned.
 *
 * Runs in O(log n) time.
 */
export function lookupByIndex<K, V>(
  n: number,
  root: TreeNode<K, V> | null,
): readonly [K, V] | undefined {
  let node = root;
  let index = n;
  while (node) {
    const leftSize = node.left ? node.left.size : 0;
    if (index < leftSize) {
      node = node.left;
    } else if (index === leftSize) {
      return [node.key, node.val];
    } else {
      index -= leftSize + 1;
      node = node.right;
    }
  }

  return undefined;
}

/** Take the given number of entries in key order
 *
 * @category Indexing
 *
 * @remarks
 * Runs in O(log n) time.
 */
export function take<K, V>(
  n: number,
  root: TreeNode<K, V> | null,
): TreeNode<K, V> | null {
  if (n <= 0 || root === null) return null;
  if (n >= root.size) return root;
  const leftSize = root.left ? root.left.size : 0;
  if (n <= leftSize) {
    return take(n, root.left);
  } else {
    const rightTake = take(n - leftSize - 1, root.right);
    return combineDifferentSizes(root.left, root.key, root.val, rightTake);
  }
}

/** Drops the given number of entries in key order
 *
 * @category Indexing
 *
 * @remarks
 * Runs in O(log n) time.
 */
export function drop<K, V>(
  n: number,
  root: TreeNode<K, V> | null,
): TreeNode<K, V> | null {
  if (n <= 0 || root === null) return root;
  if (n >= root.size) return null;
  const leftSize = root.left ? root.left.size : 0;
  if (n < leftSize) {
    const newLeft = drop(n, root.left);
    return combineDifferentSizes(newLeft, root.key, root.val, root.right);
  } else if (n === leftSize) {
    return insertMin(root.key, root.val, root.right);
  } else {
    return drop(n - leftSize - 1, root.right);
  }
}

/** Update or delete a value at a given index
 *
 * @category Indexing
 *
 * @remarks
 * `alterByIndex` updates the value at the given zero-based index in key order using the function `f`.
 * If `f` returns undefined, the key and value at the index is removed.  If the index is out of range,
 * the tree is returned unchanged.
 *
 * This runs in O(log n) time.
 */
export function alterByIndex<K, V>(
  n: number,
  f: (key: K, oldVal: V) => V | undefined,
  root: TreeNode<K, V> | null,
): TreeNode<K, V> | null {
  if (n < 0 || root === null) return root;

  const leftSize = root.left ? root.left.size : 0;

  if (n < leftSize) {
    const newLeft = alterByIndex(n, f, root.left);
    if (newLeft === root.left) {
      return root;
    } else {
      return combineAfterInsertOrRemove(newLeft, root.key, root.val, root.right);
    }
  } else if (n === leftSize) {
    const newVal = f(root.key, root.val);
    if (newVal === undefined) {
      return glueSizeBalanced(root.left, root.right);
    } else if (newVal === root.val) {
      return root;
    } else {
      return {
        key: root.key,
        val: newVal,
        size: root.size,
        left: root.left,
        right: root.right,
      };
    }
  } else {
    const newRight = alterByIndex(n - leftSize - 1, f, root.right);
    if (newRight === root.right) {
      return root;
    } else {
      return combineAfterInsertOrRemove(root.left, root.key, root.val, newRight);
    }
  }
}

/** Returns a new tree which combines all entries in two trees
 *
 * @category Bulk Modification
 *
 * @remarks
 * `union` produces a new balanced tree which contains all the entries in both trees.  If a
 * key appears in only one of the two trees, the value from the tree is used.  If a key appears
 * in both trees, the provided merge function is used to determine the value.
 * `union` guarantees that if the resulting tree is equal to `root1`, then the `root1` object
 * instance is returned unchanged.
 *
 * Runs in time O(m log(n/m)) where m is the size of the smaller tree and n is the size of the larger tree.
 */
export function union<K, V>(
  cfg: ComparisonConfig<K>,
  merge: (v1: V, v2: V, k: K) => V,
  root1: TreeNode<K, V> | null,
  root2: TreeNode<K, V> | null,
): TreeNode<K, V> | null {
  function loop(
    n1: TreeNode<K, V> | null,
    n2: TreeNode<K, V> | null,
  ): TreeNode<K, V> | null {
    if (!n1) return n2;
    if (!n2) return n1;
    if (!n1.left && !n1.right) {
      return alter(
        cfg,
        n1.key,
        (oldVal) => (oldVal === undefined ? n1.val : merge(n1.val, oldVal, n1.key)),
        n2,
      );
    }
    if (!n2.left && !n2.right) {
      return alter(
        cfg,
        n2.key,
        (oldVal) => (oldVal === undefined ? n2.val : merge(oldVal, n2.val, n2.key)),
        n1,
      );
    }

    const s = split(cfg, n1.key, n2);
    const newLeft = loop(n1.left, s.below);
    const newRight = loop(n1.right, s.above);
    if (
      newLeft === n1.left &&
      newRight === n1.right &&
      (s.val === undefined || s.val === n1.val)
    ) {
      return n1;
    } else if (s.val !== undefined) {
      return combineDifferentSizes(
        newLeft,
        n1.key,
        merge(n1.val, s.val, n1.key),
        newRight,
      );
    } else {
      return combineDifferentSizes(newLeft, n1.key, n1.val, newRight);
    }
  }

  return loop(root1, root2);
}

/** Returns a new tree which contains only entries whose keys are in both trees
 *
 * @category Bulk Modification
 *
 * @remarks
 * `intersection` produces a tree which contains all the entries which have keys in
 * both trees.  For each such entry, the merge function is used to determine the resulting value.
 * `intersection` guarantees that if the resulting tree is equal to `root1`, then `root1` is returned
 * unchanged.
 *
 * Runs in time O(m log(n/m)) where m is the size of the smaller tree and n is the size of the larger tree.
 */
export function intersection<K, V>(
  cfg: ComparisonConfig<K>,
  merge: (v1: V, v2: V, k: K) => V,
  root1: TreeNode<K, V> | null,
  root2: TreeNode<K, V> | null,
): TreeNode<K, V> | null {
  function loop(
    n1: TreeNode<K, V> | null,
    n2: TreeNode<K, V> | null,
  ): TreeNode<K, V> | null {
    if (!n1) return null;
    if (!n2) return null;

    const s = split(cfg, n1.key, n2);
    const newLeft = loop(n1.left, s.below);
    const newRight = loop(n1.right, s.above);
    if (s.val !== undefined) {
      if (newLeft === n1.left && newRight === n1.right && s.val === n1.val) {
        return n1;
      } else {
        return combineDifferentSizes(
          newLeft,
          n1.key,
          merge(n1.val, s.val, n1.key),
          newRight,
        );
      }
    } else {
      return glueDifferentSizes(newLeft, newRight);
    }
  }

  return loop(root1, root2);
}

/** Returns a new tree which contains only keys which appear in the first but not the second tree
 *
 * @category Bulk Modification
 *
 * @remarks
 * `difference` produces a tree which contains all the entries in `root1` where the key does
 * **not** exist in `root2`.  Can think of this as `root1 - root2` where the subtraction
 * is removing all the keys in `root2` from `root1`.  The values of the `root2` tree are ignored and
 * can be any value `V2`.
 * `difference` guarantees that if no entries are removed from `root1`, then `root1` object
 * is returned unchanged.
 *
 * Runs in time O(m log(n/m)) where m is the size of the smaller tree and n is the size of the larger tree.
 */
export function difference<K, V1, V2>(
  cfg: ComparisonConfig<K>,
  root1: TreeNode<K, V1> | null,
  root2: TreeNode<K, V2> | null,
): TreeNode<K, V1> | null {
  function loop(
    n1: TreeNode<K, V1> | null,
    n2: TreeNode<K, V2> | null,
  ): TreeNode<K, V1> | null {
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

/** Returns a new tree which contains only entries whose key appear in exactly one of the two trees
 *
 * @category Bulk Modification
 *
 * @remarks
 * symmetricDifference produces a tree which contains all the entries in root1 and root2 where the key does not exist in both trees.
 * If root1 or root2 are null, the other tree is returned unchanged.
 *
 * Runs in time O(m log(n/m)) where m is the size of the smaller tree and n is the size of the larger tree.
 */
export function symmetricDifference<K, V>(
  cfg: ComparisonConfig<K>,
  root1: TreeNode<K, V> | null,
  root2: TreeNode<K, V> | null,
): TreeNode<K, V> | null {
  function loop(
    n1: TreeNode<K, V> | null,
    n2: TreeNode<K, V> | null,
  ): TreeNode<K, V> | null {
    if (!n1) return n2;
    if (!n2) return n1;
    if (!n1.left && !n1.right) {
      return alter(
        cfg,
        n1.key,
        (oldVal) => (oldVal === undefined ? n1.val : undefined),
        n2,
      );
    }
    if (!n2.left && !n2.right) {
      return alter(
        cfg,
        n2.key,
        (oldVal) => (oldVal === undefined ? n2.val : undefined),
        n1,
      );
    }

    const s = split(cfg, n1.key, n2);
    const newLeft = loop(n1.left, s.below);
    const newRight = loop(n1.right, s.above);
    if (s.val !== undefined) {
      // delete s.val
      return glueDifferentSizes(newLeft, newRight);
    } else {
      return combineDifferentSizes(newLeft, n1.key, n1.val, newRight);
    }
  }

  return loop(root1, root2);
}

/** Return a tree which adjusts all the provided keys with a specified modification function.
 *
 * @category Bulk Modification
 *
 * @remarks
 * `adjust` is passed two trees: `root1` is the tree to modify and `root2` is the keys to adjust associated to helper
 * values of type `V2` (the type `V2` can be anything and does not need to be related `V1`).
 * For each key in `root2` to modify, `adjust` looks up the key in `root1` and then calls the function `f`
 * with the current existing value in `root1` (or `undefined` if the key does not exist) and the helper value from `root2`
 * associated with the key. The return value from `f` is set as the new value for the key, or removed if the return value is `undefined`.
 *
 * `adjust` guarantees that if nothing was added, removed, or changed, then `root1` is returned.
 *
 * Runs in time O(n + m) where n and m are the sizes of the two trees.
 */
export function adjust<K, V1, V2>(
  cfg: ComparisonConfig<K>,
  f: (v1: V1 | undefined, v2: V2, k: K) => V1 | undefined,
  root1: TreeNode<K, V1> | null,
  root2: TreeNode<K, V2> | null,
): TreeNode<K, V1> | null {
  function fWithUndefined(v2: V2, k: K): V1 | undefined {
    return f(undefined, v2, k);
  }

  function loop(
    n1: TreeNode<K, V1> | null,
    n2: TreeNode<K, V2> | null,
  ): TreeNode<K, V1> | null {
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
