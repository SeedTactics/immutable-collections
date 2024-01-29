# Persistent immutable collections for typescript

[![npm](https://img.shields.io/npm/v/@seedtactics/immutable-collections)](https://www.npmjs.com/package/@seedtactics/immutable-collections)
[![codecov](https://codecov.io/gh/SeedTactics/immutable-collections/branch/main/graph/badge.svg?token=GOYMOGYAOE)](https://codecov.io/gh/SeedTactics/immutable-collections)
[![CI](https://github.com/seedtactics/immutable-collections/actions/workflows/ci.yaml/badge.svg)](https://github.com/SeedTactics/immutable-collections/actions/workflows/ci.yaml)

Zero dependency library for immutable collections in typescript.

## Features

- An immutable hash-based map with fast constant time operations (as long as there are no collisions).
- An immutable balanced binary tree with guaranteed log n operations.
- Two equivalent APIs:
  - A class-based API with classes for HashMap and OrderedMap.
  - A function API with better tree-shaking and bundle size.
- Efficient bulk operations for modifying many keys at once in a single change.
- Support for shallow comparision to determine if a data structure actually changed.
- An iterable wrapper for lazy data manipulation.

## Docs

See the [website](https://immutable-collections.seedtactics.com) for full
[API docs](https://immutable-collections.seedtactics.com/docs/api/classes).

## Install

Install with npm/yarn/pnpm from the [npm registry](https://www.npmjs.com/package/@seedtactics/immutable-collections).

## Use

To use the class-based API, import from the `@seedtactics/immutable-collections` module directly.
See the [comparison docs](https://immutable-collections.seedtactics.com/docs/data-structure-compare)
to decide between a HashMap or an OrderedMap.

```ts
import { HashMap, OrderedMap } from "@seedtactics/immutable-collections";
```

## Lists

This library does not implement an immutable list. The [funkia/list](https://github.com/funkia/list) library
already contains a high-quality immutable list which can be used in conjunction with
the immutable maps in this library. An alternative is to use an OrderedMap as a kind
of sequence by using a number key. This works well for sorted lists by
using the sort as the key. Then, whenever you iterate the values in the OrderedMap, the values will be in
ascending order of keys. The OrderedMap also has functions to view, modify, or pop the entry with
the largest or smallest key, allowing list operations at the ends of the list.

## Development

Immutable-collections is written in pure typescript with an extensive test suite using mocha and chai, using `pnpm` as
a package manager. Run `pnpm test` to run the test suite or `pnpm coverage` to run the test suite and also output coverage
information.

The website is built using [docusaurus](https://docusaurus.io/) and lives inside the website subdirectory.
Instead of using typedoc, we have a custom script which converts the tsdoc comments in the source files
into markdown: [website/tsdoc-to-mdx.mts](website/tsdoc-to-mdx.mts). This only supports a subset of
tsdoc at the moment. Run `pnpm run generate` in the website subdirectory to generate the markdown files
and then `pnpm run start` to start the docuasurus dev server.

## Related Projects

- [hamt_plus](https://github.com/mattbierner/hamt_plus) - A javascript hash array mapped trie. immutable-collections was
  initially motivated by converting hamt_plus to typescript so as to add in additional operations.
- [Haskell unordered containers](https://github.com/haskell-unordered-containers/unordered-containers) - An implementation
  of a hash array mapped trie in Haskell. The operations and algorithms in the Haskell version influenced the implementation in this library.
- [Haskell containers](https://github.com/haskell/containers) - An implementation of many immutable data structures in Haskell.
  In particular the implementation of the balanced tree influenced the algorithms and implementation in this library.
- [funkia/list](https://github.com/funkia/list) - A high-quality immutable list library.
