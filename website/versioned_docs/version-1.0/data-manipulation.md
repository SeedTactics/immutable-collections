# LazySeq

This library contains a data manipulation class [LazySeq](api/LazySeq) in
the spirit of lodash, underscore, or C#'s LINQ. The LazySeq class provides a
class wrapper around Iterables and has methods such as
[map](api/LazySeq#map), [filter](api/LazySeq#filter),
[groupBy](api/LazySeq#groupBy) and many more. Using LazySeq is optional;
OrderedMap and HashMap implement the iterator protocol and thus work fine with
lodash or ramda. The main advantage of LazySeq is that
it has termination methods into immutable HashMaps and OrderedMaps; lodash and ramda just
have termination methods into javascript array, objects, or Maps.

## Lazy Data Calculations

The general format for data manipulation is to start with some data in
a data structure such as an array, object, HashMap, OrderedMap etc. Next, create a new
LazySeq chain starting from the initial data, call various transformation
methods to map, group, filter, aggregate the data, and finally terminate the
chain by converting back to a data structure.

Most of the transformation methods are lazy, meaning that they just produce a
new LazySeq (which is a wrapper around an Iterable) and don't immedietly
calculate the result. It isn't until the termination method that the data is
iterated and then the termination data structure is built directly from the
transformed data in one pass.

## Initiation

A lazyseq chain is initialized from a starting data structure; this could be an array of objects
coming from fetch or existing stored data. If the data is coming from an [OrderedMap](api/OrderedMap)
or [HashMap](api/HashMap), these objects have several methods which create a LazySeq such as
[HashMap.toLazySeq](api/HashMap#toLazySeq) or [OrderedMap.toDescLazySeq](api/OrderedMap#toDescLazySeq).

If the data is in a javascript array or anything else that supports the
Iterater protocol, use [LazySeq.of](api/LazySeq#of). If the data is in a
javascript object, use [LazySeq.ofObject](api/LazySeq#ofObject) which will
iterate the own properties of the object. Finally, there is a
[LazySeq.range](api/LazySeq#range) which allows creating LazySeqs of integer
ranges.

## Transformation

The LazySeq class supports a large number of transformation operations, including mapping, filtering,
grouping, sorting, and more. See the [LazySeq docs](api/LazySeq) for the full list. Most of these operations are lazy,
although some such as grouping must strictly consume the input LazySeq in order to create the groups. The API docs
for each method specify if it is lazy or eager.

## Termination

The LazySeq chain should almost always be terminated into a data structure immedietly
after it is created. Typically, the LazySeq should never even be stored in a
variable; create the LazySeq from some data, chain a bunch of transformation
methods, end with a termination method, and put the resulting data structure
into a variable.

Since the LazySeq is lazy, if you store the LazySeq it will keep
references to all the original data stucture memory and each time you iterate it will
recalculate the chain. Since the original data is (or at least should be) immutable,
the result of the LazySeq chain will be the same each time it is iterated.

The [LazySeq api docs](api/LazySeq) contain the full list of termination methods (there are
a lot). You can terminate into javascript objects, javascript maps, arrays, sorted arrays,
[HashMap](api/HashMap)s, [OrderedMap](api/OrderedMap)s, and even HashMaps of HashMaps similar
to C#'s ILookup.
