# Immutable Collections

Zero dependency library for immutable collections in typescript.

## Features

- An immutable hash-based map with fast constant time operations (as long as there are no collisions).
- An immutable balanced binary tree with guaranteed log n operations.
- [Two equivalent APIs](bundle-size):
  - A [class-based API](api/classes) with classes for [HashMap](api/hashmap) and [OrderedMap](api/orderedmap).
  - A function API with better tree-shaking and bundle size for the [hash array mapped trie](api/hamt) and [balanced tree](api/tree).
- Efficient [bulk operations](bulk-operations) for modifying many keys at once in a single change.
- Support for [shallow comparision](shallow-comparison) to determine if a data structure actually changed.
- An iterable wrapper for [lazy data manipulation](data-manipulation).

## Install

Install with npm/yarn/pnpm from the [npm registry](https://www.npmjs.com/package/@seedtactics/immutable-collections).

## Use

To use the [class-based API](api/classes), import from the `@seedtactics/immutable-collections` module directly.
See the [comparison docs](data-structure-compare) to decide between a HashMap or an OrderedMap.

```ts
import { HashMap, OrderedMap } from "@seedtactics/immutable-collections";
```

For smaller bundler size but slightly less ergonomic to use, import the [hamt](api/hamt) or [tree](api/tree) submodules.
See the [bundle size docs](bundle-size) for full details comparing the two APIs. You should only use either the class based API
or the function API; they export equivalent functionality.

```ts
import * as HAMT from "@seedtactics/immutable-collections/hamt";
import * as tree from "@seedtactics/immutable-collections/tree";
```

## Lists

This library does not implement an immutable list. The [funkia/list](https://github.com/funkia/list) library
already contains a high-quality immutable list which can be used in conjunction with
the immutable maps in this library. An alternative is to use an [OrderedMap](api/orderedmap) as a kind
of sequence by using a number key. This works well for sorted lists by
using the sort as the key. Then, whenever you iterate the values in the OrderedMap, the values will be in
ascending order of keys. The OrderedMap also has functions to view, modify, or pop the entry with
the largest or smallest key, allowing list operations at the ends of the list.
