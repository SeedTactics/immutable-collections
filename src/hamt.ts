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

export type HamtNode<K, V> =
  | { readonly empty: null }
  | LeafNode<K, V>
  | CollisionNode<K, V>
  | BitmapIndexedNode<K, V>
  | FullNode<K, V>;

export type MutableHamtNode<K, V> =
  | { readonly empty: null }
  | MutableLeafNode<K, V>
  | MutableCollisionNode<K, V>
  | MutableBitmapIndexedNode<K, V>
  | MutableFullNode<K, V>;

export const empty: { readonly empty: null } = { empty: null };

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
    } else if ("collision" in node) {
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
    } else {
      // empty node
      return undefined;
    }
  } while (node);

  return undefined;
}

// a MutableBitmapNode but children property is not yet set so is undefined
type MutableBitmapNodeBeforeChildren<K, V> = {
  bitmap: number;
  children?: Array<MutableBitmapNodeBeforeChildren<K, V> | LeafNode<K, V>>;
};

// create a new node consisting of two children. Requires that the keys and hashes of the keys are not equal
function two<K, V>(shift: number, leaf1: LeafNode<K, V>, leaf2: LeafNode<K, V>): MutableHamtNode<K, V> {
  const hash1 = leaf1.hash;
  const hash2 = leaf2.hash;
  let root: MutableBitmapNodeBeforeChildren<K, V> | undefined;
  let parent: MutableBitmapNodeBeforeChildren<K, V> | undefined;

  do {
    const mask1 = mask(hash1, shift);
    const mask2 = mask(hash2, shift);

    if (mask1 === mask2) {
      // need to recurse
      const newNode = { bitmap: mask1 };
      if (root === undefined) {
        root = newNode;
      }
      if (parent !== undefined) {
        parent.children = [newNode];
      }
      parent = newNode;

      shift = shift + bitsPerSubkey;
    } else {
      // we can insert
      const newNode = { bitmap: mask1 | mask2, children: mask1 < mask2 ? [leaf1, leaf2] : [leaf2, leaf1] };
      if (parent !== undefined) {
        parent.children = [newNode];
      }
      // typescript doesn't know that we are guaranteed to have set children because if root has a value,
      // root was also the parent at some point and had it's children set.  Therefore, cast root to MutableBitmapIndexedNode<K, V>
      return (root as MutableBitmapIndexedNode<K, V>) ?? newNode;
    }
  } while (shift <= maxShift);

  throw new Error(
    "Internal immutable-collections violation: shift > maxShift for two " + JSON.stringify({ shift, leaf1, leaf2 })
  );
}

// create a new bitmap indexed or full node
function bitmapIndexedOrFull<K, V>(bitmap: number, children: ReadonlyArray<HamtNode<K, V>>): HamtNode<K, V> {
  if (children.length === maxChildren) {
    return { full: children };
  } else {
    return { bitmap, children };
  }
}

function copyAndSpliceArray<T>(arr: ReadonlyArray<T>, at: number, t: T): Array<T> {
  const len = arr.length;
  let i = 0;
  let g = 0;
  const out = new Array<T>(len + 1);
  while (i < at) out[g++] = arr[i++];
  out[at] = t;
  while (i < len) out[++g] = arr[i++];
  return out;
}

export function insert<K, V>(
  cfg: HashConfig<K>,
  k: K,
  getVal: (v: V | undefined) => V,
  rootNode: HamtNode<K, V>
): readonly [HamtNode<K, V>, boolean] {
  const hash = cfg.hash(k);
  let existing = false;
  function loop(shift: number, node: HamtNode<K, V>): HamtNode<K, V> {
    if ("bitmap" in node) {
      const m = mask(hash, shift);
      const idx = sparseIndex(node.bitmap, m);
      if ((node.bitmap & m) === 0) {
        // child is not present in the bitmap so can be added as a leaf
        const leaf = { hash, key: k, val: getVal(undefined) };
        return bitmapIndexedOrFull(node.bitmap | m, copyAndSpliceArray(node.children, idx, leaf));
      } else {
        // child is present in the bitmap so must recurse
        const child = node.children[idx];
        const newChild = loop(shift + bitsPerSubkey, child);
        if (newChild === child) {
          return node;
        } else {
          return bitmapIndexedOrFull(node.bitmap, copyAndSpliceArray(node.children, idx, newChild));
        }
      }
    } else if ("full" in node) {
      const idx = fullIndex(hash, shift);
      const child = node.full[idx];
      const newChild = loop(shift + bitsPerSubkey, child);
      if (newChild === child) {
        return node;
      } else {
        return { full: copyAndSpliceArray(node.full, idx, newChild) };
      }
    } else if ("key" in node) {
      // node is leaf
      if (hash === node.hash) {
        // either the key is equal or there is a collision
        if (cfg.keyEq(k, node.key)) {
          existing = true;
          const newVal = getVal(node.val);
          if (newVal === node.val) {
            return node;
          } else {
            // replace the value
            return { hash, key: k, val: newVal };
          }
        } else {
          return {
            hash,
            collision: [
              { key: k, val: getVal(undefined) },
              { key: node.key, val: node.val },
            ],
          };
        }
      } else {
        return two(shift, { hash, key: k, val: getVal(undefined) }, node);
      }
    } else if ("collision" in node) {
      return { hash, collision: [{ key: k, val: getVal(undefined) }, ...node.collision] };
    } else {
      // node is empty
      return { hash, key: k, val: getVal(undefined) };
    }
  }

  const newRoot = loop(0, rootNode);
  return [newRoot, existing];
}

// a version of insert which mutates instead of copying nodes
export function mutateInsert<K, V>(
  cfg: HashConfig<K>,
  k: K,
  v: V,
  rootNode: MutableHamtNode<K, V>,
  merge: ((v1: V, v2: V) => V) | undefined
): readonly [MutableHamtNode<K, V>, boolean] {
  const hash = cfg.hash(k);
  let existing = false;
  function loop(shift: number, node: MutableHamtNode<K, V>): MutableHamtNode<K, V> {
    if ("bitmap" in node) {
      const m = mask(hash, shift);
      const idx = sparseIndex(node.bitmap, m);
      if ((node.bitmap & m) === 0) {
        // child is not present in the bitmap so can be added as a leaf
        const leaf = { hash, key: k, val: v };
        const arr = node.children;
        arr.splice(idx, 0, leaf);
        if (arr.length === maxChildren) {
          return { full: arr };
        } else {
          node.bitmap |= m;
          return node;
        }
      } else {
        // child is present in the bitmap so must recurse
        const arr = node.children;
        const child = arr[idx];
        const newChild = loop(shift + bitsPerSubkey, child);
        if (newChild === child) {
          return node;
        } else {
          arr.splice(idx, 0, newChild);
          if (arr.length === maxChildren) {
            return { full: arr };
          } else {
            return node;
          }
        }
      }
    } else if ("full" in node) {
      // recurse and adjust full node if needed
      const idx = fullIndex(hash, shift);
      const arr = node.full;
      const child = arr[idx];
      const newChild = loop(shift + bitsPerSubkey, child);
      if (newChild !== child) {
        arr[idx] = newChild;
      }
      return node;
    } else if ("key" in node) {
      if (hash === node.hash) {
        if (cfg.keyEq(k, node.key)) {
          existing = true;
          node.val = merge ? merge(node.val, v) : v;
          return node;
        } else {
          return {
            hash,
            collision: [
              { key: k, val: v },
              { key: node.key, val: node.val },
            ],
          };
        }
      } else {
        return two(shift, { hash, key: k, val: v }, node);
      }
    } else if ("collision" in node) {
      node.collision.push({ key: k, val: v });
      return node;
    } else {
      // empty node
      return { hash, key: k, val: v };
    }
  }

  const newRoot = loop(0, rootNode);
  return [newRoot, existing];
}

// TODO: delete
// TODO: mapValues
// TODO: collectValues
