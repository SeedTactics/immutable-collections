# Bulk Operations

Because the collections are immutable, each modification operation returns a new
data structure. This is not a full copy because of structural sharing, so
typically only a constant or `log n` entries are copied which allows methods like
[HashMap.set](api/HashMap.mdx#set) to be efficient. Both HashMap and OrderedMap
also have bulk modification operations which allow you to change many keys at once
and return a new data structure containing all the changes. The bulk operations should
be preferred, but operating on individual entries is still efficient; thus, code clarity
and ease of understanding should be the most important factor in deciding to use individual vs bulk operations.

The first kind of bulk operations build new data structures from
[Iterables](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols), and include
[HashMap.from](api/HashMap.mdx#from), [HashMap.build](api/HashMap.mdx#build), [OrderedMap.from](api/OrderedMap.mdx#from),
and [OrderedMap.build](api/OrderedMap.mdx#build). The from and build operations create new immutable data structures from an Iterable such as Arrays, javacript Maps, [LazySeqs](api/LazySeq.mdx), or hand built generators. The second kind of bulk operations allow adding/updating/deleting many keys and values
at once. The main operation is [HashMap.adjust](api/HashMap.mdx#adjust) and [OrderedMap.adjust](api/OrderedMap.mdx#adjust), but there are
several more as well.
