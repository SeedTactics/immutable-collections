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
keys hash to the same value, we store an collision array.
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

// A internal node with some null children.  Which children are non-null is specified in the bitmap and then
// all non-null children are stored in an array.
export type BitmapIndexedNode<K, V> = { readonly bitmap: number; readonly children: ReadonlyArray<HamtNode<K, V>> };
export type MutableBitmapIndexedNode<K, V> = {
  bitmap: number;
  readonly children: Array<MutableHamtNode<K, V>>;
};

// A full node in which all 32 children are non-null
export type FullNode<K, V> = { readonly full: ReadonlyArray<HamtNode<K, V>> };
export type MutableFullNode<K, V> = { readonly full: Array<MutableHamtNode<K, V>> };

export type HamtNode<K, V> = LeafNode<K, V> | CollisionNode<K, V> | BitmapIndexedNode<K, V> | FullNode<K, V>;

export type MutableHamtNode<K, V> =
  | MutableLeafNode<K, V>
  | MutableCollisionNode<K, V>
  | MutableBitmapIndexedNode<K, V>
  | MutableFullNode<K, V>;

const bitsPerSubkey = 5;
const subkeyMask = (1 << bitsPerSubkey) - 1;
const maxChildren = 1 << bitsPerSubkey; // 2^bitsPerSubKey
const maxShift = Math.floor(32 / bitsPerSubkey);

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
    if ("bitmap" in node) {
      const m = mask(hash, shift);
      if ((node.bitmap & m) === 0) {
        return undefined;
      } else {
        // recurse
        shift += bitsPerSubkey;
        node = node.children[sparseIndex(node.bitmap, m)];
      }
    } else if ("full" in node) {
      // recurse
      shift += bitsPerSubkey;
      node = node.full[fullIndex(hash, shift)];
    } else if ("key" in node) {
      if (hash === node.hash && cfg.keyEq(k, node.key)) {
        return node.val;
      } else {
        return undefined;
      }
    } else {
      if (hash === node.hash) {
        const arr = node.collision;
        for (let i = 0; i < arr.length; i++) {
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

  return undefined;
}

// create a new node consisting of two children. Requires that the keys and hashes of the keys are not equal
function two<K, V>(shift: number, leaf1: LeafNode<K, V>, leaf2: LeafNode<K, V>): MutableHamtNode<K, V> {
  const hash1 = leaf1.hash;
  const hash2 = leaf2.hash;
  let root: MutableBitmapIndexedNode<K, V> | undefined;

  // as we descend through the shifts, newly created nodes are set at the zero index in the
  // parent array.
  let parent: Array<MutableHamtNode<K, V>> | undefined;

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
      const newNode = { bitmap: mask1 | mask2, children: mask1 < mask2 ? [leaf1, leaf2] : [leaf2, leaf1] };
      if (parent !== undefined) {
        parent[0] = newNode;
      }
      return root ?? newNode;
    }
  } while (shift <= maxShift);

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
    if ("bitmap" in curNode) {
      const m = mask(hash, shift);
      const idx = sparseIndex(curNode.bitmap, m);

      if ((curNode.bitmap & m) === 0) {
        // child is not present in the bitmap so can be added as a leaf

        // create the new node
        const leaf = { hash, key: k, val: getVal(undefined) };
        const newArr = copyAndInsertToArray(curNode.children, idx, leaf);
        let newNode: HamtNode<K, V>;
        if (newArr.length === maxChildren) {
          newNode = { full: newArr };
        } else {
          newNode = { bitmap: curNode.bitmap | m, children: newArr };
        }

        // set it in the parent and return
        if (parent !== undefined) {
          parent[parentIdx] = newNode;
        }
        return [newRoot ?? newNode, true];
      } else {
        // need to recurse

        // first, create a new node
        const newArr = [...curNode.children];
        const newNode = { bitmap: curNode.bitmap, children: newArr };
        if (newRoot !== undefined) {
          newRoot = newNode;
        }
        if (parent !== undefined) {
          parent[parentIdx] = newNode;
        }

        // recurse
        parent = newArr;
        parentIdx = idx;
        shift = shift + bitsPerSubkey;
        curNode = curNode.children[idx];
      }
    } else if ("full" in curNode) {
      const idx = fullIndex(hash, shift);

      // make a copy of the curNode
      const newArr = [...curNode.full];
      const newNode = { full: newArr };
      if (newRoot === undefined) {
        newRoot = newNode;
      }
      if (parent !== undefined) {
        parent[parentIdx] = newNode;
      }

      //recurse
      parent = newArr;
      parentIdx = idx;
      shift = shift + bitsPerSubkey;
      curNode = newArr[idx];
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
      // collision node
      const newNode = { hash, collision: [{ key: k, val: getVal(undefined) }, ...curNode.collision] };
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
): readonly [MutableHamtNode<K, V>, boolean] {
  const hash = cfg.hash(k);

  if (rootNode === null) {
    return [{ hash, key: k, val: getVal(undefined, t) }, true];
  }

  // we descend through the tree, keeping track of the parent and the parent index
  let parent: Array<MutableHamtNode<K, V>> | undefined;
  let parentIdx = 0;

  let shift = 0;
  let curNode = rootNode;

  do {
    if ("bitmap" in curNode) {
      const m = mask(hash, shift);
      const idx = sparseIndex(curNode.bitmap, m);

      if ((curNode.bitmap & m) === 0) {
        // child is not present in the bitmap so can be added as a leaf

        const leaf = { hash, key: k, val: getVal(undefined, t) };
        const arr = curNode.children;
        arr.splice(idx, 0, leaf);
        if (arr.length === maxChildren) {
          // need to switch to a full node
          if (parent !== undefined) {
            parent[parentIdx] = { full: arr };
          } else {
            // parent is undefined means the current node is the root
            rootNode = { full: arr };
          }
        } else {
          curNode.bitmap |= m;
        }
        return [rootNode, true];
      } else {
        // recurse
        parent = curNode.children;
        parentIdx = idx;
        shift = shift + bitsPerSubkey;
        curNode = parent[idx];
      }
    } else if ("full" in curNode) {
      //recurse
      const idx = fullIndex(hash, shift);
      parent = curNode.full;
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
          return [rootNode, false];
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
      return [rootNode, true];
    } else {
      curNode.collision.push({ key: k, val: getVal(undefined, t) });
      return [rootNode, true];
    }
  } while (curNode);

  throw new Error("Internal immutable-collections violation: hamt mutate insert reached null");
}

type InternalHamtNodeWithMutableChildArray<K, V> =
  | {
      bitmap: number;
      children: Array<HamtNode<K, V>>;
    }
  | { full: Array<HamtNode<K, V>> };

function removeChild<K, V>(node: InternalHamtNodeWithMutableChildArray<K, V>, idx: number) {
  if ("bitmap" in node) {
    node.bitmap &= ~(1 << idx);
    node.children.splice(idx, 1);
  } else {
    const arr = node.full;
    // transform the full node into a bitmap node, which typescript does not like at all
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    (node as any).children = arr.splice(idx, 1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    (node as any).bitmap = ~(1 << idx);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    delete (node as any).full;
  }
}

function updateChild<K, V>(
  node: InternalHamtNodeWithMutableChildArray<K, V>,
  idx: number,
  newNode: HamtNode<K, V>
): void {
  if ("bitmap" in node) {
    node.children[idx] = newNode;
  } else {
    node.full[idx] = newNode;
  }
}

function copyAndRemoveFromArray<T>(arr: ReadonlyArray<T>, idx: number): Array<T> {
  return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
}

export function remove<K, V>(
  cfg: HashConfig<K>,
  k: K,
  rootNode: HamtNode<K, V> | null
): readonly [HamtNode<K, V> | null, boolean] {
  if (rootNode === null) {
    return [null, false];
  }

  const hash = cfg.hash(k);

  let newRoot: HamtNode<K, V> | undefined;

  // we will descend through the tree, leaving a trail of newly created nodes behind us.
  // Each newly created internal node will have an new array of children, and this
  // new array will be set in the parent variable.
  // Thus each time we create a new node, it must be set into the parent array at the given index.
  let parent: InternalHamtNodeWithMutableChildArray<K, V> | undefined;
  let parentIdx = 0;

  let shift = 0;
  let curNode = rootNode;

  do {
    if ("bitmap" in curNode) {
      const m = mask(hash, shift);
      if ((curNode.bitmap & m) === 0) {
        // element is not present
        return [rootNode, false];
      } else {
        // recurse
        const idx = sparseIndex(curNode.bitmap, m);

        // create a new node
        const newNode = { bitmap: curNode.bitmap, children: [...curNode.children] };
        if (newRoot === undefined) {
          newRoot = newNode;
        }
        if (parent !== undefined) {
          updateChild(parent, parentIdx, newNode);
        }

        parent = newNode;
        parentIdx = idx;
        shift += bitsPerSubkey;
        curNode = curNode.children[idx];
      }
    } else if ("full" in curNode) {
      const idx = fullIndex(hash, shift);

      // create a new node
      const newNode = { full: [...curNode.full] };
      if (newRoot === undefined) {
        newRoot = newNode;
      }
      if (parent !== undefined) {
        updateChild(parent, parentIdx, newNode);
      }

      //recurse
      parent = newNode;
      parentIdx = idx;
      shift = shift + bitsPerSubkey;
      curNode = newNode.full[idx];
    } else if ("key" in curNode) {
      if (hash === curNode.hash) {
        if (cfg.keyEq(k, curNode.key)) {
          if (parent === undefined || newRoot === undefined) {
            // this leaf is the root, so removing it will make the tree empty
            return [null, true];
          } else {
            removeChild(parent, parentIdx);
            return [newRoot, true];
          }
        } else {
          // keys are not equal, no match
          return [rootNode, false];
        }
      } else {
        // hashes are different, no match
        return [rootNode, false];
      }
    } else {
      // collision
      if (hash === curNode.hash) {
        for (let i = 0; i < curNode.collision.length; i++) {
          if (cfg.keyEq(k, curNode.collision[i].key)) {
            const newNode = { hash, collision: copyAndRemoveFromArray(curNode.collision, i) };
            if (parent !== undefined) {
              updateChild(parent, parentIdx, newNode);
            }
            return [newRoot ?? newNode, true];
          }
        }
        return [rootNode, false];
      } else {
        // hashes are different, no match
        return [rootNode, false];
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
    if ("bitmap" in node) {
      for (let i = 0; i < node.children.length; i++) {
        stack.push(node.children[i]);
      }
    } else if ("full" in node) {
      for (let i = 0; i < node.full.length; i++) {
        stack.push(node.full[i]);
      }
    } else if ("key" in node) {
      yield f(node.key, node.val);
    } else {
      for (let i = 0; i < node.collision.length; i++) {
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
    if ("bitmap" in node) {
      for (let i = 0; i < node.children.length; i++) {
        stack.push(node.children[i]);
      }
    } else if ("full" in node) {
      for (let i = 0; i < node.full.length; i++) {
        stack.push(node.full[i]);
      }
    } else if ("key" in node) {
      acc = f(acc, node.val, node.key);
    } else {
      for (let i = 0; i < node.collision.length; i++) {
        const x = node.collision[i];
        acc = f(acc, x.val, x.key);
      }
    }
  }
  return acc;
}

// TODO: mapValues
// TODO: collectValues
