/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { HashConfig } from "./hashing";

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
keys hash to the same value, we store a collision array.
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
  readonly collision: ReadonlyArray<{ readonly key: K; readonly val: V }>;
};
export type MutableCollisionNode<K, V> = {
  readonly hash: number;
  readonly collision: Array<{ readonly key: K; val: V }>;
};

export type InternalNode<K, V> = {
  readonly children: ReadonlyArray<HamtNode<K, V>>;

  // If bitmap is present, the node is missing some children.  Which children are present is specified in the bitmap and then
  // all present children are stored in the array.
  readonly bitmap?: number;
};
export type MutableInternalNode<K, V> = {
  readonly children: Array<MutableHamtNode<K, V>>;
  bitmap?: number;
};
type MutableSpineInternalNode<K, V> = {
  readonly children: Array<HamtNode<K, V>>;
  bitmap?: number;
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

export function lookup<K, V>(
  cfg: HashConfig<K>,
  hash: number,
  shift: number,
  k: K,
  rootNode: HamtNode<K, V>
): V | undefined {
  let node = rootNode;
  do {
    if ("children" in node) {
      if (node.bitmap) {
        const m = mask(hash, shift);
        if ((node.bitmap & m) === 0) {
          return undefined;
        } else {
          // recurse
          node = node.children[sparseIndex(node.bitmap, m)];
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
        const arr = node.collision;
        for (let i = 0, len = arr.length; i < len; i++) {
          const n = arr[i];
          if (cfg.compare(k, n.key) === 0) {
            return n.val;
          }
        }
        return undefined;
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

// Copy the array and splice a single element in at the given index
function copyAndInsertToArray<T>(arr: ReadonlyArray<T>, newIdx: number, newT: T): Array<T> {
  const len = arr.length;
  const out = new Array<T>(len + 1);
  for (let i = 0; i < newIdx; i++) {
    out[i] = arr[i];
  }
  out[newIdx] = newT;
  for (let i = newIdx; i < len; i++) {
    out[i + 1] = arr[i];
  }
  return out;
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
      if (curNode.bitmap) {
        const m = mask(hash, shift);
        idx = sparseIndex(curNode.bitmap, m);

        if ((curNode.bitmap & m) === 0) {
          // child is not present in the bitmap so can be added as a leaf

          // create the new node
          const leaf = { hash, key: k, val: getVal(undefined) };
          const newArr = copyAndInsertToArray(curNode.children, idx, leaf);
          let newNode: HamtNode<K, V>;
          if (newArr.length === maxChildren) {
            newNode = { children: newArr };
          } else {
            newNode = { bitmap: curNode.bitmap | m, children: newArr };
          }

          // set it in the parent and return
          if (parent !== undefined) {
            parent[parentIdx] = newNode;
          }
          return [newRoot ?? newNode, true];
        }
        // if we get here, the child is present in the bitmap, so we need to recurse
        copyOfNode = { bitmap: curNode.bitmap, children: [...curNode.children] };
      } else {
        idx = fullIndex(hash, shift);
        copyOfNode = { children: [...curNode.children] };
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
        if (cfg.compare(k, curNode.key) === 0) {
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
            collision: [
              { key: k, val: getVal(undefined) },
              { key: curNode.key, val: curNode.val },
            ],
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
        for (let i = 0, collision = curNode.collision, len = collision.length; i < len; i++) {
          const c = collision[i];
          if (cfg.compare(k, c.key) === 0) {
            const newVal = getVal(c.val);
            if (c.val === newVal) {
              // return the original root node because nothing changed
              return [rootNode, false];
            }
            // create a copy of the collision node
            const newArr = [...collision];
            newArr[i] = { key: k, val: newVal };
            newNode = { hash, collision: newArr };
            inserted = false;
            break;
          }
        }
        if (newNode === undefined) {
          // node not in the collision list, add it
          newNode = { hash, collision: [{ key: k, val: getVal(undefined) }, ...curNode.collision] };
        }
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
      if (curNode.bitmap) {
        const m = mask(hash, shift);
        idx = sparseIndex(curNode.bitmap, m);

        if ((curNode.bitmap & m) === 0) {
          // child is not present in the bitmap so can be added as a leaf

          const leaf = { hash, key: k, val: getVal(undefined, t) };
          const arr = curNode.children;
          arr.splice(idx, 0, leaf);
          if (arr.length === maxChildren) {
            // switch to a full node
            delete curNode.bitmap;
          } else {
            curNode.bitmap |= m;
          }
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
        if (cfg.compare(k, curNode.key) === 0) {
          // replace the value
          curNode.val = getVal(curNode.val, t);
          return rootNode;
        } else {
          // a collision
          newNode = {
            hash,
            collision: [
              { key: k, val: getVal(undefined, t) },
              { key: curNode.key, val: curNode.val },
            ],
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
        // check if already in current collision node
        for (let i = 0, collision = curNode.collision, len = collision.length; i < len; i++) {
          const c = collision[i];
          if (cfg.compare(k, c.key) === 0) {
            // replace the value
            c.val = getVal(c.val, t);
            return rootNode;
          }
        }
        // need to extend the collision node
        curNode.collision.unshift({ key: k, val: getVal(undefined, t) });
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

function removeChildFromEndOfSpine<K, V>(spine: ReadonlyArray<MutableSpineNode<K, V>>, hash: number): HamtNode<K, V> {
  // remove the node pointed to by the last spine entry
  // there are three cases:
  // - a full node is transitioned to a bitmap indexed node
  // - the opposite of the two function above: if the removal results in a chain of single-child
  //   bitmap-indexed nodes ending at a single leaf, the whole chain of nodes is removed
  //  - a bitmap-indexed node which is not in such a chain just has the child removed
  // Returns the new root node for the whole tree

  const last = spine[spine.length - 1];
  if (!last.node.bitmap) {
    // transform the full node into a bitmap node
    const arr = last.node.children;
    arr.splice(last.childIdx, 1);
    const bitmap = ~(1 << last.childIdx);
    if (spine.length === 1) {
      return { bitmap, children: arr };
    } else {
      const n = spine[spine.length - 2];
      n.node.children[n.childIdx] = { bitmap, children: arr };
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
  last.node.bitmap &= ~mask(hash, bitsPerSubkey * (spine.length - 1));
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

function copyAndRemoveFromArray<T>(arr: ReadonlyArray<T>, idx: number): Array<T> {
  return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
}

export function remove<K, V>(cfg: HashConfig<K>, k: K, rootNode: HamtNode<K, V> | null): HamtNode<K, V> | null {
  if (rootNode === null) {
    return null;
  }

  const hash = cfg.hash(k);

  const spine: Array<MutableSpineNode<K, V>> = [];

  let shift = 0;
  let curNode = rootNode;

  do {
    if ("children" in curNode) {
      let idx: number;
      if (curNode.bitmap) {
        const m = mask(hash, shift);
        if ((curNode.bitmap & m) === 0) {
          // element is not present
          return rootNode;
        } else {
          // recurse
          idx = sparseIndex(curNode.bitmap, m);
        }
      } else {
        idx = fullIndex(hash, shift);
      }

      // create a new node
      const newNode = { bitmap: curNode.bitmap, children: [...curNode.children] };
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
            return removeChildFromEndOfSpine(spine, hash);
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
        for (let i = 0, collision = curNode.collision, len = collision.length; i < len; i++) {
          if (cfg.compare(k, collision[i].key) === 0) {
            let newNode: HamtNode<K, V>;
            if (collision.length === 2) {
              // switch back to a leaf node
              const other = i === 0 ? 1 : 0;
              newNode = { hash, key: collision[other].key, val: collision[other].val };
            } else {
              newNode = { hash, collision: copyAndRemoveFromArray(collision, i) };
            }
            if (spine.length > 0) {
              const n = spine[spine.length - 1];
              n.node.children[n.childIdx] = newNode;
              return spine[0].node;
            } else {
              return newNode;
            }
          }
        }
        return rootNode;
      } else {
        // hashes are different, no match
        return rootNode;
      }
    }
  } while (curNode);

  throw new Error("Internal immutable-collections violation: hamt remove reached null");
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
      for (let i = 0, len = node.collision.length; i < len; i++) {
        const x = node.collision[i];
        yield f(x.key, x.val);
      }
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
      for (let i = 0, len = node.collision.length; i < len; i++) {
        const x = node.collision[i];
        acc = f(acc, x.key, x.val);
      }
    }
  }
  return acc;
}

export function mapValues<K, V>(root: HamtNode<K, V> | null, f: (v: V, k: K) => V): HamtNode<K, V> | null {
  if (root === null) return null;

  function loop(node: HamtNode<K, V>): HamtNode<K, V> {
    if ("children" in node) {
      let newArr: Array<HamtNode<K, V>> | undefined = undefined;
      for (let i = 0, arr = node.children, len = arr.length; i < len; i++) {
        const n = arr[i];
        const newN = loop(n);
        if (!newArr) {
          if (n !== newN) {
            newArr = [...arr.slice(0, i), newN];
          }
        } else {
          newArr.push(newN);
        }
      }
      if (newArr) {
        if (newArr.length === maxChildren) {
          return { children: newArr };
        } else {
          return { bitmap: node.bitmap, children: newArr };
        }
      } else {
        return node;
      }
    } else if ("key" in node) {
      const newVal = f(node.val, node.key);
      if (node.val !== newVal) {
        return { hash: node.hash, key: node.key, val: newVal };
      } else {
        return node;
      }
    } else {
      let newArr: Array<{ readonly key: K; readonly val: V }> | undefined = undefined;
      for (let i = 0, arr = node.collision, len = arr.length; i < len; i++) {
        const n = arr[i];
        const newV = f(n.val, n.key);
        if (!newArr) {
          if (n.val !== newV) {
            newArr = [...arr.slice(0, i), { key: n.key, val: newV }];
          }
        } else {
          if (n.val !== newV) {
            newArr.push({ key: n.key, val: newV });
          } else {
            newArr.push(n);
          }
        }
      }
      if (newArr) {
        return { hash: node.hash, collision: newArr };
      } else {
        return node;
      }
    }
  }

  return loop(root);
}

export function collectValues<K, V>(
  root: HamtNode<K, V> | null,
  f: (v: V, k: K) => V | undefined,
  filterNull: boolean
): [HamtNode<K, V> | null, number] {
  if (root === null) return [null, 0];

  let newSize = 0;
  function loop(node: HamtNode<K, V>): HamtNode<K, V> | null {
    if ("children" in node) {
      const origBitmap = node.bitmap ?? fullBitmap;
      let newArr: Array<HamtNode<K, V>> | undefined = undefined;
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
              if (n !== newN) {
                newArr = [...node.children.slice(0, idx), newN];
              }
            } else {
              // filter out the value
              newArr = [...node.children.slice(0, idx)];
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
        } else if (newArr.length === maxChildren) {
          return { children: newArr };
        } else {
          return { bitmap: newBitmap, children: newArr };
        }
      } else {
        return node;
      }
    } else if ("key" in node) {
      const newVal = f(node.val, node.key);
      if (newVal === undefined || (filterNull && newVal === null)) {
        return null;
      } else if (node.val !== newVal) {
        newSize++;
        return { hash: node.hash, key: node.key, val: newVal };
      } else {
        newSize++;
        return node;
      }
    } else {
      let newArr: Array<{ readonly key: K; readonly val: V }> | undefined = undefined;
      for (let i = 0, arr = node.collision, len = arr.length; i < len; i++) {
        const n = arr[i];
        const newV = f(n.val, n.key);
        if (!newArr) {
          // check if we need to create a copy of the node
          if (newV === undefined || (filterNull && newV === null)) {
            // filter out the value
            newArr = [...arr.slice(0, i)];
          } else {
            newSize++;
            if (n.val !== newV) {
              newArr = [...arr.slice(0, i), { key: n.key, val: newV }];
            }
          }
        } else {
          // an earlier node was modified so we copied the node, add or filter the new value
          if (newV === undefined || (filterNull && newV === null)) {
            // do nothing, element will be filtered
          } else {
            newSize++;
            if (n.val !== newV) {
              newArr.push({ key: n.key, val: newV });
            } else {
              newArr.push(n);
            }
          }
        }
      }
      if (newArr) {
        if (newArr.length === 0) {
          return null;
        } else if (newArr.length === 1) {
          // switch from collision back to just a leaf
          return { hash: node.hash, key: newArr[0].key, val: newArr[0].val };
        } else {
          return { hash: node.hash, collision: newArr };
        }
      } else {
        return node;
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
        if (cfg.compare(node1.key, node2.key) === 0) {
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
            collision: [
              { key: node1.key, val: node1.val },
              { key: node2.key, val: node2.val },
            ],
          };
        }
      } else {
        return two(shift, node1, node2);
      }
    } else if ("key" in node1 && "collision" in node2) {
      if (node1.hash === node2.hash) {
        for (let i = 0, arr = node2.collision, len = arr.length; i < len; i++) {
          const n = arr[i];
          if (cfg.compare(node1.key, n.key) === 0) {
            intersectionSize++;
            const newVal = f(node1.val, n.val, n.key);
            if (newVal === n.val) {
              // no change needed
              return node2;
            } else {
              // replace the value in the collision array
              const newArr = [...arr];
              newArr[i] = { key: n.key, val: newVal };
              return { hash: node1.hash, collision: newArr };
            }
          }
        }
        // not found, add node1 to collision
        return { hash: node1.hash, collision: [{ key: node1.key, val: node1.val }, ...node2.collision] };
      } else {
        return two(shift, node1, node2);
      }
    } else if ("collision" in node1 && "key" in node2) {
      if (node1.hash === node2.hash) {
        for (let i = 0, arr = node1.collision, len = arr.length; i < len; i++) {
          const n = arr[i];
          if (cfg.compare(n.key, node2.key) === 0) {
            intersectionSize++;
            const newVal = f(n.val, node2.val, n.key);
            if (newVal === n.val) {
              // no change needed
              return node1;
            } else {
              const newArr = [...arr];
              newArr[i] = { key: n.key, val: newVal };
              return { hash: node1.hash, collision: newArr };
            }
          }
        }
        return { hash: node1.hash, collision: [...node1.collision, { key: node2.key, val: node2.val }] };
      } else {
        return two(shift, node1, node2);
      }
    } else if ("collision" in node1 && "collision" in node2) {
      if (node1.hash === node2.hash) {
        const newArr = [...node1.collision];
        // when checking duplicates, only need to check newArr up to origNode1ColLength even
        // if more collisions are added to to the array
        const origNode1ColLength = newArr.length;
        let modifiedNode1Col = false;
        for (let i = 0, node2col = node2.collision, node2len = node2col.length; i < node2len; i++) {
          const node2entry = node2col[i];
          let found = false;
          for (let j = 0; j < origNode1ColLength; j++) {
            const existing1 = newArr[j];
            if (cfg.compare(existing1.key, node2entry.key) === 0) {
              intersectionSize++;
              const newVal = f(existing1.val, node2entry.val, node2entry.key);
              if (newVal !== existing1.val) {
                modifiedNode1Col = true;
                newArr[j] = { key: node2entry.key, val: newVal };
              }
              found = true;
              break;
            }
          }
          if (!found) {
            modifiedNode1Col = true;
            newArr.push(node2entry);
          }
        }
        if (modifiedNode1Col) {
          return { hash: node1.hash, collision: newArr };
        } else {
          return node1;
        }
      } else {
        return two(shift, node1, node2);
      }
    }

    // Branch vs Branch
    else if ("children" in node1 && "children" in node2) {
      const node1bitmap = node1.bitmap ?? fullBitmap;
      const node2bitmap = node2.bitmap ?? fullBitmap;
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
      } else if (newArr.length === maxChildren) {
        return { children: newArr };
      } else {
        return { bitmap: node1bitmap | node2bitmap, children: newArr };
      }
    }

    // Leaf vs Branch
    else if ("children" in node1) {
      // node2 is guaranteed to be leaf or collision, but typescript doesn't know that
      const hash2: number = (node2 as LeafNode<K, V> | CollisionNode<K, V>).hash;

      if (node1.bitmap === undefined) {
        // loop and replace in this full node
        const idx = fullIndex(hash2, shift);
        const newNode = loop(shift + bitsPerSubkey, node1.children[idx], node2);
        if (newNode === node1.children[idx]) {
          return node1;
        } else {
          const newArr = [...node1.children];
          newArr[idx] = newNode;
          return { children: newArr };
        }
      }

      const m = mask(hash2, shift);
      if (node1.bitmap & m) {
        // loop and replace in this bitmap-indexed node
        const idx = sparseIndex(node1.bitmap, m);
        const newNode = loop(shift + bitsPerSubkey, node1.children[idx], node2);
        if (newNode === node1.children[idx]) {
          return node1;
        } else {
          const newArr = [...node1.children];
          newArr[idx] = newNode;
          return { bitmap: node1.bitmap, children: newArr };
        }
      } else {
        // add the node into the bitmap-indexed node
        const idx = sparseIndex(node1.bitmap, m);
        const newArr = copyAndInsertToArray(node1.children, idx, node2);
        if (newArr.length === maxChildren) {
          return { children: newArr };
        } else {
          return { bitmap: node1.bitmap | m, children: newArr };
        }
      }
    } else if ("children" in node2) {
      // same as above but with node1 and node2 swapped
      const hash1: number = node1.hash;

      if (node2.bitmap === undefined) {
        const idx = fullIndex(hash1, shift);
        const newNode = loop(shift + bitsPerSubkey, node1, node2.children[idx]);
        if (newNode === node2.children[idx]) {
          return node2;
        } else {
          const newArr = [...node2.children];
          newArr[idx] = newNode;
          return { children: newArr };
        }
      }

      const m = mask(hash1, shift);
      if (node2.bitmap & m) {
        const idx = sparseIndex(node2.bitmap, m);
        const newNode = loop(shift + bitsPerSubkey, node1, node2.children[idx]);
        if (newNode === node2.children[idx]) {
          return node2;
        } else {
          const newArr = [...node2.children];
          newArr[idx] = newNode;
          return { bitmap: node2.bitmap, children: newArr };
        }
      } else {
        const idx = sparseIndex(node2.bitmap, m);
        const newArr = copyAndInsertToArray(node2.children, idx, node1);
        if (newArr.length === maxChildren) {
          return { children: newArr };
        } else {
          return { bitmap: node2.bitmap | m, children: newArr };
        }
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
      const other = lookup(cfg, node1.hash, shift, node1.key, node2);
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
      const other = lookup(cfg, node2.hash, shift, node2.key, node1);
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
      let newCol: Array<{ key: K; val: V }> | undefined;
      for (let i = 0, col1 = node1.collision, len1 = col1.length; i < len1; i++) {
        const x = col1[i];
        let found = false;
        for (let j = 0, col2 = node2.collision, len2 = col2.length; j < len2; j++) {
          const y = col2[j];
          if (cfg.compare(x.key, y.key) === 0) {
            intersectionSize++;
            const newVal = f(x.val, y.val, x.key);
            if (newCol) {
              if (newVal === x.val) {
                newCol.push(x);
              } else if (newVal === y.val) {
                newCol.push(y);
              } else {
                newCol.push({ key: x.key, val: newVal });
              }
            } else {
              if (newVal !== x.val) {
                newCol = [...col1.slice(0, i), { key: x.key, val: newVal }];
              }
            }
            found = true;
            break;
          }
        }
        if (!newCol && !found) {
          newCol = [...col1.slice(0, i)];
        }
      }

      if (newCol === undefined) {
        return node1;
      } else if (newCol.length === 0) {
        return null;
      } else if (newCol.length === 1) {
        return { hash: node1.hash, key: newCol[0].key, val: newCol[0].val };
      } else {
        return { hash: node1.hash, collision: newCol };
      }
    }

    // Branch vs Branch
    else if ("children" in node1 && "children" in node2) {
      const node1bitmap = node1.bitmap ?? fullBitmap;
      const node2bitmap = node2.bitmap ?? fullBitmap;
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
      } else if (newArr.length === maxChildren) {
        return { children: newArr };
      } else {
        return { bitmap: newBitmap, children: newArr };
      }
    }

    //  Branch vs Collision
    else if ("children" in node1) {
      // node2 is guaranteed to be collision, but typescript doesn't know that
      const hash2: number = (node2 as CollisionNode<K, V>).hash;

      // find the index where hash2 will live (if any)
      let idx: number;
      if (node1.bitmap === undefined) {
        idx = fullIndex(hash2, shift);
      } else {
        const m = mask(hash2, shift);
        if (m & node1.bitmap) {
          idx = sparseIndex(node1.bitmap, m);
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

      // find the index where hash1 will live (if any)
      let idx: number;
      if (node2.bitmap === undefined) {
        idx = fullIndex(hash1, shift);
      } else {
        const m = mask(hash1, shift);
        if (m & node2.bitmap) {
          idx = sparseIndex(node2.bitmap, m);
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
