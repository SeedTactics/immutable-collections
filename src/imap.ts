import { HashKey } from "./hashing";
import { LazySeq } from "./lazyseq";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires
const hamt: any = require("hamt_plus");

export interface IMap<K, V> {
  isEmpty(): boolean;
  get(k: K): V | undefined;
  tryGet(alt: V, k: K): V;
  has(k: K): boolean;
  size: number;

  [Symbol.iterator](): Iterator<readonly [K, V]>;
  fold<T>(f: (acc: T, val: V, key: K) => T, zero: T): T;
  entries(): Iterable<readonly [K, V]>;
  keys(): Iterable<K>;
  values(): Iterable<V>;
  forEach(f: (val: V, k: K, map: IMap<K, V>) => void): void;
  toLazySeq(): LazySeq<readonly [K, V]>;
  keysToLazySeq(): LazySeq<K>;
  valuesToLazySeq(): LazySeq<V>;

  set(k: K & HashKey, v: V): IMap<K, V>;
  modify(f: (v: V | undefined) => V, k: K & HashKey): IMap<K, V>;
  delete(k: K & HashKey): IMap<K, V>;
  append(items: Iterable<readonly [K & HashKey, V]>, merge: (v1: V, v2: V) => V): IMap<K, V>;
  bulkDelete(shouldDelete: (k: K, v: V) => boolean): IMap<K, V>; // TODO: remove once collectValues is efficient
  mapValues<U>(f: (v: V, k: K) => U): IMap<K, U>;
  collectValues(f: (v: V, k: K) => V | null | undefined): IMap<K, V>;
}

/*
interface MakeConfig<K> {
  readonly keyEq: (a: K, b: K) => boolean;
  readonly hash: (v: K) => number;
}

interface HamtMap<K, V> extends IMap<K, V> {
  beginMutation(): HamtMap<K, V>;
  endMutation(): HamtMap<K, V>;

  _config: MakeConfig<K>;
}

export function emptyIMap<K, V>(): IMap<K, V> {
  return makeWithDynamicConfig<K, V>();
}

export function iterableToIMap<K, V>(
  items: Iterable<readonly [K & HashKey, V]>,
  merge?: (v1: V, v2: V) => V
): IMap<K, V> {
  const m = makeWithDynamicConfig<K, V>().beginMutation();
  if (merge !== undefined) {
    for (const [k, v] of items) {
      m.modify((old) => (old === undefined ? v : merge(old, v)), k);
    }
  } else {
    for (const [k, v] of items) {
      m.set(k, v);
    }
  }
  return m.endMutation();
}

export function buildIMap<K, V, T>(
  items: Iterable<T>,
  getKey: (t: T) => K & HashKey,
  getVal: (old: V | undefined, t: T) => V
): IMap<K, V> {
  const m = makeWithDynamicConfig<K, V>().beginMutation();
  for (const t of items) {
    m.modify((old) => getVal(old, t), getKey(t));
  }
  return m.endMutation();
}

// --------------------------------------------------------------------------------
// Extra functions placed onto the IMap prototype
// --------------------------------------------------------------------------------

function imapToLazySeq<K, V>(this: IMap<K, V>): LazySeq<readonly [K, V]> {
  return LazySeq.ofIterable(this);
}
function imapToKeysLazySeq<K, V>(this: IMap<K, V>): LazySeq<K> {
  return LazySeq.ofIterable(this.keys());
}
function imapToValuesLazySeq<K, V>(this: IMap<K, V>): LazySeq<V> {
  return LazySeq.ofIterable(this.values());
}

function appendIMap<K, V>(
  this: IMap<K, V>,
  items: Iterable<readonly [K & HashKey, V]>,
  merge: (v1: V, v2: V) => V
): IMap<K, V> {
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  let imap = this;
  for (const [k, v] of items) {
    imap = imap.modify((old) => (old === undefined ? v : merge(old, v)), k);
  }
  return imap;
}

function bulkDeleteIMap<K, V>(this: IMap<K & HashKey, V>, shouldRemove: (k: K, v: V) => boolean): IMap<K, V> {
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  let m = this;
  for (const [k, v] of this) {
    if (shouldRemove(k, v)) {
      m = m.delete(k);
    }
  }
  return m;
}

function mapValuesIMap<K, V>(this: IMap<K & HashKey, V>, f: (v: V) => V): IMap<K, V> {
  return buildIMap(
    this,
    ([k]) => k,
    (_, [, v]) => f(v)
  );
}

function collectValuesIMap<K, V>(this: IMap<K & HashKey, V>, f: (v: V) => V | null | undefined): IMap<K, V> {
  const m = makeWithDynamicConfig<K, V>().beginMutation();
  for (const [k, v] of this) {
    const newV = f(v);
    if (newV !== undefined && newV !== null) {
      m.set(k, newV);
    }
  }
  return m.endMutation();
}

const hamtProto = hamt.empty.prototype;
if (hamtProto.toLazySeq === undefined) {
  hamtProto.toLazySeq = imapToLazySeq;
  hamtProto.keysToLazySeq = imapToKeysLazySeq;
  hamtProto.valuesToLazySeq = imapToValuesLazySeq;
  hamtProto.append = appendIMap;
  hamtProto.bulkDelete = bulkDeleteIMap;
  hamtProto.mapValues = mapValuesIMap;
  hamtProto.collectValues = collectValuesIMap;
}
*/
