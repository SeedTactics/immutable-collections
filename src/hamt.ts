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
const maxChildren = 1 << bitsPerSubkey; // 2^bitsPerSubKey

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

export function lookup<K, V>(cfg: HashConfig<K>, k: K, rootNode: HamtNode<K, V>): V | undefined {
  const hash = cfg.hash(k);
  let shift = 0;
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
      if (hash === node.hash && cfg.keyEq(k, node.key)) {
        return node.val;
      } else {
        return undefined;
      }
    } else {
      if (hash === node.hash) {
        const arr = node.collision;
        for (let i = 0, len = arr.length; i < len; i++) {
          const n = arr[i];
          if (cfg.keyEq(k, n.key)) {
            return n.val;
          }
        }
        return undefined;
      } else {
        return undefined;
      }
    }
  } while (node);
  throw new Error("Internal immutable-collections violation: node undefined during lookup " + JSON.stringify(rootNode));
}

// create a new node consisting of two children. Requires that the hashes are not equal
function two<K, V>(
  shift: number,
  leaf1: MutableLeafNode<K, V> | MutableCollisionNode<K, V>,
  leaf2: MutableLeafNode<K, V>
): MutableHamtNode<K, V>;
function two<K, V>(shift: number, leaf1: LeafNode<K, V> | CollisionNode<K, V>, leaf2: LeafNode<K, V>): HamtNode<K, V>;
function two<K, V>(shift: number, leaf1: LeafNode<K, V> | CollisionNode<K, V>, leaf2: LeafNode<K, V>): HamtNode<K, V> {
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
        if (cfg.keyEq(k, curNode.key)) {
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
      if (hash === curNode.hash) {
        // check and extend the existing collision node
        for (let i = 0, collision = curNode.collision, len = collision.length; i < len; i++) {
          const c = collision[i];
          if (cfg.keyEq(k, c.key)) {
            const newVal = getVal(c.val);
            if (c.val === newVal) {
              // return the original root node because nothing changed
              return [rootNode, false];
            }
            // create a copy of the collision node
            const newArr = [...collision];
            newArr[i] = { key: k, val: newVal };
            newNode = { hash, collision: newArr };
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
      return [newRoot ?? newNode, true];
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
        if (cfg.keyEq(k, curNode.key)) {
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
          if (cfg.keyEq(k, c.key)) {
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
        if (cfg.keyEq(k, curNode.key)) {
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
          if (cfg.keyEq(k, collision[i].key)) {
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

export function fold<K, V, T>(root: HamtNode<K, V> | null, f: (acc: T, val: V, key: K) => T, zero: T): T {
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
      acc = f(acc, node.val, node.key);
    } else {
      for (let i = 0, len = node.collision.length; i < len; i++) {
        const x = node.collision[i];
        acc = f(acc, x.val, x.key);
      }
    }
  }
  return acc;
}
