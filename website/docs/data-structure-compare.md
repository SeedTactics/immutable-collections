# HashMap and OrderedMap

This library contains two immutable data structures. The first is
[HashMap](api/hashmap), which implements a [Hash Array Mapped
Trie](https://en.wikipedia.org/wiki/Hash_array_mapped_trie). It supports fast constant time
operations (as long as there are no hash collisions) but no guarantee on the
ordering of entries. The second data structure is [OrderedMap](api/orderedmap),
which implements a balanced binary tree with guaranteed logarithmic time operations.

## Features

The OrderedMap supports all the operations of the HashMap, including all the [bulk modification](bulk-operations)
operations, lookup, adjust, and so on. But the OrderedMap has some additional operations that the HashMap does not:

- The keys and values can be iterated in ascending or descending order.

- The minimum and maximum key can be found and removed efficiently with
  [lookupMin](api/OrderedMap#lookupMin), [lookupMax](api/OrderedMap#lookupMax),
  [deleteMin](api/OrderedMap#deleteMin) and [deleteMax](api/OrderedMap#deleteMax).
  This allows the OrderedMap to be used as a priority queue.

- The OrderedMap can be efficiently [split](api/OrderedMap#split) in logorithmic time into two maps
  based on a key, with one OrderedMap containing all the keys less than the split key and the other
  all the keys greater than the split key.

## Performance

Consider three possible immutable map data structures in typescript:

- Use the built-in [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)
  class but use the `ReadonlyMap<K, V>` type to prevent mutation. When you wish to change entries, make a full
  copy of the entire data structure with the changes. This is made easier by the [immer](https://immerjs.github.io/immer/)
  module; immer will automatically make a new copy of the map, apply the changes, and return as a new map with type
  `ReadonlyMap<K, V>`.

- Use the [HashMap](api/hashmap) class.

- Use the [OrderedMap](api/orderedmap) class.

Comparing the performance:

- Less than about 50 entries, all three approaches perform basically the same. Using the builtin Map is
  probably the easiest to use with immer, but the builtin Map does not have things like [bulk operations](bulk-operations)
  or other conveniences. These bulk operations increase code clarity by more direclty expressing the intent of the code,
  so even ignoring performance there is a preference for OrderedMap or HashMap.

- Less than about 10,000 entries, the HashMap and OrderedMap perform about the same; benchmarks of the two are
  within the margin of error of each other. For lookup and initial construction, the builtin Map is about 4x
  faster than the HashMap or OrderedMap. For any modification, both the HashMap and OrderedMap are much, much
  faster. Both OrderedMap and HashMap will only modify a few nodes in the tree using structural sharing while
  immer will make a full copy which is slow.

- Between 10,000 and 50,000 entries, the HashMap starts to perform better than the OrderedMap (as long as there
  are only a few key hash collisions), although the performance benifit is only about 20% or so at 50,000 entries
  and OrderedMap still performs very well. If you are doing any modification at all, the builtin Map should
  not even be considered.

- Above 50,000 entries the HashMap is a clear winner in performance as long as you can keep hash collisions
  to a minimum, although the OrderedMap still performs well so if you need the extra features of OrderedMap,
  it is still a good choice.

Typically, we suggest just using `OrderedMap` for almost all immutable maps; for
small maps the performance is basically the same and you get all the extra
features, and for large maps the performance is still good enough. In the rare
cases with very large maps, switch to `HashMap`. If you are already using
[immer](https://immerjs.github.io/immer/) and are using small maps, you can
consider using the builtin Map. But in our experience once you get a hang of the
[bulk operations](bulk-operations) and [data manipulation](data-manipulation)
features, they work just as well as immer while providing slightly more clarity
in the code.

## Security

Hash-based data structures are vulnerable to [hash collision
attacks](https://en.wikipedia.org/wiki/Collision_attack). If an attacker can
control or influence the keys, the attacker can choose keys that will all hash
to the same value and degrade the performance of the HashMap. This degraded
performance can lead to a [denial of
service](https://en.wikipedia.org/wiki/Denial-of-service_attack) if the network server
spends more compute time than expected on requests.

By default, the HashMap does **not** protect against hash collision attacks; the default hashing
algorithm is [FNV-1](https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function).

To protect against hash collision attacks, either use an OrderedMap which
guarantees a balanced tree no matter the keys, or use a HashMap with a
cryptographically secure hash function. A good option is
[highwayhash](https://github.com/google/highwayhash); there are [several javascript
implementations](https://github.com/google/highwayhash#third-party-implementations--bindings)
to choose from.

To use a custom hash function with the [class api](api/classes), implement a custom key class
with a `hash` function (see [HashableObj](api/classes#HashableObj)).

```ts
const key = require("crypto").randomBytes(32);
const highwayhash = require("highwayhash");

export class SomeKey implements HashableObj {
  constructor(public readonly value: string) {}

  hash() {
    return highwayhash.asUInt32Low(key, this.value);
  }

  compare(other: SomeKey) {
    return this.value.localeCompare(other.value);
  }
}
```

If instead using [hamt](api/hamt), create a custom [HashConfig](api/hamt#HashConfig) and pass it to each function call:

```typescript
const key = require("crypto").randomBytes(32);
const highwayhash = require("highwayhash");

const stringHashCfg = {
  hash(value: string) {
    return highwayhash.asUInt32Low(key, value);
  },
  compare(a: string, b: string) {
    return a.localeCompare(b);
  },
};
```
