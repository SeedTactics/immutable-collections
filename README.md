# Persistent immutable collections for typescript

[![codecov](https://codecov.io/gh/SeedTactics/immutable-collections/branch/main/graph/badge.svg?token=GOYMOGYAOE)](https://codecov.io/gh/SeedTactics/immutable-collections)

- `HashMap`, a hash based immutable map built using a hash array mapped trie (HAMT)
- `OrderedMap`, an key-ordered immutable map built using a balanced binary tree
- `LazySeq`, a wrapper for iterables/iterators that supports transforming data and converting to HashMap/OrderedMap

## Current Status

The library is now basically feature-complete, extensively tested, and currently
used in production at SeedTactics, but there are no docs yet. For now, you can

```typescript
import { HashMap, OrderedMap, LazySeq } from "@seedtactics/immutable-collections";
```

Use static methods on the `HashMap`, `OrderedMap`, and `LazySeq` classes to
create new instances (the constructors are private, so you can't call them
directly), and call methods on them to manipulate them.

## Rough TODO

- Docs
- More benchmarks
- A couple more utility/convenience functions
