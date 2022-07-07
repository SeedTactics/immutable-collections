/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { expect } from "chai";
//import { faker } from "@faker-js/faker";
import { mkCompareByProperties, mkComparisonConfig } from "../src/data-structures/comparison.js";

class IntStr {
  readonly i: number;
  readonly s: string;

  public constructor(i: number, s: string) {
    this.i = i;
    this.s = s;
  }

  public compare(o: IntStr): number {
    if (this.i < o.i) {
      return -1;
    } else if (this.i > o.i) {
      return 1;
    } else {
      return this.s.localeCompare(o.s);
    }
  }

  public toString(): string {
    return `[${this.i}, ${this.s}]`;
  }
}

interface SomeProperties {
  readonly i: number | null;
  readonly s: string;
  readonly is: IntStr | null;
}

const p1 = { i: 1, s: "a", is: new IntStr(50, "r") };
const p2 = { i: 2, s: "z", is: new IntStr(100, "d") };

describe("Comparison", () => {
  it("compares by properties", () => {
    const cmp = mkCompareByProperties<SomeProperties>((p) => p.i, { asc: (p) => p.s });
    expect(cmp(p1, p2)).to.equal(-1);
    expect(cmp(p2, p1)).to.equal(1);
    expect(cmp(p1, p1)).to.equal(0);
    expect(cmp(p1, { ...p2, i: p1.i })).to.equal(-1);
    expect(cmp({ ...p2, i: p1.i }, p1)).to.equal(1);

    expect(cmp({ ...p1, i: null }, p2)).to.equal(1);
    expect(cmp(p1, { ...p2, i: null })).to.equal(-1);
    expect(cmp({ ...p1, i: null }, { ...p2, i: null })).to.equal(-1);
    expect(cmp({ ...p2, i: null }, { ...p1, i: null })).to.equal(1);
  });

  it("compares by some desc properties", () => {
    const cmp = mkCompareByProperties<SomeProperties>({ desc: (p) => p.i }, { desc: (p) => p.s });
    expect(cmp(p1, p2)).to.equal(1);
    expect(cmp(p2, p1)).to.equal(-1);
    expect(cmp(p1, p1)).to.equal(0);
    expect(cmp(p1, { ...p2, i: p1.i })).to.equal(1);
    expect(cmp({ ...p2, i: p1.i }, p1)).to.equal(-1);

    expect(cmp({ ...p1, i: null }, p2)).to.equal(-1);
    expect(cmp(p1, { ...p2, i: null })).to.equal(1);
    expect(cmp({ ...p1, i: null }, { ...p2, i: null })).to.equal(1);
    expect(cmp({ ...p2, i: null }, { ...p1, i: null })).to.equal(-1);
  });

  it("compares by complex object", () => {
    const cmp = mkCompareByProperties<SomeProperties>((p) => p.is);

    expect(cmp(p1, p2)).to.equal(-1);
    expect(cmp(p2, p1)).to.equal(1);
    expect(cmp(p1, p1)).to.equal(0);
  });

  it("compares by complex object descending", () => {
    const cmp = mkCompareByProperties<SomeProperties>({ desc: (p) => p.is });

    expect(cmp(p1, p2)).to.equal(1);
    expect(cmp(p2, p1)).to.equal(-1);
    expect(cmp(p1, p1)).to.equal(0);
  });

  it("creates string comparison config", () => {
    const cfg = mkComparisonConfig<string>();
    expect(cfg.compare("a", "b")).to.equal(-1);
    expect(cfg.compare("a", "a")).to.equal(0);
    expect(cfg.compare("b", "a")).to.equal(1);
  });

  it("creates boolean comparison config", () => {
    const cfg = mkComparisonConfig<boolean>();
    expect(cfg.compare(true, true)).to.equal(0);
    expect(cfg.compare(true, false)).to.equal(1);
    expect(cfg.compare(false, true)).to.equal(-1);
    expect(cfg.compare(false, false)).to.equal(0);
  });

  it("creates number comparison config", () => {
    const cfg = mkComparisonConfig<number>();
    expect(cfg.compare(50, 50)).to.equal(0);
    expect(cfg.compare(10, 100)).to.be.lessThan(0);
    expect(cfg.compare(8, 3)).to.be.greaterThan(0);
  });

  it("creates date comparison config", () => {
    const cfg = mkComparisonConfig<Date>();
    const d1 = new Date(Date.UTC(2021, 0, 1));
    const d2 = new Date(Date.UTC(2022, 0, 1));
    expect(cfg.compare(d1, d2)).to.be.lessThan(0);
    expect(cfg.compare(d2, d1)).to.be.greaterThan(0);
    expect(cfg.compare(d1, d1)).to.equal(0);
  });

  it("creates obj comparison config", () => {
    const cfg = mkComparisonConfig<IntStr>();
    expect(cfg.compare(new IntStr(10, "z"), new IntStr(20, "a"))).to.be.lessThan(0);
    expect(cfg.compare(new IntStr(20, "a"), new IntStr(10, "z"))).to.be.greaterThan(0);
    expect(cfg.compare(new IntStr(10, "j"), new IntStr(10, "j"))).to.equal(0);

    expect(cfg.compare(new IntStr(5, "a"), new IntStr(5, "z"))).to.be.lessThan(0);
    expect(cfg.compare(new IntStr(5, "z"), new IntStr(5, "a"))).to.be.greaterThan(0);
  });
});
