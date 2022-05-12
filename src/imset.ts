import { HashKey } from "./hashing.js";
import { ImMap } from "./immap.js";
import { LazySeq } from "./lazyseq.js";

export class ImSet<T> {
  imap: ImMap<T, undefined>;

  private constructor(imap: ImMap<T, undefined>) {
    this.imap = imap;
  }

  public static empty<T extends HashKey>(): ImSet<T> {
    return new ImSet<T>(ImMap.empty<T, undefined>());
  }

  public static from<T extends HashKey>(items: Iterable<T>): ImSet<T> {
    return new ImSet<T>(ImMap.from(LazySeq.ofIterable(items).map((i) => [i, undefined])));
  }

  public has(item: T & HashKey): boolean {
    return this.imap.has(item);
  }

  public get size(): number {
    return this.imap.size;
  }

  public add(item: T & HashKey): ImSet<T> {
    return new ImSet<T>(this.imap.set(item, undefined));
  }

  public delete(item: T & HashKey): ImSet<T> {
    return new ImSet<T>(this.imap.delete(item));
  }

  [Symbol.iterator](): Iterator<T> {
    return this.imap.keys()[Symbol.iterator]();
  }

  public toLazySeq(): LazySeq<T> {
    return LazySeq.ofIterable(this.imap.keys());
  }
}
