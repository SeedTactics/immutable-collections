/* eslint-disable @typescript-eslint/unbound-method */
import { expect } from "chai";
import { faker } from "@faker-js/faker";
import assert from "assert";

import { LazySeq } from "../src/lazyseq.js";

describe("LazySeq", () => {
  it("constructs from an iterable", () => {
    const arr = faker.datatype.array();

    const seq = LazySeq.ofIterable(arr);

    expect(seq.toRArray()).to.deep.equal(arr);
  });

  it("constructs from an iterator", () => {
    const seq = LazySeq.ofIterator(function* () {
      yield 1;
      yield 3;
      yield 5;
    });

    expect(seq.toRArray()).to.deep.equal([1, 3, 5]);
  });

  it("constructs from an object", () => {
    const seq = LazySeq.ofObject({ a: 1, b: "3", c: false });

    expect(seq.toRArray()).to.deep.equal([
      ["a", 1],
      ["b", "3"],
      ["c", false],
    ]);
  });

  it("constructs a range of numbers", () => {
    const seq = LazySeq.ofRange(1, 5);
    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4]);
  });

  it("constructs a range of numbers with a step", () => {
    const seq = LazySeq.ofRange(1, 11, 2);
    expect(seq.toRArray()).to.deep.equal([1, 3, 5, 7, 9]);
  });

  it("constructs a range of numbers with a negative step", () => {
    const seq = LazySeq.ofRange(10, 0, -2);
    expect(seq.toRArray()).to.deep.equal([10, 8, 6, 4, 2]);
  });

  it("acts as an iterator", () => {
    const seq = LazySeq.ofRange(1, 5);
    const i = seq[Symbol.iterator]();
    expect(i.next().value).to.equal(1);
    expect(i.next().value).to.equal(2);
    expect(i.next().value).to.equal(3);
    expect(i.next().value).to.equal(4);
    expect(i.next().done).to.be.true;
  });

  it("aggregates values", () => {
    const seq = LazySeq.ofRange(1, 11);

    const agg = seq.aggregate(
      (i) => Math.floor(i / 2),
      (i) => i + 40,
      (i, j) => i + j
    );

    expect(agg.toRArray()).to.deep.equal([
      [0, 41],
      [1, 42 + 43],
      [2, 44 + 45],
      [3, 46 + 47],
      [4, 48 + 49],
      [5, 50],
    ]);
  });

  it("checks if all values match", () => {
    const seq = LazySeq.ofRange(1, 5);

    expect(seq.allMatch((i) => i > 0)).to.be.true;
    expect(seq.allMatch((i) => i % 2 === 0)).to.be.false;

    const empty = LazySeq.ofIterable([]);
    expect(empty.allMatch(() => false)).to.be.true;
  });

  it("checks if any values match", () => {
    const seq = LazySeq.ofRange(1, 5);

    expect(seq.anyMatch((i) => i > 2)).to.be.true;
    expect(seq.anyMatch((i) => i < 0)).to.be.false;

    const empty = LazySeq.ofIterable([]);
    expect(empty.anyMatch(() => true)).to.be.false;
  });

  it("appends to a seq", () => {
    const seq = LazySeq.ofRange(1, 5);
    const seq2 = seq.append(100);

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4]);
    expect(seq2.toRArray()).to.deep.equal([1, 2, 3, 4, 100]);
  });

  it("chunks a sequence", () => {
    const seq = LazySeq.ofRange(1, 11);
    const chunks = seq.chunk(3);

    expect(chunks.toRArray()).to.deep.equal([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
  });

  it("concats a sequence", () => {
    const seq = LazySeq.ofRange(1, 5);
    const seq2 = seq.concat([100, 200, 300]);

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4]);
    expect(seq2.toRArray()).to.deep.equal([1, 2, 3, 4, 100, 200, 300]);
  });

  it("returns a distinct sequence", () => {
    const seq = LazySeq.ofIterable([1, 2, 3, 4, 1, 5, 2, 6]).distinct();

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 5, 6]);
  });

  it("drops a number of elements", () => {
    const seq = LazySeq.ofRange(1, 10);
    const seq2 = seq.drop(3);
    const seq3 = seq.drop(4);

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(seq2.toRArray()).to.deep.equal([4, 5, 6, 7, 8, 9]);
    expect(seq3.toRArray()).to.deep.equal([5, 6, 7, 8, 9]);
  });

  it("drops more than the number of elements", () => {
    const seq = LazySeq.ofRange(1, 10);
    const seq2 = seq.drop(20);

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(seq2.toRArray()).to.deep.equal([]);
  });

  it("dropWhile", () => {
    const seq = LazySeq.ofRange(1, 10).append(-4);
    const seq2 = seq.dropWhile((i) => i < 5);

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9, -4]);
    expect(seq2.toRArray()).to.deep.equal([5, 6, 7, 8, 9, -4]);
  });

  it("checks isEmpty", () => {
    const seq = LazySeq.ofRange(1, 10);
    const seq2 = LazySeq.ofIterable([]);

    expect(seq.isEmpty()).to.be.false;
    expect(seq2.isEmpty()).to.be.true;
  });

  it("filters a sequence", () => {
    const seq = LazySeq.ofRange(1, 10);
    const seq2 = seq.filter((i) => i % 2 === 0);

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(seq2.toRArray()).to.deep.equal([2, 4, 6, 8]);
  });

  it("finds an element", () => {
    const seq = LazySeq.ofRange(1, 10);
    const v5 = seq.find((i) => i === 5);
    const v20 = seq.find((i) => i === 20);

    expect(v5).to.equal(5);
    expect(v20).to.be.undefined;
  });

  it("it flatMaps a sequence", () => {
    const seq = LazySeq.ofRange(10, 50, 10);
    const seq2 = seq.flatMap((i) => LazySeq.ofRange(i, i + 3));

    expect(seq.toRArray()).to.deep.equal([10, 20, 30, 40]);
    expect(seq2.toRArray()).to.deep.equal([10, 11, 12, 20, 21, 22, 30, 31, 32, 40, 41, 42]);
  });

  it("folds a sequence", () => {
    const seq = LazySeq.ofRange(1, 10);
    const val = seq.foldLeft(0, (acc, i) => acc + i);

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(val).to.equal(45);
  });

  it("groups a sequence", () => {
    const seq = LazySeq.ofRange(10, 0, -1);
    const seq2 = seq.groupBy((i) => Math.floor(i / 2));

    expect(seq.toRArray()).to.deep.equal([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(seq2.toRArray()).to.deep.equal([
      [5, [10]],
      [4, [9, 8]],
      [3, [7, 6]],
      [2, [5, 4]],
      [1, [3, 2]],
      [0, [1]],
    ]);
  });

  it("groups and sorts each group", () => {
    const seq = LazySeq.ofRange(10, 0, -1);
    const seq2 = seq.groupBy((i) => Math.floor(i / 2), { asc: (i) => i });

    expect(seq.toRArray()).to.deep.equal([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(seq2.toRArray()).to.deep.equal([
      [5, [10]],
      [4, [8, 9]],
      [3, [6, 7]],
      [2, [4, 5]],
      [1, [2, 3]],
      [0, [1]],
    ]);
  });

  it("groups by a tuple", () => {
    const seq = LazySeq.ofIterable([
      { foo: 1, bar: "a", baz: true },
      { foo: 2, bar: "a", baz: true },
      { foo: 3, bar: "b", baz: true },
      { foo: 4, bar: "b", baz: false },
      { foo: 5, bar: "c", baz: true },
    ]);

    const groups = seq.groupByTuple((i) => [i.bar, i.baz]);

    expect(groups.toRArray()).to.deep.equal([
      [
        ["a", true],
        [
          { foo: 1, bar: "a", baz: true },
          { foo: 2, bar: "a", baz: true },
        ],
      ],
      [["b", true], [{ foo: 3, bar: "b", baz: true }]],
      [["b", false], [{ foo: 4, bar: "b", baz: false }]],
      [["c", true], [{ foo: 5, bar: "c", baz: true }]],
    ]);
  });

  it("returns the head of a list", () => {
    const seq = LazySeq.ofRange(1, 10);
    const empty = LazySeq.ofIterable([]);

    expect(seq.head()).to.equal(1);
    expect(empty.head()).to.be.undefined;
  });

  it("calculates the length", () => {
    const seq = LazySeq.ofRange(1, 10);
    expect(seq.length()).to.equal(9);
  });

  it("maps a function", () => {
    const seq = LazySeq.ofRange(1, 10);
    const seq2 = seq.map((i) => i * 2);

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(seq2.toRArray()).to.deep.equal([2, 4, 6, 8, 10, 12, 14, 16, 18]);
  });

  it("collects non-null values", () => {
    const seq = LazySeq.ofRange(1, 10);
    const seq2 = seq.collect((i) => (i % 2 === 0 ? i : null));

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(seq2.toRArray()).to.deep.equal([2, 4, 6, 8]);
  });

  it("collects non-null undefined", () => {
    const seq = LazySeq.ofRange(1, 10);
    const seq2 = seq.collect((i) => (i % 2 === 0 ? i : undefined));

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(seq2.toRArray()).to.deep.equal([2, 4, 6, 8]);
  });

  it("maximizes a sequence", () => {
    const seq = LazySeq.ofRange(1, 5).concat(LazySeq.ofRange(-10, -4));
    const seq2 = seq.map((i) => ({ foo: i })).maxOn((x) => x.foo);

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, -10, -9, -8, -7, -6, -5]);
    expect(seq2).to.deep.equal({ foo: 4 });
  });

  it("returns undefined for the max of an empty sequence", () => {
    const seq = LazySeq.ofIterable([]);
    expect(seq.maxOn(() => 40)).to.be.undefined;
  });

  it("minimizes a sequence", () => {
    const seq = LazySeq.ofRange(8, 12).concat(LazySeq.ofRange(1, 3));
    const seq2 = seq.map((i) => ({ foo: i })).minOn((x) => x.foo);

    expect(seq.toRArray()).to.deep.equal([8, 9, 10, 11, 1, 2]);
    expect(seq2).to.deep.equal({ foo: 1 });
  });

  it("returns undefined for the min of an empty sequence", () => {
    const seq = LazySeq.ofIterable([]);
    expect(seq.minOn(() => 40)).to.be.undefined;
  });

  it("prepends to a sequence", () => {
    const seq = LazySeq.ofRange(1, 10);
    const seq2 = seq.prepend(100);

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(seq2.toRArray()).to.deep.equal([100, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("prepends multiple values to a sequence", () => {
    const seq = LazySeq.ofRange(1, 10);
    const seq2 = seq.prependAll(LazySeq.ofRange(100, 103));

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(seq2.toRArray()).to.deep.equal([100, 101, 102, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("sorts a sequence by a comparison function", () => {
    const seq = LazySeq.ofRange(1, 10);
    const sorted = seq.sortWith((a, b) => b - a); // descending

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(sorted.toRArray()).to.deep.equal([9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("sorts by custom keys", () => {
    const seq = LazySeq.ofIterable([
      { foo: 1, bar: "z" },
      { foo: 2, bar: "yA" },
      { foo: 2, bar: "yB" },
      { foo: 3, bar: "xB" },
      { foo: 3, bar: "xA" },
      { foo: 4, bar: "w" },
      { foo: 5, bar: "v" },
      { foo: 6, bar: "u" },
    ]);

    expect(
      seq
        .sort(
          (x) => x.foo,
          (x) => x.bar
        )
        .toRArray()
    ).to.deep.equal([
      { foo: 1, bar: "z" },
      { foo: 2, bar: "yA" },
      { foo: 2, bar: "yB" },
      { foo: 3, bar: "xA" },
      { foo: 3, bar: "xB" },
      { foo: 4, bar: "w" },
      { foo: 5, bar: "v" },
      { foo: 6, bar: "u" },
    ]);

    // try desc
    expect(seq.sort({ desc: (x) => x.foo }, (x) => x.bar).toRArray()).to.deep.equal([
      { foo: 6, bar: "u" },
      { foo: 5, bar: "v" },
      { foo: 4, bar: "w" },
      { foo: 3, bar: "xA" },
      { foo: 3, bar: "xB" },
      { foo: 2, bar: "yA" },
      { foo: 2, bar: "yB" },
      { foo: 1, bar: "z" },
    ]);

    // bar first
    expect(seq.sort({ asc: (x) => x.bar }).toRArray()).to.deep.equal([
      { foo: 6, bar: "u" },
      { foo: 5, bar: "v" },
      { foo: 4, bar: "w" },
      { foo: 3, bar: "xA" },
      { foo: 3, bar: "xB" },
      { foo: 2, bar: "yA" },
      { foo: 2, bar: "yB" },
      { foo: 1, bar: "z" },
    ]);
  });

  it("sums a sequence", () => {
    const seq = LazySeq.ofRange(1, 10);
    const sum = seq.sumOn((i) => i * 2);
    expect(sum).to.equal(90);
  });

  it("returns the tail of a sequence", () => {
    const seq = LazySeq.ofRange(1, 10);
    const seq2 = seq.tail();

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(seq2.toRArray()).to.deep.equal([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("takes the tail of the empty sequence", () => {
    const seq = LazySeq.ofIterable([]);
    const seq2 = seq.tail();
    expect(seq.toRArray()).to.deep.equal([]);
    expect(seq2.toRArray()).to.deep.equal([]);
  });

  it("takes a number of elements", () => {
    const seq = LazySeq.ofRange(1, 10);
    const seq2 = seq.take(3);
    const seq3 = seq.take(5);
    const seq4 = seq.take(100);

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(seq2.toRArray()).to.deep.equal([1, 2, 3]);
    expect(seq3.toRArray()).to.deep.equal([1, 2, 3, 4, 5]);
    expect(seq4.toRArray()).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("takeWhile a condition is true", () => {
    const seq = LazySeq.ofRange(1, 10).append(-5);
    const seq2 = seq.takeWhile((i) => i < 5);

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9, -5]);
    expect(seq2.toRArray()).to.deep.equal([1, 2, 3, 4]);
  });

  it("zips two sequences", () => {
    const seq = LazySeq.ofRange(1, 10);
    const seq2 = LazySeq.ofRange(100, 111); // different length
    const zip = seq.zip(seq2);

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(seq2.toRArray()).to.deep.equal([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110]);
    expect(zip.toRArray()).to.deep.equal([
      [1, 100],
      [2, 101],
      [3, 102],
      [4, 103],
      [5, 104],
      [6, 105],
      [7, 106],
      [8, 107],
      [9, 108],
    ]);
  });

  it("converts to a mutable array", () => {
    const seq = LazySeq.ofIterable([1, 2, 3, 4, 5]);
    const arr = seq.toMutableArray();
    arr.push(100);

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 5]);
    expect(arr).to.deep.equal([1, 2, 3, 4, 5, 100]);
  });

  it("converts to a sorted array", () => {
    const seq = LazySeq.ofIterable([1, 2, 3, 4, 5]);
    const sorted = seq.toSortedArray({ desc: (x) => x });

    expect(sorted).to.deep.equal([5, 4, 3, 2, 1]);
  });

  it("converts to a IMap");

  it("converts to a JS map", () => {
    const seq = LazySeq.ofIterable([
      {
        foo: 1,
        bar: "hello",
      },
      {
        foo: 1,
        bar: "world",
      },
      {
        foo: 2,
        bar: "!!!",
      },
      {
        foo: 3,
        bar: "??!?",
      },
    ]);

    const m = seq.toRMap(
      (x) => [x.foo, x.bar],
      (x, y) => x + y
    );

    expect(m).to.deep.equal(
      new Map([
        [1, "helloworld"],
        [2, "!!!"],
        [3, "??!?"],
      ])
    );

    const mm = seq.toMutableMap(
      (x) => [x.foo, x.bar],
      (x, y) => x + y
    );
    mm.set(4, "new");
    expect(mm).to.deep.equal(
      new Map([
        [1, "helloworld"],
        [2, "!!!"],
        [3, "??!?"],
        [4, "new"],
      ])
    );

    // try without a merge function
    const m3 = seq.toRMap((x) => [x.foo, x.bar]);
    expect(m3).to.deep.equal(
      new Map([
        [1, "world"],
        [2, "!!!"],
        [3, "??!?"],
      ])
    );
  });

  it("converts to an object", () => {
    const seq = LazySeq.ofIterable([
      {
        foo: 1,
        bar: "hello",
      },
      {
        foo: 1,
        bar: "world",
      },
      {
        foo: 2,
        bar: "!!!",
      },
      {
        foo: 3,
        bar: "??!?",
      },
    ]);

    const o = seq.toObject(
      (x) => [x.foo, x.bar],
      (x, y) => x + y
    );

    expect(o).to.deep.equal({
      1: "helloworld",
      2: "!!!",
      3: "??!?",
    });

    // try without a merge function
    const o2 = seq.toObject((x) => [x.foo, x.bar]);
    expect(o2).to.deep.equal({
      1: "world",
      2: "!!!",
      3: "??!?",
    });
  });

  it("converts to a JS set", () => {
    const seq = LazySeq.ofRange(1, 5).concat(LazySeq.ofRange(1, 5));
    const set = seq.toRSet((x) => x * 2);
    const mset = seq.toMutableSet((x) => x * 3);
    mset.add(100);

    expect(seq.toRArray()).to.deep.equal([1, 2, 3, 4, 1, 2, 3, 4]);
    expect(set).to.deep.equal(new Set([2, 4, 6, 8]));
    expect(mset).to.deep.equal(new Set([100, 3, 6, 9, 12]));
  });

  it("builds a lookup in an IMap");

  it("builds a lookupMap in an IMap");

  it("builds a lookup in a ReadonlyMap", () => {
    const seq = LazySeq.ofIterable([
      {
        foo: 1,
        bar: "hello",
      },
      {
        foo: 1,
        bar: "world",
      },
      {
        foo: 2,
        bar: "!!!",
      },
      {
        foo: 3,
        bar: "??!?",
      },
    ]);

    const look = seq.toRLookup((s) => s.foo);
    // chai's deep equality doesn't work with Maps containing objects
    // https://github.com/chaijs/deep-eql/issues/46
    assert.deepEqual(
      look,
      new Map([
        [
          1,
          [
            { foo: 1, bar: "hello" },
            { foo: 1, bar: "world" },
          ],
        ],
        [2, [{ foo: 2, bar: "!!!" }]],
        [3, [{ foo: 3, bar: "??!?" }]],
      ])
    );

    const look2 = seq.toRLookup(
      (s) => s.foo,
      (s) => s.bar
    );
    assert.deepEqual(
      look2,
      new Map([
        [1, ["hello", "world"]],
        [2, ["!!!"]],
        [3, ["??!?"]],
      ])
    );
  });

  it("transforms to something else", () => {
    const seq = LazySeq.ofRange(1, 10);
    const x = seq.transform((s) => s.length());

    expect(x).to.equal(9);
  });
});
