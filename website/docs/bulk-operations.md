# Bulk Operations

Both [HashMap](api/hashmap) and [OrderedMap](api/orderedmap) support bulk modification operations,
which are methods which allow changing many keys at once. While you can forgo the bluk modification
operations and just use [set](api/hashmap#set), the bulk modification operations have several advantages.
First, they provide clarity, can simplify the code, and more directly express the intent of the code.
Second, for large data structures, the bulk modification operations are more efficient than modifying
each key individually.

While in our experience the increase in code clarity is the main benifit of bulk operations,
there is a performance benifit as well (especially for maps with more than 10,000 entries).
Because [HashMap](api/HashMap) and [OrderedMap](api/OrderedMap) are immutable,
each modification operation returns a new data structure. This is not a full
copy because of structural sharing: only the tree nodes which changed are copied
and the rest of the tree nodes are shared between the old and the new data
structure. Typically, only a constant or `log n` number of entries are copied
which allows methods like [HashMap.set](api/HashMap.mdx#set) to be efficient
even on very large data structures. Despite that, the bulk modification operations
improve efficiency even more by allowing a single pass through the tree to modify many
entires at once. (For example, only rebalancing the OrderedMap once instead of
after each individual set operation.)

## Bulk Creation Operations

The first kind of bulk operation are the functions to build a new map from an
iterable. While you could start with an empty map and add entries one by one,
the [HashMap.from](api/hashmap#from), [OrderedMap.from](api/orderedmap#from),
[HashMap.build](api/hashmap#build), and [OrderedMap.build](api/orderedmap#build)
methods will return a new filled data structure. [LazySeq](api/lazyseq) has
several methods which call from and build, which allows creating a map at the
end of a chain of [data manipulation](data-manipulation) calls.

The `from` and `build` methods differ slightly: with from, you provide an iterable of keys and
values and a merge function, where the merge function is called to merge two values if there
is a duplicate key. Importantly, the merge function is called only when there is a duplicate key.
On the other hand, `build` takes an iterable of arbitrary type and you provide a key and value
extraction functions. These extraction functions are called for every single entry.

## Bulk Modification Operations

#### Union

[HashMap.union](api/hashmap#union) and [OrderedMap.union](api/orderedmap#union) allow you to bulk-add
many keys and values at once. Consider you have an existing map and you want to add several more keys
and values while also performing some logic on each existing value.

The first step is to create a new map with the entires to add using a bulk creation method
described above. The reason that union requires the new entries as a map
instead of say an `Iterable` is that union can be very efficient when the
new entries are already hashed and organized by hash or when the new entries
are already balanced by key.

Once the entries to add are in a map, then call `union`. The `union` method accepts
a function `merge` which you can use to perform some logic on each existing value
and new value to determine how to handle entries whose key already exists.

#### Intersection

[HashMap.intersection](api/hashmap#intersection) and [OrderedMap.intersection](api/orderedmap#intersection)
are used to produce a new map with only the keys which exist in both maps. Typically it is not as useful
as the other operations, but it is occasionally used with sets ([HashSet.intersection](api/hashset#intersection)
and [OrderedSet.intersection](api/orderedset#intersection)).

#### Difference

[HashMap.difference](api/hashmap#difference) and [OrderedMap.difference](api/orderedmap#difference)
are used to bulk-remove many keys at once. Similar to union, the keys to remove are provided
already built into a map so that the keys to remove are already hashed/balanced so that
a single pass through the tree can remove all the keys at once.

The keys to remove can either be provided in a HashMap/OrderedMap with arbitrary
values (the values are ignored), or the keys to remove can be provided as a
[HashSet](api/hashset) or [OrderedSet](api/orderedset). If provided as a set,
the method is named [HashMap.withoutKeys](api/hashmap#withoutKeys) or
[OrderedMap.withoutKeys](api/orderedmap#withoutKeys). Despite the different
name, difference and withoutKeys are the same underlying implementation. When building
the keys to remove using say [LazySeq](api/lazyseq), you can terminate the chain in either
a map or a set depending on which is more convenient.

#### Adjust

[HashMap.adjust](api/hashmap#adjust) and [OrderedMap.adjust](api/orderedmap#adjust) are the most general
bulk operations. Adjust allows adding, modifying, and deleting many keys and values at once. Adjust accepts
two parameters:

- First, a map of keys to adjust with arbitrary helper values. As before, the map of keys to adjust
  is typically built using a chain of [data manipulation](data-manipulation) methods. The helper value could
  be some intermediate value built during the LazySeq chain, for example the groups in a call to groupBy.

- Second, a function `adjustVal` which is called for each key to adjust along with the existing value (or undefined)
  and the helper value. This `adjustVal` function returns either the updated value to put into the map or undefined
  to remove the key and value.

Adjust is more general than union/intersection/difference because you can
provide custom logic in the `adjustVal` which is executed for each key and
entry, and importantly the `adjustVal` custom logic gets access to the values
from both maps. Union is instead provided a merge function but the merge
function is called only for duplicate keys, so you don't get to provide custom
logic when a key is missing in one of the maps.

This distinction should guide your choice between union and adjust; the main
benefit of the bulk operations is code clarity so if there is some logic which
is needed which requires both (possibly undefined) values from both maps, put
the logic into the `adjustVal` function and use adjust. (As a secondary
consideration, union/intersection/difference are slightly faster than adjust so
if you don't need the extra features, use union/intersection/difference.)
