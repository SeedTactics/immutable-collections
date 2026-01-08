# Two APIs

This library exports two equivalent APIs. The first is a [class-based API](api/classes) which has classes
for [HashMap](api/hashmap), [OrderedMap](api/orderedmap), and more. The second is a function API without classes. The two
APIs export equivalent functionality.

## Classes

The class-based API has methods for the various operations, such as [HashMap.delete](api/hashmap#delete).
The class-based API is ergonomic with easy to discover methods, but the downside
is current bundlers such as webpack, esbuild, swc, etc. do not tree-shake classes. Thus if you import
one of the classes, all the methods and basically the entire library will get included in the resulting bundle. Immutable-collections
has no dependencies and is relatively small but the library does occasionally trade a slight increase in bundle size for
faster performance by implementing specialized operations.

To use the class-based API, import from the `@seedtactics/immutable-collections` module directly; the [main API docs](api/classes) show all exports.

```ts
import { OrderedMap } from "@seedtactics/immutable-collections";
```

## Functions

The second API is a function API for the [hash array mapped trie](api/hamt) and [balanced tree](api/tree).
These modules export individual functions for the various operations such as [delete](api/hamt#delete).
This API supports full tree-shaking with bundlers and only the functions that you import will be included
in the resulting bundle.

To use, import either the [hamt](api/hamt) or the [tree](api/tree) submodule.
Also, make sure to not import any of the classes from the main module, since a
class will drag in all the methods and the entire library.

```ts
import * as HAMT from "@seedtactics/immutable-collections/hamt";
import * as Tree from "@seedtactics/immutable-collections/tree";
```

The HAMT hash-based data structure uses the balanced tree submodule for collisions. That
is, when two keys have the same hash, the HAMT will store the colliding keys and
values in a balanced tree using functions from the tree submodule. This is
internal to the module and you don't need to interact with or even know about this to
use the library, but it does impact the bundle size. For example, if you import
the [HAMT.union](api/hamt#union) function, the [tree union](api/tree#union) function will also be
included in the bundle since it is used internally by `HAMT.union`. This is fully
exposed to the bundler tree-shaking, so if you don't use `HAMT.union` then the tree
union function will not appear in the resulting bundle.

Because the HAMT uses the tree submodule internally, the smallest possible bundle
is to not import HAMT at all and just use the balanced binary tree only.
