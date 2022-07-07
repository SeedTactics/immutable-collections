/* Copyright John Lenz, BSD license, see LICENSE file for details */
/* eslint-disable @typescript-eslint/unbound-method */

import { expect } from "chai";
import { faker } from "@faker-js/faker";
import { hashValues, isHashableObj, mkHashConfig } from "../src/data-structures/hashing.js";

class IntStrKey {
  readonly i: number;
  readonly s: string;
  public constructor(i: number, s: string) {
    this.i = i;
    this.s = s;
  }
  public hash(): number {
    return hashValues(this.i, this.s);
  }
  public toString(): string {
    return `[${this.i}, ${this.s}]`;
  }
}

class ComplexKey {
  readonly b: boolean;
  readonly d: Date | null | undefined;
  readonly k: IntStrKey;

  public constructor(b: boolean, d: Date | null | undefined, i: number, s: string) {
    this.b = b;
    this.d = d;
    this.k = new IntStrKey(i, s);
  }
  public hash(): number {
    return hashValues(this.b, this.d, this.k);
  }
  public toString(): string {
    return `[${this.b.toString()}, ${this.d?.toString() ?? "null"}, ${this.k.toString()}]`;
  }
}

describe("Hashing", () => {
  it("detects a hash key object", () => {
    const k = new IntStrKey(faker.datatype.number(), faker.datatype.string());
    expect(isHashableObj(k)).to.be.true;
    expect(isHashableObj(faker.datatype.string())).to.be.false;
    expect(isHashableObj({ foo: faker.datatype.string() })).to.be.false;
  });

  it("hashes a string", () => {
    const cfg = mkHashConfig<string>();
    expect(cfg.hash("abc")).to.equal(-1380653785);
    // cfg.hash should be replaced with the direct hash function, check it again
    expect(cfg.hash("abc")).to.equal(-1380653785);

    expect(cfg.hash("def")).to.equal(-30874749);
    expect(cfg.hash("defg")).to.equal(22987937);
  });

  it("hashes a boolean", () => {
    const cfg = mkHashConfig<boolean>();
    expect(cfg.hash(true)).to.equal(1);
    expect(cfg.hash(true)).to.equal(1);
    expect(cfg.hash(false)).to.equal(0);
  });

  it("hashes small integers", () => {
    const cfg = mkHashConfig<number>();

    const min32bit = -2147483648;
    const max32bit = 2147483647;

    expect(cfg.hash(min32bit)).to.equal(min32bit);
    expect(cfg.hash(min32bit)).to.equal(min32bit);
    expect(cfg.hash(max32bit)).to.equal(max32bit);

    const small = faker.datatype.number({ min: min32bit, max: max32bit });
    expect(cfg.hash(small)).to.equal(small);
  });

  it("hashes NaN", () => {
    const cfg = mkHashConfig<number>();
    expect(cfg.hash(NaN)).to.equal(0);
    expect(cfg.hash(Infinity)).to.equal(0);
  });

  it("hashes large integers", () => {
    //const min32bit = -2147483648;
    const max32bit = 2147483647;

    const cfg = mkHashConfig<number>();

    const large = faker.datatype.number({ min: max32bit + 1, max: Number.MAX_SAFE_INTEGER });
    expect(cfg.hash(large)).not.to.equal(large);

    expect(cfg.hash(12345678901234)).to.equal(1750440167);
  });

  it("hashes doubles", () => {
    const cfg = mkHashConfig<number>();

    expect(cfg.hash(1.2)).to.equal(-211113349);
    expect(cfg.hash(1.2)).to.equal(-211113349);
    expect(cfg.hash(4.8)).to.equal(-1937069445);
  });

  it("hash config works when compare is called first", () => {
    const cfg = mkHashConfig<number>();
    expect(cfg.compare(1, 2)).to.equal(-1);

    expect(cfg.hash(50)).to.equal(50);
  });

  it("hashes an object", () => {
    expect(new IntStrKey(1, "2").hash()).to.equal(1836881326);
    // cfg.hash should be replaced with the direct hash function, check it again
    expect(new IntStrKey(1, "2").hash()).to.equal(1836881326);

    // try different keys to see the hash changes
    expect(new IntStrKey(1, "3").hash()).to.equal(-1853826110);
    expect(new IntStrKey(6, "2").hash()).to.equal(-1586431198);
  });

  it("hashes a complex key", () => {
    const k1 = new ComplexKey(true, new Date(Date.UTC(2022, 5, 6, 10, 2, 2)), 100, "str");
    const k1a = new ComplexKey(true, new Date(Date.UTC(2022, 5, 6, 10, 2, 2)), 100, "str");

    expect(k1.hash()).to.equal(-298682581);
    expect(k1.hash()).to.equal(-298682581);
    expect(k1a.hash()).to.equal(-298682581);

    expect(new ComplexKey(false, k1.d, k1.k.i, k1.k.s).hash()).to.equal(1886983859);
    expect(new ComplexKey(k1.b, new Date(Date.UTC(2022, 5, 4, 10, 2, 2)), k1.k.i, k1.k.s).hash()).to.equal(1043564563);
    expect(new ComplexKey(k1.b, k1.d, 102, k1.k.s).hash()).to.equal(-60260645);
    expect(new ComplexKey(k1.b, k1.d, k1.k.i, "hello").hash()).to.equal(1803504075);
  });

  it("hashes null and undefined", () => {
    const knull = new ComplexKey(true, null, 20, "str");
    const kundef = new ComplexKey(true, undefined, 20, "str");

    expect(knull.hash()).to.equal(1633561911);
    expect(kundef.hash()).to.equal(1633561911);
  });

  it("hashes an array of a single value", () => {
    expect(hashValues(100)).to.equal(100);
  });
});
