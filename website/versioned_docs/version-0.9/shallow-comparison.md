# Shallow Equality Comparison

As immutable data structures, modification operations such as
[OrderedMap.delete](api/orderedmap#delete) return an OrderedMap with the result
of the operation, leaving the original data structure unchanged. This allows memoization
techniques such as `React.useMemo` to avoid recomputation when no changes to the data take place.

### No changes means same javascript object

To implement `OrderedMap.delete`, the delete method will share many tree nodes between the old and new tree to avoid
copying the entire data structure, but will allocate a few new tree nodes (at
most log n) so that the returned OrderedMap represents the result of the delete.
But consider the case when trying to delete a key that does not exist: no
changes need to be made to the tree so it is possible to return the original
OrderedMap class instance without creating a new javascript object.

This library guarantees that operations that end up not modifying the data
structure will return the original javascript object and not create a new
javascript object representing the new tree. Throughout the API documentation,
each operation that does this is documented as doing so.

This allows you to prospectively call a modification operation in which you do not
know if a modification will happen or not without having to check beforehand with lookups.
Here are some examples:

- If you store time-based data in a HashMap, you can call call [HashMap.filter](api/hashmap#filter) to
  filter out any old expired data, say data more than 1 hour old. If no data is actually filtered out,
  the HashMap javascript object is unchanged.

- If you implement some sort of refresh or reload functionality on the client,
  you can use [HashMap.union](api/hashmap#union) to add the refresh data from the
  network call to the existing data. If the result of the union means no new data
  was available, the HashMap javascript object is unchanged. Note that `union`
  allows a custom merge function, so that you can determine per-value if the
  value is actually new or not. The overall `union` will then corrcetly return
  the original HashMap if no new values were added.

- These are just examples, many more operations have this property. It is
  useful to just call a modification operation to both check if anything changed and make
  the change all at the same time.

### Detecting changes via shallow equality

As mentioned, this library guarantees that if no modification actually took place,
the original javascript object is returned. Therefore, you can use `===` or
[Object.is](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is) on the
value to determine if the data structure actually changed. With strong types in which you know the value is a
class instance of the HashMap or OrderedMap classes, then `===` and `Object.is` are the same; the difference between
`===` and `Object.is` is the treatment of NaN and signed zeros.

This property is useful for `React.useMemo` or other memoization techniques, which only compute something when
the contents of the data structure actually change. Consider the network reload example above where you are computing
some report from the HashMap of data. If no new data is available, the HashMap object from `union` is returned unchanged
which in turn means `React.useMemo` will not do any re-computation.
