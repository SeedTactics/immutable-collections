/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { HashConfig } from "./hashing.js";
import * as tree from "./tree.js";

/*
A Hash Array Mapped Trie (HAMT)

A HAMT is a tree in which each node has 32 children and the hash of the key is
used to determine which child the entry is placed in.  To do so, the hash is
split into 5-bit chunks.  The 5-bit value of each chunk (so 2^5 = 32 possible
values) is used to determine which of the children the key will be placed in.

Storing 32-children in a single node when many of them are empty or null is
inefficient, so there is one enhancement.  For a node with some null/empty
children, we instead store a 32-bit bitmap of the children that are non-null and
then only store the non-null children in an array.

For example, if we have a node with the following bitmap
0b00000000_00001000_00100000_10001000 this means the node only has 4 non-null
children and they are the positions of the 1s.  Only the four non-null children are
stored and some fancy bit operations are used to determine which ones they are.

The leaves are either a single leaf node with the key and the value or, if two
keys hash to the same value, we store the collisions in a balanced tree.
*/

/* The algorithms and code here is greatly influenced by

  - Haskell's unordered-collections: https://github.com/haskell-unordered-containers/unordered-containers/blob/master/Data/HashMap/Internal.hs
  - hamt_plus: https://github.com/mattbierner/hamt_plus
*/

// A leaf with the hash, key, and value.
export type LeafNode<K, V> = { readonly hash: number; readonly key: K; readonly val: V };
export type MutableLeafNode<K, V> = { readonly hash: number; readonly key: K; val: V };

// A leaf node with the hash and an array of keys and values with this same hash.
export type CollisionNode<K, V> = {
  readonly hash: number;
  readonly collision: tree.TreeNode<K, V>;
};
export type MutableCollisionNode<K, V> = {
  readonly hash: number;
  collision: tree.MutableTreeNode<K, V>;
};

export type InternalNode<K, V> = {
  // bitmap stores which children are non-null and stored in the children array.
  // Technically, we don't need to store the bitmap in a full node, but javascript
  // optimizers work well when objects have the same shape.  Thus also ensure
  // to always create nodes with the property bitmap first, then children.
  // https://mathiasbynens.be/notes/shapes-ics
  readonly bitmap: number;
  readonly children: ReadonlyArray<HamtNode<K, V>>;
};
export type MutableInternalNode<K, V> = {
  bitmap: number;
  readonly children: Array<MutableHamtNode<K, V>>;
};
type MutableSpineInternalNode<K, V> = {
  bitmap: number;
  readonly children: Array<HamtNode<K, V>>;
};
type MutableSpineNode<K, V> = {
  readonly node: MutableSpineInternalNode<K, V>;
  readonly childIdx: number;
};

export type HamtNode<K, V> = LeafNode<K, V> | CollisionNode<K, V> | InternalNode<K, V>;

export type MutableHamtNode<K, V> = MutableLeafNode<K, V> | MutableCollisionNode<K, V> | MutableInternalNode<K, V>;

const bitsPerSubkey = 5;
const subkeyMask = (1 << bitsPerSubkey) - 1;
const maxChildren = 1 << bitsPerSubkey;
const fullBitmap = ~0;

// given the hash and the shift (the tree level), returns a bitmap with a 1 in the position of the index of the hash at this level
function mask(hash: number, shift: number): number {
  return 1 << ((hash >>> shift) & subkeyMask);
}

// https://stackoverflow.com/questions/43122082/efficiently-count-the-number-of-bits-in-an-integer-in-javascript
function popCount(n: number): number {
  n = n - ((n >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0xf0f0f0f) * 0x1010101) >> 24;
}

// index of the hash in a bitmap indexed node
function sparseIndex(bitmap: number, mask: number): number {
  return popCount(bitmap & (mask - 1));
}

// index of the hash in a full node
function fullIndex(hash: number, shift: number): number {
  return (hash >>> shift) & subkeyMask;
}

function constUndefined() {
  return undefined;
}

export function lookup<K, V>(
  cfg: HashConfig<K>,
  k: K,
  rootNode: HamtNode<K, V>,
  hash?: number,
  shift?: number
): V | undefined {
  if (hash === undefined) {
    hash = cfg.hash(k);
  }
  if (shift === undefined) {
    shift = 0;
  }
  let node = rootNode;
  do {
    if ("children" in node) {
      const bitmap = node.bitmap;
      if (bitmap !== fullBitmap) {
        const m = mask(hash, shift);
        if ((bitmap & m) === 0) {
          return undefined;
        } else {
          // recurse
          node = node.children[sparseIndex(bitmap, m)];
          shift += bitsPerSubkey;
        }
      } else {
        // recurse on full node
        node = node.children[fullIndex(hash, shift)];
        shift += bitsPerSubkey;
      }
    } else if ("key" in node) {
      if (hash === node.hash && cfg.compare(k, node.key) === 0) {
        return node.val;
      } else {
        return undefined;
      }
    } else {
      if (hash === node.hash) {
        return tree.lookup(cfg, k, node.collision);
      } else {
        return undefined;
      }
    }
  } while (node);
  throw new Error("Internal immutable-collections violation: node undefined during lookup");
}

// create a new node consisting of two children. Requires that the hashes are not equal
function two<K, V>(
  shift: number,
  leaf1: MutableLeafNode<K, V> | MutableCollisionNode<K, V>,
  leaf2: MutableLeafNode<K, V> | MutableCollisionNode<K, V>
): MutableHamtNode<K, V>;
function two<K, V>(
  shift: number,
  leaf1: LeafNode<K, V> | CollisionNode<K, V>,
  leaf2: LeafNode<K, V> | CollisionNode<K, V>
): HamtNode<K, V>;
function two<K, V>(
  shift: number,
  leaf1: LeafNode<K, V> | CollisionNode<K, V>,
  leaf2: LeafNode<K, V> | CollisionNode<K, V>
): HamtNode<K, V> {
  const hash1 = leaf1.hash;
  const hash2 = leaf2.hash;
  let root: HamtNode<K, V> | undefined;

  // as we descend through the shifts, newly created nodes are set at the zero index in the
  // parent array.
  let parent: Array<HamtNode<K, V>> | undefined;

  do {
    const mask1 = mask(hash1, shift);
    const mask2 = mask(hash2, shift);

    if (mask1 === mask2) {
      // need to recurse
      const newArr = new Array(1);
      const newNode = { bitmap: mask1, children: newArr };
      if (root === undefined) {
        root = newNode;
      }
      if (parent !== undefined) {
        parent[0] = newNode;
      }
      parent = newArr;

      shift = shift + bitsPerSubkey;
    } else {
      // we can insert
      const newNode = {
        bitmap: mask1 | mask2,
        children: fullIndex(hash1, shift) < fullIndex(hash2, shift) ? [leaf1, leaf2] : [leaf2, leaf1],
      };
      if (parent !== undefined) {
        parent[0] = newNode;
      }
      return root ?? newNode;
    }
  } while (shift <= maxChildren);
  throw new Error(
    "Internal immutable-collections violation: shift > maxShift for two " + JSON.stringify({ shift, leaf1, leaf2 })
  );
}

export function insert<K, V>(
  cfg: HashConfig<K>,
  k: K,
  getVal: (v: V | undefined) => V,
  rootNode: HamtNode<K, V> | null
): readonly [HamtNode<K, V>, boolean] {
  const hash = cfg.hash(k);

  if (rootNode === null) {
    return [{ hash, key: k, val: getVal(undefined) }, true];
  }

  let newRoot: HamtNode<K, V> | undefined;

  // we will descend through the tree, leaving a trail of newly created nodes behind us.
  // Each newly created internal node will have an new array of children, and this
  // new array will be set in the parent variable.
  // Thus each time we create a new node, it must be set into the parent array at the given index.
  let parent: Array<HamtNode<K, V>> | undefined;
  let parentIdx = 0;

  let shift = 0;
  let curNode = rootNode;

  do {
    if ("children" in curNode) {
      let idx: number;
      let copyOfNode: MutableSpineInternalNode<K, V>;
      const bitmap = curNode.bitmap;
      if (bitmap !== fullBitmap) {
        const m = mask(hash, shift);
        idx = sparseIndex(bitmap, m);

        if ((bitmap & m) === 0) {
          // child is not present in the bitmap so can be added as a leaf

          // create the new node
          const childArr = curNode.children;
          const leaf = { hash, key: k, val: getVal(undefined) };
          const newArr = [...childArr.slice(0, idx), leaf, ...childArr.slice(idx)];
          const newNode = { bitmap: bitmap | m, children: newArr };

          // set it in the parent and return
          if (parent !== undefined) {
            parent[parentIdx] = newNode;
          }
          return [newRoot ?? newNode, true];
        }
        // if we get here, the child is present in the bitmap, so we need to recurse
        copyOfNode = { bitmap: bitmap, children: [...curNode.children] };
      } else {
        idx = fullIndex(hash, shift);
        copyOfNode = { bitmap: fullBitmap, children: [...curNode.children] };
      }

      // need to recurse

      if (newRoot === undefined) {
        newRoot = copyOfNode;
      }
      if (parent !== undefined) {
        parent[parentIdx] = copyOfNode;
      }

      // recurse
      parent = copyOfNode.children;
      parentIdx = idx;
      shift = shift + bitsPerSubkey;
      curNode = copyOfNode.children[idx];
    } else if ("key" in curNode) {
      // node is a leaf, check if key is equal or there is a collision
      let newNode: HamtNode<K, V>;
      let inserted = true;
      if (hash === curNode.hash) {
        const cmp = cfg.compare(k, curNode.key);
        if (cmp === 0) {
          const newVal = getVal(curNode.val);
          if (newVal === curNode.val) {
            // return the original root node because nothing changed
            return [rootNode, false];
          } else {
            // replace the value in a new leaf
            newNode = { hash, key: k, val: newVal };
            inserted = false;
          }
        } else {
          // a collision
          newNode = {
            hash,
            collision: tree.two(cmp, k, getVal(undefined), curNode.key, curNode.val),
          };
        }
      } else {
        // hashes are different
        newNode = two(shift, { hash, key: k, val: getVal(undefined) }, curNode);
      }

      // set the new node and return
      if (parent !== undefined) {
        parent[parentIdx] = newNode;
      }
      return [newRoot ?? newNode, inserted];
    } else {
      // existing collision node
      let newNode: HamtNode<K, V> | undefined = undefined;
      let inserted = true;
      if (hash === curNode.hash) {
        // check and extend the existing collision node
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const newRoot = tree.alter(cfg, k, getVal, curNode.collision)!;
        if (newRoot === curNode.collision) {
          // return the original root node because nothing changed
          return [rootNode, false];
        }
        inserted = newRoot.size !== curNode.collision.size;
        newNode = {
          hash,
          collision: newRoot,
        };
      } else {
        // create a new bitmap indexed node with a new leaf and the collision node as children
        newNode = two(shift, curNode, { hash, key: k, val: getVal(undefined) });
      }
      if (parent !== undefined) {
        parent[parentIdx] = newNode;
      }
      return [newRoot ?? newNode, inserted];
    }
  } while (curNode);
  throw new Error("Internal immutable-collections violation: hamt insert reached null");
}

export function mutateInsert<K, T, V>(
  cfg: HashConfig<K>,
  k: K,
  t: T,
  getVal: (old: V | undefined, t: T) => V,
  rootNode: MutableHamtNode<K, V> | null
): MutableHamtNode<K, V> {
  const hash = cfg.hash(k);

  if (rootNode === null) {
    return { hash, key: k, val: getVal(undefined, t) };
  }

  // we descend through the tree, keeping track of the parent and the index into the parent array
  let parent: Array<MutableHamtNode<K, V>> | undefined;
  let parentIdx = 0;

  let shift = 0;
  let curNode = rootNode;

  do {
    if ("children" in curNode) {
      let idx: number;
      const bitmap = curNode.bitmap;
      if (bitmap !== fullBitmap) {
        const m = mask(hash, shift);
        idx = sparseIndex(bitmap, m);

        if ((bitmap & m) === 0) {
          // child is not present in the bitmap so can be added as a leaf
          const leaf = { hash, key: k, val: getVal(undefined, t) };
          const arr = curNode.children;
          arr.splice(idx, 0, leaf);
          curNode.bitmap |= m;
          return rootNode;
        }
        // if we reach here, need to recurse
      } else {
        idx = fullIndex(hash, shift);
      }

      //recurse
      parent = curNode.children;
      parentIdx = idx;
      shift = shift + bitsPerSubkey;
      curNode = parent[idx];
    } else if ("key" in curNode) {
      // node is a leaf, check if key is equal or there is a collision
      let newNode: MutableHamtNode<K, V>;
      if (hash === curNode.hash) {
        const cmp = cfg.compare(k, curNode.key);
        if (cfg.compare(k, curNode.key) === 0) {
          // replace the value
          curNode.val = getVal(curNode.val, t);
          return rootNode;
        } else {
          // a collision
          newNode = {
            hash,
            collision: tree.two(cmp, k, getVal(undefined, t), curNode.key, curNode.val),
          };
        }
      } else {
        // hashes are different
        newNode = two(shift, { hash, key: k, val: getVal(undefined, t) }, curNode);
      }

      if (parent !== undefined) {
        parent[parentIdx] = newNode;
      } else {
        // parent is undefined means the current node is the root
        rootNode = newNode;
      }
      return rootNode;
    } else {
      if (hash === curNode.hash) {
        curNode.collision = tree.mutateInsert(cfg, k, t, getVal, curNode.collision);
        return rootNode;
      } else {
        // create a new bitmap indexed node with a new leaf and the collision node as children
        const newNode = two(shift, curNode, { hash, key: k, val: getVal(undefined, t) });
        if (parent !== undefined) {
          parent[parentIdx] = newNode;
        } else {
          // parent is undefined means the current node is the root
          rootNode = newNode;
        }
        return rootNode;
      }
    }
  } while (curNode);
  throw new Error("Internal immutable-collections violation: hamt mutate insert reached null");
}

function hasSingleLeafOrCollision<K, V>(node: HamtNode<K, V>): LeafNode<K, V> | CollisionNode<K, V> | null {
  while (node) {
    if ("children" in node) {
      if (node.children.length === 1) {
        // loop
        node = node.children[0];
      } else {
        return null;
      }
    } else {
      return node;
    }
  }
  return null;
}

function removeChildFromEndOfSpine<K, V>(
  spine: ReadonlyArray<MutableSpineNode<K, V>>,
  hash: number,
  shift: number
): HamtNode<K, V> {
  // remove the node pointed to by the last spine entry
  // there are three cases:
  // - a full node is transitioned to a bitmap indexed node
  // - the opposite of the two function above: if the removal results in a chain of single-child
  //   bitmap-indexed nodes ending at a single leaf, the whole chain of nodes is removed
  //  - a bitmap-indexed node which is not in such a chain just has the child removed
  // Returns the new root node for the whole tree

  const last = spine[spine.length - 1];
  if (last.node.bitmap === fullBitmap) {
    // transform the full node into a bitmap node
    const arr = last.node.children;
    arr.splice(last.childIdx, 1);
    const bitmap = ~(1 << last.childIdx);
    if (spine.length === 1) {
      return { bitmap: bitmap, children: arr };
    } else {
      const n = spine[spine.length - 2];
      n.node.children[n.childIdx] = { bitmap: bitmap, children: arr };
      return spine[0].node;
    }
  }

  if (last.node.children.length === 2) {
    // removing might potentially result in a chain of single-child bitmap-indexed nodes
    const otherLeaf = hasSingleLeafOrCollision(last.node.children[1 - last.childIdx]);
    if (otherLeaf) {
      // walk back up the spine, checking for single-child bitmap-indexed nodes
      for (let i = spine.length - 2; i >= 0; i--) {
        const cur = spine[i];
        if (cur.node.children.length !== 1) {
          // found the end of the chain
          cur.node.children[cur.childIdx] = otherLeaf;
          return spine[0].node;
        }
      }
      // the entire spine is single-child bitmap-indexed nodes, so the whole tree reduces to just the leaf
      return otherLeaf;
    }
    // other is not a chain, so fall through to just removing the child
  }

  // last is a bitmap indexed node which after removal will not be in a chain of single-child bitmap-indexed nodes
  last.node.bitmap &= ~mask(hash, shift - bitsPerSubkey);
  last.node.children.splice(last.childIdx, 1);
  return spine[0].node;
}

function addToSpine<K, V>(
  spine: Array<MutableSpineNode<K, V>>,
  node: MutableSpineInternalNode<K, V>,
  childIdx: number
): void {
  if (spine.length > 0) {
    const n = spine[spine.length - 1];
    n.node.children[n.childIdx] = node;
  }
  spine.push({ node, childIdx });
}

export function remove<K, V>(
  cfg: HashConfig<K>,
  k: K,
  rootNode: HamtNode<K, V> | null,
  hash?: number,
  shift?: number
): HamtNode<K, V> | null {
  if (rootNode === null) {
    return null;
  }
  if (hash === undefined) hash = cfg.hash(k);
  if (shift === undefined) shift = 0;

  const spine: Array<MutableSpineNode<K, V>> = [];

  let curNode = rootNode;

  do {
    if ("children" in curNode) {
      let idx: number;
      const bitmap = curNode.bitmap;
      if (bitmap !== fullBitmap) {
        const m = mask(hash, shift);
        if ((bitmap & m) === 0) {
          // element is not present
          return rootNode;
        } else {
          // recurse
          idx = sparseIndex(bitmap, m);
        }
      } else {
        idx = fullIndex(hash, shift);
      }

      // create a new node
      const newNode = { bitmap: bitmap, children: [...curNode.children] };
      addToSpine(spine, newNode, idx);

      //recurse
      shift = shift + bitsPerSubkey;
      curNode = newNode.children[idx];
    } else if ("key" in curNode) {
      if (hash === curNode.hash) {
        if (cfg.compare(k, curNode.key) === 0) {
          if (spine.length === 0) {
            // this leaf is the root, so removing it will make the tree empty
            return null;
          } else {
            return removeChildFromEndOfSpine(spine, hash, shift);
          }
        } else {
          // keys are not equal, no match
          return rootNode;
        }
      } else {
        // hashes are different, no match
        return rootNode;
      }
    } else {
      // collision
      if (hash === curNode.hash) {
        // collision node always has at least two nodes, so removing one will still leave non-empty tree
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const newRoot = tree.alter(cfg, k, constUndefined, curNode.collision)!;
        if (newRoot === curNode.collision) {
          return rootNode;
        }
        let newNode: HamtNode<K, V>;
        if (newRoot.size === 1) {
          // switch back to a leaf node
          newNode = { hash, key: newRoot.key, val: newRoot.val };
        } else {
          newNode = { hash, collision: newRoot };
        }
        if (spine.length > 0) {
          const n = spine[spine.length - 1];
          n.node.children[n.childIdx] = newNode;
          return spine[0].node;
        } else {
          return newNode;
        }
      } else {
        // hashes are different, no match
        return rootNode;
      }
    }
  } while (curNode);

  throw new Error("Internal immutable-collections violation: hamt remove reached null");
}

export function alter<K, V>(
  cfg: HashConfig<K>,
  k: K,
  f: (oldV: V | undefined) => V | undefined,
  rootNode: HamtNode<K, V> | null
): [HamtNode<K, V> | null, number] {
  if (rootNode === null) {
    const newVal = f(undefined);
    if (newVal === undefined) {
      return [null, 0];
    } else {
      return [{ hash: cfg.hash(k), key: k, val: newVal }, 1];
    }
  }

  const hash = cfg.hash(k);

  const spine: Array<MutableSpineNode<K, V>> = [];

  let shift = 0;
  let curNode = rootNode;

  do {
    if ("children" in curNode) {
      let idx: number;
      const bitmap = curNode.bitmap;
      if (bitmap !== fullBitmap) {
        const m = mask(hash, shift);
        if ((bitmap & m) === 0) {
          // element is not present
          const newVal = f(undefined);
          if (newVal === undefined) {
            return [rootNode, 0];
          } else {
            // add as a leaf
            const childArr = curNode.children;
            const newIdx = sparseIndex(bitmap, m);
            const newArr = [
              ...childArr.slice(0, newIdx),
              {
                hash,
                key: k,
                val: newVal,
              },
              ...childArr.slice(newIdx),
            ];
            const newNode = { bitmap: bitmap | m, children: newArr };
            if (spine.length > 0) {
              const parent = spine[spine.length - 1];
              parent.node.children[parent.childIdx] = newNode;
              return [spine[0].node, 1];
            } else {
              return [newNode, 1];
            }
          }
        } else {
          // recurse
          idx = sparseIndex(bitmap, m);
        }
      } else {
        idx = fullIndex(hash, shift);
      }

      // create a new node
      const newNode = { bitmap: bitmap, children: [...curNode.children] };
      addToSpine(spine, newNode, idx);

      //recurse
      shift = shift + bitsPerSubkey;
      curNode = newNode.children[idx];
    } else if ("key" in curNode) {
      let newNode: HamtNode<K, V>;
      let sizeChange: number;
      if (hash === curNode.hash) {
        const cmp = cfg.compare(k, curNode.key);
        if (cmp === 0) {
          const newVal = f(curNode.val);
          if (newVal === undefined) {
            if (spine.length === 0) {
              // this leaf is the root, so removing it will make the tree empty
              return [null, -1];
            } else {
              return [removeChildFromEndOfSpine(spine, hash, shift), -1];
            }
          } else if (newVal === curNode.val) {
            return [rootNode, 0];
          } else {
            // replace value
            newNode = { hash, key: k, val: newVal };
            sizeChange = 0;
          }
        } else {
          // a collision, but key is not present
          const newVal = f(undefined);
          if (newVal === undefined) {
            return [rootNode, 0];
          } else {
            newNode = {
              hash,
              collision: tree.two(cmp, k, newVal, curNode.key, curNode.val),
            };
            sizeChange = 1;
          }
        }
      } else {
        // hashes are different
        const newVal = f(undefined);
        if (newVal === undefined) {
          return [rootNode, 0];
        } else {
          // insert
          newNode = two(shift, { hash, key: k, val: newVal }, curNode);
          sizeChange = 1;
        }
      }

      // set the new node
      if (spine.length > 0) {
        const parent = spine[spine.length - 1];
        parent.node.children[parent.childIdx] = newNode;
        return [spine[0].node, sizeChange];
      } else {
        return [newNode, sizeChange];
      }
    } else {
      // collision
      let newNode: HamtNode<K, V> | undefined;
      let sizeChange: number;
      if (hash === curNode.hash) {
        // collision node always has at least two nodes, so removing one will still leave non-empty tree
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const newRoot = tree.alter(cfg, k, f, curNode.collision)!;
        if (newRoot === curNode.collision) {
          return [rootNode, 0];
        }
        sizeChange = newRoot.size - curNode.collision.size;
        if (newRoot.size === 1) {
          // switch back to a leaf node
          newNode = { hash, key: newRoot.key, val: newRoot.val };
        } else {
          newNode = { hash, collision: newRoot };
        }
      } else {
        // hashes are different, key does not exist
        const newVal = f(undefined);
        if (newVal === undefined) {
          return [rootNode, 0];
        } else {
          // insert
          const newLeaf = { hash, key: k, val: newVal };
          newNode = two(shift, newLeaf, curNode);
          sizeChange = 1;
        }
      }

      if (spine.length > 0) {
        const n = spine[spine.length - 1];
        n.node.children[n.childIdx] = newNode;
        return [spine[0].node, sizeChange];
      } else {
        return [newNode, sizeChange];
      }
    }
  } while (curNode);

  throw new Error("Internal immutable-collections violation: hamt alter reached null");
}

export function* iterate<K, V, R>(root: HamtNode<K, V> | null, f: (k: K, v: V) => R): IterableIterator<R> {
  if (root === null) return;

  const stack: Array<HamtNode<K, V>> = [root];

  let node: HamtNode<K, V> | undefined;
  while ((node = stack.pop())) {
    if ("children" in node) {
      for (let i = 0, arr = node.children, len = arr.length; i < len; i++) {
        stack.push(arr[i]);
      }
    } else if ("key" in node) {
      yield f(node.key, node.val);
    } else {
      yield* tree.iterateAsc(f, node.collision);
    }
  }
}

export function fold<K, V, T>(root: HamtNode<K, V> | null, f: (acc: T, key: K, val: V) => T, zero: T): T {
  let acc = zero;
  if (root === null) return acc;

  const stack: Array<HamtNode<K, V>> = [root];

  let node: HamtNode<K, V> | undefined;
  while ((node = stack.pop())) {
    if ("children" in node) {
      for (let i = 0, arr = node.children, len = arr.length; i < len; i++) {
        stack.push(arr[i]);
      }
    } else if ("key" in node) {
      acc = f(acc, node.key, node.val);
    } else {
      acc = tree.foldl(f, acc, node.collision);
    }
  }
  return acc;
}

export function mapValues<K, V1, V2>(root: HamtNode<K, V1> | null, f: (v: V1, k: K) => V2): HamtNode<K, V2> | null {
  if (root === null) return null;

  function loop(node: HamtNode<K, V1>): HamtNode<K, V2> {
    if ("children" in node) {
      let newArr: Array<HamtNode<K, V2>> | undefined = undefined;
      for (let i = 0, arr = node.children, len = arr.length; i < len; i++) {
        const n = arr[i];
        const newN = loop(n);
        if (!newArr) {
          // if i > 0 and newArr is undefined, we must have had a previous value === and therefore
          // know that V1 is the same type as V2, but typescript does not know that
          if ((n as unknown) !== (newN as unknown)) {
            newArr = [...(arr.slice(0, i) as unknown as ReadonlyArray<HamtNode<K, V2>>), newN];
          }
        } else {
          newArr.push(newN);
        }
      }
      if (newArr) {
        return { bitmap: node.bitmap, children: newArr };
      } else {
        // if newArr is undefined, we know that V1 is the same as V2.
        return node as unknown as HamtNode<K, V2>;
      }
    } else if ("key" in node) {
      const newVal = f(node.val, node.key);
      if ((node.val as unknown) === (newVal as unknown)) {
        // if the values are ===, the type of V1 equals the type of V2
        return node as unknown as HamtNode<K, V2>;
      } else {
        return { hash: node.hash, key: node.key, val: newVal };
      }
    } else {
      const newRoot = tree.mapValues(f, node.collision);
      if ((newRoot as unknown) === (node.collision as unknown)) {
        // if the values are ===, the type of V1 equals the type of V2
        return node as unknown as HamtNode<K, V2>;
      } else {
        // mapValues on a non-null tree produces a non-null tree
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return { hash: node.hash, collision: newRoot! };
      }
    }
  }

  return loop(root);
}

export function collectValues<K, V1, V2>(
  root: HamtNode<K, V1> | null,
  f: (v: V1, k: K) => V2 | undefined,
  filterNull: boolean
): [HamtNode<K, V2> | null, number] {
  if (root === null) return [null, 0];

  let newSize = 0;
  function loop(node: HamtNode<K, V1>): HamtNode<K, V2> | null {
    if ("children" in node) {
      const origBitmap = node.bitmap;
      let newArr: Array<HamtNode<K, V2>> | undefined = undefined;
      let newBitmap = origBitmap;

      for (
        let mask = 1, idx = 0, remainingBitmap = origBitmap;
        remainingBitmap !== 0;
        remainingBitmap &= ~mask, mask <<= 1
      ) {
        if (origBitmap & mask) {
          // recurse on the child
          const n = node.children[idx];
          const newN = loop(n);
          if (!newArr) {
            if (newN) {
              // if i > 0 and newArr is undefined, we must have had a previous value === and therefore
              // know that V1 is the same type as V2, but typescript does not know that
              if ((n as unknown) !== (newN as unknown)) {
                newArr = [...(node.children.slice(0, idx) as unknown as ReadonlyArray<HamtNode<K, V2>>), newN];
              }
            } else {
              // filter out the value
              newArr = [...(node.children.slice(0, idx) as unknown as ReadonlyArray<HamtNode<K, V2>>)];
              newBitmap = newBitmap & ~mask;
            }
          } else {
            if (newN) {
              newArr.push(newN);
            } else {
              // filter out the value
              newBitmap = newBitmap & ~mask;
            }
          }
          idx++;
        }
      }
      if (newArr) {
        if (newArr.length === 0) {
          return null;
        } else if (newArr.length === 1) {
          const leaf = hasSingleLeafOrCollision(newArr[0]);
          if (leaf) {
            return leaf;
          } else {
            return { bitmap: newBitmap, children: newArr };
          }
        } else {
          return { bitmap: newBitmap, children: newArr };
        }
      } else {
        // if newArr is undefined, we know that V1 is the same as V2.
        return node as unknown as HamtNode<K, V2>;
      }
    } else if ("key" in node) {
      const newVal = f(node.val, node.key);
      if (newVal === undefined || (filterNull && newVal === null)) {
        return null;
      } else if ((node.val as unknown) !== (newVal as unknown)) {
        newSize++;
        return { hash: node.hash, key: node.key, val: newVal };
      } else {
        newSize++;
        // if vals are ===, we know that V1 is the same as V2.
        return node as unknown as HamtNode<K, V2>;
      }
    } else {
      const newCol = tree.collectValues(f, filterNull, node.collision);
      if ((newCol as unknown) === (node.collision as unknown)) {
        newSize += node.collision.size;
        // if vals are ===, we know that V1 is the same as V2.
        return node as unknown as HamtNode<K, V2>;
      } else if (newCol === null) {
        return null;
      } else if (newCol.size === 1) {
        // switch from collision back to just a leaf
        newSize += 1;
        return { hash: node.hash, key: newCol.key, val: newCol.val };
      } else {
        newSize += newCol.size;
        return { hash: node.hash, collision: newCol };
      }
    }
  }
  const newRoot = loop(root);

  return [newRoot, newSize];
}

export function union<K, V>(
  cfg: HashConfig<K>,
  f: (v1: V, v2: V, k: K) => V,
  root1: HamtNode<K, V> | null,
  root2: HamtNode<K, V> | null
): [HamtNode<K, V> | null, number] {
  if (root1 === null) return [root2, 0];
  if (root2 === null) return [root1, 0];

  let intersectionSize = 0;

  function loop(shift: number, node1: HamtNode<K, V>, node2: HamtNode<K, V>): HamtNode<K, V> {
    // Leaf vs Leaf
    if ("key" in node1 && "key" in node2) {
      if (node1.hash === node2.hash) {
        const cmp = cfg.compare(node1.key, node2.key);
        if (cmp === 0) {
          intersectionSize++;
          const newVal = f(node1.val, node2.val, node1.key);
          if (newVal === node1.val) {
            return node1;
          } else if (newVal === node2.val) {
            return node2;
          } else {
            return { hash: node1.hash, key: node1.key, val: newVal };
          }
        } else {
          // collision
          return {
            hash: node1.hash,
            collision: tree.two(cmp, node1.key, node1.val, node2.key, node2.val),
          };
        }
      } else {
        return two(shift, node1, node2);
      }
    } else if ("key" in node1 && "collision" in node2) {
      if (node1.hash === node2.hash) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const newRoot = tree.alter(
          cfg,
          node1.key,
          (v2) => {
            if (v2 === undefined) {
              return node1.val;
            } else {
              intersectionSize++;
              return f(node1.val, v2, node1.key);
            }
          },
          node2.collision
        )!;
        if (newRoot === node2.collision) {
          return node2;
        } else {
          return { hash: node1.hash, collision: newRoot };
        }
      } else {
        return two(shift, node1, node2);
      }
    } else if ("collision" in node1 && "key" in node2) {
      if (node1.hash === node2.hash) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const newRoot = tree.alter(
          cfg,
          node2.key,
          (v1) => {
            if (v1 === undefined) {
              return node2.val;
            } else {
              intersectionSize++;
              return f(v1, node2.val, node2.key);
            }
          },
          node1.collision
        )!;
        if (newRoot === node1.collision) {
          return node1;
        } else {
          return { hash: node2.hash, collision: newRoot };
        }
      } else {
        return two(shift, node1, node2);
      }
    } else if ("collision" in node1 && "collision" in node2) {
      if (node1.hash === node2.hash) {
        // union of non-empty trees is non-empty
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const newRoot = tree.union(cfg, f, node1.collision, node2.collision)!;
        if (newRoot === node1.collision) {
          return node1;
        } else {
          intersectionSize += node1.collision.size + node2.collision.size - newRoot.size;
          return { hash: node1.hash, collision: newRoot };
        }
      } else {
        return two(shift, node1, node2);
      }
    }

    // Branch vs Branch
    else if ("children" in node1 && "children" in node2) {
      const node1bitmap = node1.bitmap;
      const node2bitmap = node2.bitmap;
      const intersectionBitmap = node1bitmap & node2bitmap;

      // merge the two nodes, but don't create a copy until we find something different between
      // the two nodes.  That is, keep newArr undefined while the union is equal to just node1
      // This is left-biased and will prefer the left-hand node (node1)
      let newArr: Array<HamtNode<K, V>> | undefined = undefined;
      for (
        let mask = 1, node1Idx = 0, node2Idx = 0, remainingBitmap = node1bitmap | node2bitmap;
        remainingBitmap !== 0;
        remainingBitmap &= ~mask, mask <<= 1
      ) {
        if (mask & intersectionBitmap) {
          const newNode = loop(shift + bitsPerSubkey, node1.children[node1Idx], node2.children[node2Idx]);
          if (newArr) {
            // we already have a new array, so just add the new node
            newArr.push(newNode);
          } else if (newNode !== node1.children[node1Idx]) {
            // we don't have a new array yet, but we found a difference, so create one
            newArr = [...node1.children.slice(0, node1Idx), newNode];
          }

          node1Idx++;
          node2Idx++;
        } else if (mask & node1bitmap) {
          if (newArr) {
            newArr.push(node1.children[node1Idx]);
          }
          // if newArr is undefined, just keep it undefined since we haven't found a difference yet
          node1Idx++;
        } else if (mask & node2bitmap) {
          if (newArr) {
            newArr.push(node2.children[node2Idx]);
          } else {
            // copy all the node1 nodes so far and the new node2 node
            newArr = [...node1.children.slice(0, node1Idx), node2.children[node2Idx]];
          }
          node2Idx++;
        }
      }

      if (!newArr) {
        return node1;
      } else {
        return { bitmap: node1bitmap | node2bitmap, children: newArr };
      }
    }

    // Leaf vs Branch
    else if ("children" in node1) {
      // node2 is guaranteed to be leaf or collision, but typescript doesn't know that
      const hash2: number = (node2 as LeafNode<K, V> | CollisionNode<K, V>).hash;
      const node1bitmap = node1.bitmap;
      const oldArr = node1.children;

      let idx: number;
      if (node1bitmap === fullBitmap) {
        idx = fullIndex(hash2, shift);
      } else {
        const m = mask(hash2, shift);
        if (node1bitmap & m) {
          idx = sparseIndex(node1bitmap, m);
        } else {
          // no need to recurse, add directly
          // add the node into the bitmap-indexed node
          const idx = sparseIndex(node1bitmap, m);
          const newArr = [...oldArr.slice(0, idx), node2, ...oldArr.slice(idx)];
          return { bitmap: node1bitmap | m, children: newArr };
        }
      }

      // loop and replace in this node
      const oldChild = oldArr[idx];
      const newNode = loop(shift + bitsPerSubkey, oldChild, node2);
      if (newNode === oldChild) {
        return node1;
      } else {
        const newArr = [...oldArr];
        newArr[idx] = newNode;
        return { bitmap: node1bitmap, children: newArr };
      }
    } else if ("children" in node2) {
      // same as above but with node1 and node2 swapped
      const hash1: number = node1.hash;
      const node2bitmap = node2.bitmap;
      const oldArr = node2.children;

      let idx: number;
      if (node2bitmap === fullBitmap) {
        idx = fullIndex(hash1, shift);
      } else {
        const m = mask(hash1, shift);
        if (node2bitmap & m) {
          idx = sparseIndex(node2bitmap, m);
        } else {
          // no need to recurse, add directly
          // add the node into the bitmap-indexed node
          const idx = sparseIndex(node2bitmap, m);
          const newArr = [...oldArr.slice(0, idx), node1, ...oldArr.slice(idx)];
          return { bitmap: node2bitmap | m, children: newArr };
        }
      }

      // loop and replace in this node
      const oldChild = oldArr[idx];
      const newNode = loop(shift + bitsPerSubkey, node1, oldChild);
      if (newNode === oldChild) {
        return node2;
      } else {
        const newArr = [...oldArr];
        newArr[idx] = newNode;
        return { bitmap: node2bitmap, children: newArr };
      }
    }

    throw new Error("Internal immutable-collections error: union reached invalid node combination");
  }

  const newRoot = loop(0, root1, root2);

  return [newRoot, intersectionSize];
}

export function intersection<K, V>(
  cfg: HashConfig<K>,
  f: (v1: V, v2: V, k: K) => V,
  root1: HamtNode<K, V> | null,
  root2: HamtNode<K, V> | null
): [HamtNode<K, V> | null, number] {
  if (root1 === null) return [null, 0];
  if (root2 === null) return [null, 0];

  let intersectionSize = 0;

  function loop(shift: number, node1: HamtNode<K, V>, node2: HamtNode<K, V>): HamtNode<K, V> | null {
    // Leaf vs anything
    if ("key" in node1) {
      const other = lookup(cfg, node1.key, node2, node1.hash, shift);
      if (other !== undefined) {
        intersectionSize++;
        const newVal = f(node1.val, other, node1.key);
        if (newVal === node1.val) {
          return node1;
        } else {
          return { hash: node1.hash, key: node1.key, val: newVal };
        }
      } else {
        return null;
      }
    } else if ("key" in node2) {
      const other = lookup(cfg, node2.key, node1, node2.hash, shift);
      if (other !== undefined) {
        intersectionSize++;
        const newVal = f(other, node2.val, node2.key);
        if (newVal === node2.val) {
          return node2;
        } else {
          return { hash: node2.hash, key: node2.key, val: newVal };
        }
      } else {
        return null;
      }
    }

    // Collision vs Collision
    else if ("collision" in node1 && "collision" in node2) {
      const newRoot = tree.intersection(cfg, f, node1.collision, node2.collision);
      if (newRoot === node1.collision) {
        intersectionSize += node1.collision.size;
        return node1;
      } else if (newRoot === null) {
        return null;
      } else if (newRoot.size === 1) {
        intersectionSize += 1;
        return { hash: node1.hash, key: newRoot.key, val: newRoot.val };
      } else {
        intersectionSize += newRoot.size;
        return { hash: node1.hash, collision: newRoot };
      }
    }

    // Branch vs Branch
    else if ("children" in node1 && "children" in node2) {
      const node1bitmap = node1.bitmap;
      const node2bitmap = node2.bitmap;
      const intersectionBitmap = node1bitmap & node2bitmap;

      // merge the two nodes, but don't create a copy until we find something different between
      // the two nodes.  That is, keep newArr undefined while the intersection is equal to just node1
      // This is left-biased and will prefer the left-hand node (node1)
      let newArr: Array<HamtNode<K, V>> | undefined = undefined;
      let newBitmap = intersectionBitmap;
      for (
        let mask = 1, node1Idx = 0, node2Idx = 0, remainingBitmap = node1bitmap | node2bitmap;
        remainingBitmap !== 0;
        remainingBitmap &= ~mask, mask <<= 1
      ) {
        if (mask & intersectionBitmap) {
          const newNode = loop(shift + bitsPerSubkey, node1.children[node1Idx], node2.children[node2Idx]);
          if (newArr) {
            // we already have a new array
            if (newNode === null) {
              // take this subtree out of the new Array
              newBitmap &= ~mask;
            } else {
              newArr.push(newNode);
            }
          } else if (newNode !== node1.children[node1Idx]) {
            // we don't have a new array yet, but we found a difference, so create one
            if (newNode === null) {
              newArr = [...node1.children.slice(0, node1Idx)];
              newBitmap &= ~mask;
            } else {
              newArr = [...node1.children.slice(0, node1Idx), newNode];
            }
          }

          node1Idx++;
          node2Idx++;
        } else if (mask & node1bitmap) {
          if (!newArr) {
            // need to delete this node from the new array
            newArr = [...node1.children.slice(0, node1Idx)];
          }
          // newBitmap is already 0 at this mask since we are not in the intersection
          node1Idx++;
        } else if (mask & node2bitmap) {
          // ignore this part of the tree, is not intersecting node1
          node2Idx++;
        }
      }

      if (!newArr) {
        return node1;
      } else if (newArr.length === 0) {
        return null;
      } else if (newArr.length === 1) {
        return hasSingleLeafOrCollision(newArr[0]) ?? { bitmap: newBitmap, children: newArr };
      } else {
        return { bitmap: newBitmap, children: newArr };
      }
    }

    //  Branch vs Collision
    else if ("children" in node1) {
      // node2 is guaranteed to be collision, but typescript doesn't know that
      const hash2: number = (node2 as CollisionNode<K, V>).hash;
      const node1bitmap = node1.bitmap;

      // find the index where hash2 will live (if any)
      let idx: number;
      if (node1bitmap === fullBitmap) {
        idx = fullIndex(hash2, shift);
      } else {
        const m = mask(hash2, shift);
        if (m & node1bitmap) {
          idx = sparseIndex(node1bitmap, m);
        } else {
          return null;
        }
      }

      // whatever the intersection is, everything else in the children array is thrown away
      return loop(shift + bitsPerSubkey, node1.children[idx], node2);
    }

    // Collision vs Branch
    else if ("children" in node2) {
      const hash1: number = node1.hash;
      const node2bitmap = node2.bitmap;

      // find the index where hash1 will live (if any)
      let idx: number;
      if (node2bitmap === undefined) {
        idx = fullIndex(hash1, shift);
      } else {
        const m = mask(hash1, shift);
        if (m & node2bitmap) {
          idx = sparseIndex(node2bitmap, m);
        } else {
          return null;
        }
      }

      // whatever the intersection is, everything else in the children array is thrown away
      return loop(shift + bitsPerSubkey, node1, node2.children[idx]);
    }

    throw new Error("Internal immutable-collections error: intersection reached invalid node combination");
  }

  const newRoot = loop(0, root1, root2);

  return [newRoot, intersectionSize];
}

export function difference<K, V1, V2>(
  cfg: HashConfig<K>,
  root1: HamtNode<K, V1> | null,
  root2: HamtNode<K, V2> | null
): readonly [HamtNode<K, V1> | null, number] {
  if (root2 === null) return [root1, 0];
  if (root1 === null) return [null, 0];

  let numRemoved = 0;

  function loop(shift: number, node1: HamtNode<K, V1>, node2: HamtNode<K, V2>): HamtNode<K, V1> | null {
    if ("key" in node1) {
      const has = lookup(cfg, node1.key, node2, node1.hash, shift);
      if (has === undefined) {
        // keep the key/val in the first tree
        return node1;
      } else {
        numRemoved += 1;
        return null;
      }
    } else if ("key" in node2) {
      // take node2.key out of the first tree
      const newRoot = remove(cfg, node2.key, node1, node2.hash, shift);
      if (newRoot === node1) {
        return node1;
      } else {
        numRemoved += 1;
        return newRoot;
      }
    }

    // Branch vs Branch
    else if ("children" in node1 && "children" in node2) {
      const node1bitmap = node1.bitmap;
      const node2bitmap = node2.bitmap;
      const intersectionBitmap = node1bitmap & node2bitmap;

      // merge the two nodes, but don't create a copy until we find something to remove
      let newArr: Array<HamtNode<K, V1>> | undefined = undefined;
      let newBitmap = node1bitmap;
      for (
        let mask = 1, node1Idx = 0, node2Idx = 0, remainingBitmap = node1bitmap;
        remainingBitmap !== 0;
        remainingBitmap &= ~mask, mask <<= 1
      ) {
        if (mask & intersectionBitmap) {
          const newNode = loop(shift + bitsPerSubkey, node1.children[node1Idx], node2.children[node2Idx]);
          if (newArr) {
            // we already have a new array
            if (newNode === null) {
              // take this subtree out of the new Array
              newBitmap &= ~mask;
            } else {
              newArr.push(newNode);
            }
          } else if (newNode !== node1.children[node1Idx]) {
            // we don't have a new array yet, but we found a difference, so create one
            if (newNode === null) {
              newArr = [...node1.children.slice(0, node1Idx)];
              newBitmap &= ~mask;
            } else {
              newArr = [...node1.children.slice(0, node1Idx), newNode];
            }
          }

          node1Idx++;
          node2Idx++;
        } else if (mask & node1bitmap) {
          // copy this part of the tree unchanged
          if (newArr) {
            newArr.push(node1.children[node1Idx]);
          }
          node1Idx++;
        } else if (mask & node2bitmap) {
          // ignore this part of the tree, is not intersecting node1
          node2Idx++;
        }
      }

      if (!newArr) {
        return node1;
      } else if (newArr.length === 0) {
        return null;
      } else if (newArr.length === 1) {
        return hasSingleLeafOrCollision(newArr[0]) ?? { bitmap: newBitmap, children: newArr };
      } else {
        return { bitmap: newBitmap, children: newArr };
      }
    }

    // Collision vs Collision
    else if ("collision" in node1 && "collision" in node2) {
      const newTree = tree.difference(cfg, node1.collision, node2.collision);
      if (newTree === null) {
        numRemoved += node1.collision.size;
        return null;
      } else if (newTree.size === 1) {
        numRemoved += node1.collision.size - 1;
        return { hash: node1.hash, key: newTree.key, val: newTree.val };
      } else if (newTree === node1.collision) {
        return node1;
      } else {
        numRemoved += node1.collision.size - newTree.size;
        return { hash: node1.hash, collision: newTree };
      }
    }

    // Branch vs Collision
    else if ("children" in node1) {
      // node2 is guaranteed to be collision, but typescript doesn't know that
      const hash2: number = (node2 as CollisionNode<K, V2>).hash;
      const node1bitmap = node1.bitmap;

      // find where node2 would appear as a child of node1
      let idx: number;
      let m: number;
      if (node1bitmap === fullBitmap) {
        idx = fullIndex(hash2, shift);
        m = 1 << idx;
      } else {
        m = mask(hash2, shift);
        if (node1bitmap & m) {
          idx = sparseIndex(node1bitmap, m);
        } else {
          // no need to recurse, node2 doesn't overlap node1
          return node1;
        }
      }

      // loop and replace in this node
      const oldArr = node1.children;
      const oldChild = oldArr[idx];
      const newNode = loop(shift + bitsPerSubkey, oldChild, node2);
      if (newNode === oldChild) {
        return node1;
      } else if (newNode === null) {
        // delete this child
        if (oldArr.length === 1) {
          return null;
        } else if (oldArr.length === 2) {
          const other = oldArr[1 - idx];
          return hasSingleLeafOrCollision(other) ?? { bitmap: node1bitmap & ~m, children: [other] };
        } else {
          const newArr = [...oldArr.slice(0, idx), ...oldArr.slice(idx + 1)];
          return { bitmap: node1bitmap & ~m, children: newArr };
        }
      } else {
        // replace child with new child
        const newArr = [...oldArr];
        newArr[idx] = newNode;
        return { bitmap: node1bitmap, children: newArr };
      }
    }

    // Collision vs Branch
    else {
      const hash1: number = node1.hash;
      // node2 is guaranteed to be branch, but typescript doesn't know that
      const node2int = node2 as InternalNode<K, V2>;
      const node2bitmap = node2int.bitmap;

      // find the index where hash1 will live (if any)
      let idx: number;
      if (node2bitmap === undefined) {
        idx = fullIndex(hash1, shift);
      } else {
        const m = mask(hash1, shift);
        if (m & node2bitmap) {
          idx = sparseIndex(node2bitmap, m);
        } else {
          return null;
        }
      }

      // whatever the difference is, everything else in node2 is ignored
      return loop(shift + bitsPerSubkey, node1, node2int.children[idx]);
    }
  }

  return [loop(0, root1, root2), numRemoved];
}

export function adjust<K, V1, V2>(
  cfg: HashConfig<K>,
  f: (v1: V1 | undefined, v2: V2, k: K) => V1 | undefined,
  root1: HamtNode<K, V1> | null,
  root2: HamtNode<K, V2> | null
): readonly [HamtNode<K, V1> | null, number] {
  if (root2 === null) return [root1, 0];
  if (root1 === null) {
    const [newRoot, newSize] = collectValues(root2, fWithUndefined, false);
    return [newRoot, -newSize];
  }

  function fWithUndefined(v: V2, k: K): V1 | undefined {
    return f(undefined, v, k);
  }

  let numRemoved = 0;
  function loop(shift: number, node1: HamtNode<K, V1>, node2: HamtNode<K, V2>): HamtNode<K, V1> | null {
    if ("key" in node1 && "key" in node2) {
      if (node1.hash === node2.hash) {
        const cmp = cfg.compare(node1.key, node2.key);
        if (cmp === 0) {
          const newVal = f(node1.val, node2.val, node1.key);
          if (newVal === undefined) {
            numRemoved += 1;
            return null;
          } else if (newVal === node1.val) {
            return node1;
          } else {
            return { hash: node1.hash, key: node1.key, val: newVal };
          }
        } else {
          // collision
          const newVal = f(undefined, node2.val, node2.key);
          if (newVal === undefined) {
            return node1;
          } else {
            numRemoved -= 1;
            return { hash: node1.hash, collision: tree.two(cmp, node1.key, node1.val, node2.key, newVal) };
          }
        }
      } else {
        // hashes are different, create a second leaf if required
        const newVal = f(undefined, node2.val, node2.key);
        if (newVal === undefined) {
          return node1;
        } else {
          numRemoved -= 1;
          return two(shift, node1, { hash: node2.hash, key: node2.key, val: newVal });
        }
      }
    } else if ("collision" in node1 && "key" in node2) {
      if (node1.hash === node2.hash) {
        const newCol1 = tree.alter(cfg, node2.key, (oldV) => f(oldV, node2.val, node2.key), node1.collision);
        if (newCol1 === node1.collision) {
          return node1;
        } else if (newCol1 === null) {
          numRemoved += node1.collision.size;
          return null;
        } else if (newCol1.size === 1) {
          numRemoved += node1.collision.size - 1;
          return { hash: node1.hash, key: newCol1.key, val: newCol1.val };
        } else {
          numRemoved += node1.collision.size - newCol1.size;
          return { hash: node1.hash, collision: newCol1 };
        }
      } else {
        const newVal = f(undefined, node2.val, node2.key);
        if (newVal === undefined) {
          return node1;
        } else {
          numRemoved -= 1;
          return two(shift, node1, { hash: node2.hash, key: node2.key, val: newVal });
        }
      }
    } else if ("key" in node1 && "collision" in node2) {
      if (node1.hash === node2.hash) {
        const newCol = tree.adjust(
          cfg,
          f,
          { key: node1.key, val: node1.val, size: 1, left: null, right: null },
          node2.collision
        );
        if (newCol === null) {
          numRemoved += 1;
          return null;
        } else if ((newCol as unknown) === (node2.collision as unknown)) {
          numRemoved += 1 - node2.collision.size;
          return node2 as unknown as HamtNode<K, V1>;
        } else {
          numRemoved += 1 - newCol.size;
          return { hash: node1.hash, collision: newCol };
        }
      } else {
        const newTree = tree.collectValues(fWithUndefined, false, node2.collision);
        if (newTree === null) {
          return node1;
        } else if (newTree.size === 1) {
          numRemoved -= 1;
          return two(shift, node1, { hash: node2.hash, key: newTree.key, val: newTree.val });
        } else {
          numRemoved -= newTree.size;
          return two(shift, node1, { hash: node2.hash, collision: newTree });
        }
      }
    } else if ("collision" in node1 && "collision" in node2) {
      if (node1.hash === node2.hash) {
        const newTree = tree.adjust(cfg, f, node1.collision, node2.collision);
        if (newTree === null) {
          numRemoved += node1.collision.size;
          return null;
        } else if (newTree === node1.collision) {
          return node1;
        } else if (newTree.size === 1) {
          numRemoved += node1.collision.size - 1;
          return { hash: node1.hash, key: newTree.key, val: newTree.val };
        } else {
          numRemoved += node1.collision.size - newTree.size;
          return { hash: node1.hash, collision: newTree };
        }
      } else {
        const newTree = tree.collectValues(fWithUndefined, false, node2.collision);
        if (newTree === null) {
          return node1;
        } else if (newTree.size === 1) {
          numRemoved -= 1;
          return two(shift, node1, { hash: node2.hash, key: newTree.key, val: newTree.val });
        } else {
          numRemoved -= newTree.size;
          return two(shift, node1, { hash: node2.hash, collision: newTree });
        }
      }
    }

    // Branch vs Branch
    else if ("children" in node1 && "children" in node2) {
      const node1bitmap = node1.bitmap;
      const node2bitmap = node2.bitmap;
      const intersectionBitmap = node1bitmap & node2bitmap;

      // merge the two nodes, but don't create a copy until we find something different between
      // the two nodes.  That is, keep newArr undefined while the union is equal to just node1
      // This is left-biased and will prefer the left-hand node (node1)
      let newArr: Array<HamtNode<K, V1>> | undefined = undefined;
      let newBitmap = node1bitmap;
      for (
        let mask = 1, node1Idx = 0, node2Idx = 0, remainingBitmap = node1bitmap | node2bitmap;
        remainingBitmap !== 0;
        remainingBitmap &= ~mask, mask <<= 1
      ) {
        if (mask & intersectionBitmap) {
          const newNode = loop(shift + bitsPerSubkey, node1.children[node1Idx], node2.children[node2Idx]);

          if (newArr) {
            // we already have a new array
            if (newNode === null) {
              // take this subtree out of the new Array
              newBitmap &= ~mask;
            } else {
              newArr.push(newNode);
            }
          } else if (newNode !== node1.children[node1Idx]) {
            // we don't have a new array yet, but we found a difference, so create one
            if (newNode === null) {
              newArr = [...node1.children.slice(0, node1Idx)];
              newBitmap &= ~mask;
            } else {
              newArr = [...node1.children.slice(0, node1Idx), newNode];
            }
          }

          node1Idx++;
          node2Idx++;
        } else if (mask & node1bitmap) {
          // copy unchanged
          if (newArr) {
            newArr.push(node1.children[node1Idx]);
          }
          node1Idx++;
        } else if (mask & node2bitmap) {
          const [newChild, newSize] = collectValues(node2.children[node2Idx], fWithUndefined, false);
          if (newChild !== null) {
            numRemoved -= newSize;
            // add the new child into the new node1
            newBitmap |= mask;
            if (newArr) {
              newArr.push(newChild);
            } else {
              // copy all the node1 nodes so far and the new child
              newArr = [...node1.children.slice(0, node1Idx), newChild];
            }
          }
          node2Idx++;
        }
      }

      if (!newArr) {
        return node1;
      } else if (newArr.length === 0) {
        return null;
      } else if (newArr.length === 1) {
        return hasSingleLeafOrCollision(newArr[0]) ?? { bitmap: newBitmap, children: newArr };
      } else {
        return { bitmap: newBitmap, children: newArr };
      }
    }

    //  Branch vs Leaf or Collision
    else if ("children" in node1) {
      // node2 is guaranteed to be leaf or collision, but typescript doesn't know that
      const node2leaf = node2 as LeafNode<K, V2> | CollisionNode<K, V2>;
      const hash2: number = node2leaf.hash;
      const node1bitmap = node1.bitmap;

      let idx: number;
      let m: number;
      if (node1bitmap === fullBitmap) {
        idx = fullIndex(hash2, shift);
        m = 1 << idx;
      } else {
        m = mask(hash2, shift);
        idx = sparseIndex(node1bitmap, m);
      }

      if (node1bitmap & m) {
        // loop on the node1 child and node2, and then update the node1 with the result
        const oldArr = node1.children;
        const oldChild = oldArr[idx];
        const newNode = loop(shift + bitsPerSubkey, oldChild, node2);
        if (newNode === null) {
          // delete this child
          if (oldArr.length === 1) {
            return null;
          } else if (oldArr.length === 2) {
            const other = oldArr[1 - idx];
            return hasSingleLeafOrCollision(other) ?? { bitmap: node1bitmap & ~m, children: [other] };
          } else {
            const newArr = [...oldArr.slice(0, idx), ...oldArr.slice(idx + 1)];
            return { bitmap: node1bitmap & ~m, children: newArr };
          }
        } else if (newNode === oldChild) {
          return node1;
        } else {
          const newArr = [...oldArr];
          newArr[idx] = newNode;
          return { bitmap: node1bitmap, children: newArr };
        }
      } else {
        // missing in node1, so check if adding a new child for the node2
        const idx = sparseIndex(node1bitmap, m);
        const [newChild, newSize] = collectValues(node2leaf, fWithUndefined, false);
        if (newChild !== null) {
          numRemoved -= newSize;
          const oldArr = node1.children;
          const newArr = [...oldArr.slice(0, idx), newChild, ...oldArr.slice(idx)];
          return { bitmap: node1bitmap | m, children: newArr };
        } else {
          return node1;
        }
      }
    }

    // Leaf or Collision vs Branch
    else {
      // we need to loop through the children of node2, and for the spot where node1 lives recurse and
      // for the other children of node2, just collect with fWithUndefined
      const node2int = node2 as InternalNode<K, V2>;
      const hash1 = node1.hash;
      const mask1 = mask(hash1, shift);
      const node2bitmap = node2int.bitmap;

      let newArr: Array<HamtNode<K, V1>> | undefined = undefined;
      let newBitmap = node2bitmap;
      for (
        let mask = 1, node2Idx = 0, remainingBitmap = node2bitmap | mask1;
        remainingBitmap !== 0;
        remainingBitmap &= ~mask, mask <<= 1
      ) {
        if (mask & node2bitmap) {
          let newChild: HamtNode<K, V1> | null;
          if (mask & mask1) {
            // loop on the node1 and node2 child
            newChild = loop(shift + bitsPerSubkey, node1, node2int.children[node2Idx]);
          } else {
            let newSize: number;
            [newChild, newSize] = collectValues(node2int.children[node2Idx], fWithUndefined, false);
            numRemoved -= newSize;
          }
          if (newArr) {
            // we already have a new array
            if (newChild === null) {
              // take this subtree out of the new Array
              newBitmap &= ~mask;
            } else {
              newArr.push(newChild);
            }
          } else if ((newChild as unknown) !== node2int.children[node2Idx]) {
            // we don't have a new array yet, but we found a difference, so create one
            // if node2Idx > 0 and newArr is undefined, we must have had a previous value === and therefore
            // know that V1 is the same type as V2, but typescript does not know that
            if (newChild === null) {
              newArr = [...(node2int.children.slice(0, node2Idx) as unknown as ReadonlyArray<HamtNode<K, V1>>)];
              newBitmap &= ~mask;
            } else {
              newArr = [
                ...(node2int.children.slice(0, node2Idx) as unknown as ReadonlyArray<HamtNode<K, V1>>),
                newChild,
              ];
            }
          }

          node2Idx++;
        } else if (mask & mask1) {
          // insert node1 into the new bitmap-indexed node
          newBitmap |= mask;
          if (newArr) {
            newArr.push(node1);
          } else {
            // if node2Idx > 0 and newArr is undefined, we must have had a previous value === and therefore
            // know that V1 is the same type as V2, but typescript does not know that
            newArr = [...(node2int.children.slice(0, node2Idx) as unknown as ReadonlyArray<HamtNode<K, V1>>), node1];
          }
        }
      }

      if (!newArr) {
        // if newArr is undefined, we know that V1 is the same as V2.
        return node2 as unknown as HamtNode<K, V1>;
      } else if (newArr.length === 0) {
        return null;
      } else if (newArr.length === 1) {
        return hasSingleLeafOrCollision(newArr[0]) ?? { bitmap: newBitmap, children: newArr };
      } else {
        return { bitmap: newBitmap, children: newArr };
      }
    }
  }

  return [loop(0, root1, root2), numRemoved];
}
