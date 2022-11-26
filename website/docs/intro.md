---
sidebar_position: 1
---

# Immutable Collections

Zero dependency library for immutable collections.

## Immutable Data

## HashMap and OrderedMap

This library contains two immutable data structures. The first is
[HashMap](api/HashMap.mdx), which implements a [Hash Array Mapped
Trie](https://en.wikipedia.org/wiki/Hash). It supports fast constant time
operations (as long as there are no hash collisions) but no guarantee on the
ordering of entries. The second data structure is [OrderedMap](api/OrderedMap.mdx),
which implements a balanced binary tree. The OrderedMap supports all the operations
of the HashMap, in addition to iterating the entries in ascending or descending order of keys and finding the
minimum/maximum key.

## Two APIs

This library exports two equivalent APIs. The first is a [class-based API](api/class_api.mdx) which has classes
for [HashMap](api/HashMap.mdx), [OrderedMap](api/OrderedMap.mdx), and more. These classes have methods for the various operations,
such as [HashMap.delete](api/HashMap.mdx#delete). The class-based API is ergonomic with easy to discover methods, but the downside
is current bundlers such as webpack, esbuild, swc, etc. do not tree-shake classes. Thus if you import
one of the classes, all the methods and basically the entire library will get included in the resulting bundle. Now immutable-collections
has no dependencies and is relatively small but we have occasionally traded a slight increase in bundle size for
faster performance, by implementing many specialized operations such as [HashMap.collect](api/HashMap.mdx#collect) and many others.

The second API is a function API for the [hash array mapped trie](api/data_structures_hamt.mdx) and [balanced tree](api/data_structures_tree.mdx).
These modules export individual functions and support full tree-shaking with bundlers. Only the functions that you import will be included
in the resulting bundle.

## Bulk Operations

Because the collections are immutable, each modification operation returns a new
data structure. This is not a full copy because of structural sharing, so
typically only a constant or `log n` entries are copied which allows methods like
[HashMap.add](api/HashMap.mdx#add) to be efficient. Both HashMap and OrderedMap
also have bulk modification operations which allow you to change many keys at once
and return a new data structure containing all the changes. The bulk operations should
be preferred, but operating on individual entries is still efficient; thus, code clarity
and ease of understanding should be the most important factor in deciding to use individual vs bulk operations.

The first kind of bulk operations build new data structures from [Iterables](mdn iterable), and include
[HashMap.from](api/HashMap.mdx#from), [HashMap.build](api/HashMap.mdx#build), [OrderedMap.from](api/OrderedMap.mdx#from),
and [OrderedMap.build](api/OrderedMap.mdx#build). The from and build operations create new immutable data structures from an Iterable such as Arrays, javacript Maps, [LazySeqs](api/LazySeq.mdx), or hand built generators. The second kind of bulk operations allow adding/updating/deleting many keys and values
at once. The main operation is [HashMap.adjust](api/HashMap.mdx#adjust) and [OrderedMap.adjust](api/OrderedMap.mdx#adjust), but there are
several more as well.

## Shallow Comparison

Each modification operation such as [HashMap.delete](api/HashMap.mdx#delete)
does not modify the existing data structure in place but returns a `HashMap`
which contains the result of the modification. This library guarantees that if
no modification actually took place, the original javascript object is returned.
For example, if you call delete on a key that does not exist or call [filter](api/HashMap.mdx#filter) and don't actually filter anything, the existing
javascript object for the data structure is returned unchanged.

Therefore, you can use `===` or [Object.is](mdn Object.is) on the data structure
object to determine if the data structure actually changed. This is useful
for `React.useMemo` or other memoization techniques to only compute something when
the contents of the data structure actually change.

## LazySeq

This library contains a data manipulation class [LazySeq](api/LazySeq.mdx) in
the spirit of lodash, underscore, or C#'s LINQ. The LazySeq class provides a
class wrapper around Iterables and has methods such as
[map](api/LazySeq.mdx#map), [filter](api/LazySeq.mdx#filter),
[groupBy](api/class_api.mdx#groupBy) and many more. These methods are all lazy
in the sense that they just produce a new Iterable and don't immediately
calculate the result. The LazySeq class also provides a number of termination
methods such as [toHashMap](api/LazySeq.mdx#toHashMap) which execute the LazySeq
and produce a new data structure. LazySeq has termination methods to convert
the data into HashMaps, OrderedMaps, arrays, javascript maps, sets, and more.

The general format for data manipulation is therefore to start with some data in
a data structure such as an array, object, HashMap, etc. Then, create a new
LazySeq chain starting from the initial data, call various transformation
methods to map, group, filter, aggregate the data, and finally terminate the
chain by converting back to a data structure. Because all the transformation
methods are lazy, the new terminating data structure is built directly from the
transformed data in one pass.

This is very similar to lodash or ramda, but the main advantage of LazySeq is that
it has termination methods into immutable HashMaps and OrderedMaps; lodash and ramda just
have termination methods into javascript array, objects, or Maps.

## Lists

This library does not implement an immutable list. The [funka/list](npm list) library
already contains a high-quality immutable list which can be used in conjunction with
the immutable maps in this library. An alternative is to use an OrderedMap as a kind
of sequence; use a number key as the index. This works well for sorted lists;
use the sort as the key and whenever you iterate the OrderedMap it will be in ascending
order.
