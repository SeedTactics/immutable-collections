# LazySeq

This library contains a data manipulation class [LazySeq](api/LazySeq.mdx) in
the spirit of lodash, underscore, or C#'s LINQ. The LazySeq class provides a
class wrapper around Iterables and has methods such as
[map](api/LazySeq.mdx#map), [filter](api/LazySeq.mdx#filter),
[groupBy](api/LazySeq.mdx#groupBy) and many more. These methods are all lazy
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
