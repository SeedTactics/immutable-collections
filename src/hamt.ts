import { HashConfig } from "./hashing";

export type LeafNode<K, V> = { hash: number; key: K; val: V };
export type CollisionNode<K, V> = { hash: number; collision: Array<{ key: K; val: V }> };
export type BitmapIndexedNode<K, V> = { bitmap: number; children: Array<HamtNode<K, V>> };
export type FullNode<K, V> = { full: Array<HamtNode<K, V>> };

export type HamtNode<K, V> =
  | { empty: null }
  | LeafNode<K, V>
  | CollisionNode<K, V>
  | BitmapIndexedNode<K, V>
  | FullNode<K, V>;

export const empty: HamtNode<unknown, unknown> = { empty: null };

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

// create a new collision node from two leafs
function mkCollision<K, V>(hash: number, leaf1: { key: K; val: V }, leaf2: { key: K; val: V }): CollisionNode<K, V> {
  return { hash, collision: [leaf1, leaf2] };
}

// create a new node consisting of two children whose keys are not equal
function two<K, V>(startShift: number, leaf1: LeafNode<K, V>, leaf2: LeafNode<K, V>): HamtNode<K, V> {
  const hash1 = leaf1.hash;
  const hash2 = leaf2.hash;
  function loop(shift: number): HamtNode<K, V> {
    const mask1 = mask(hash1, shift);
    const mask2 = mask(hash2, shift);
    if (mask1 === mask2) {
      // need to recurse
      const newChild = loop(shift + bitsPerSubkey);
      return { bitmap: mask1, children: [newChild] };
    } else {
      return { bitmap: mask1 | mask2, children: mask1 < mask2 ? [leaf1, leaf2] : [leaf2, leaf1] };
    }
  }

  return loop(startShift);
}

// create a new bitmap indexed or full node
function bitmapIndexedOrFull<K, V>(bitmap: number, children: Array<HamtNode<K, V>>): HamtNode<K, V> {
  if (children.length === maxChildren) {
    return { full: children };
  } else {
    return { bitmap, children };
  }
}

function copyAndSpliceArray<T>(arr: Array<T>, at: number, t: T): Array<T> {
  const len = arr.length;
  let i = 0;
  let g = 0;
  const out = new Array<T>(len + 1);
  while (i < at) out[g++] = arr[i++];
  out[at] = t;
  while (i < len) out[++g] = arr[i++];
  return out;
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
        const i = sparseIndex(node.bitmap, m);
        shift += bitsPerSubkey;
        node = node.children[i];
      }
    } else if ("full" in node) {
      // recurse
      const i = fullIndex(hash, shift);
      shift += bitsPerSubkey;
      node = node.full[i];
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
          return mkCollision(hash, { key: k, val: getVal(undefined) }, { key: node.key, val: node.val });
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
  rootNode: HamtNode<K, V>,
  merge: ((v1: V, v2: V) => V) | undefined
): readonly [HamtNode<K, V>, boolean] {
  const hash = cfg.hash(k);
  let existing = false;
  function loop(shift: number, node: HamtNode<K, V>): HamtNode<K, V> {
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
          return mkCollision(hash, { key: k, val: v }, { key: node.key, val: node.val });
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
