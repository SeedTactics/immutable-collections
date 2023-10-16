# HashMap and OrderedMap

This library contains two immutable data structures. The first is
[HashMap](api/HashMap.mdx), which implements a [Hash Array Mapped
Trie](https://en.wikipedia.org/wiki/Hash_array_mapped_trie). It supports fast constant time
operations (as long as there are no hash collisions) but no guarantee on the
ordering of entries. The second data structure is [OrderedMap](api/OrderedMap.mdx),
which implements a balanced binary tree. The OrderedMap supports all the operations
of the HashMap, in addition to iterating the entries in ascending or descending order of keys and finding the
minimum/maximum key.
