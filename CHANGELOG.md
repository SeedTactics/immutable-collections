# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## 1.0.1 - 2024-10-14
### Changed
- Small documentation updates

## 1.0.0 - 2024-06-05
### Changed
- No changes, 1.0.0 is identical to 0.9.5, but is now a stable release.

## 0.9.5 - 2024-05-10
### Added
- Add `LazySeq.reduce` to match the API of the
  [TC39 proposal](https://github.com/tc39/proposal-iterator-helpers)
- Add set methods from [TC39 proposal](https://github.com/tc39/proposal-set-methods):
  `symmetricDifference`, `isSubsetOf`, `isSupersetOf`, and `isDisjointFrom` all added to both HashSet and OrderedSet
- Add `HashMap.symmetricDifference` and `OrderedMap.symmetricDifference`. The subset and superset operations can be
  checked by calling `keySet()` on the map first.

### Changed
- **Breaking** Renamed `LazySeq.anyMatch` to `LazySeq.some` and renamed `LazySeq.allMatch` to `LazySeq.every`
  to match the API of the [TC39 proposal](https://github.com/tc39/proposal-iterator-helpers)

## 0.9.4 - 2024-01-29
### Added
- Lots of documentation improvements.
- A few performance improvements.
- Add LazySeq.toOrderedSet to convert a sequence to an ordered set.
- Add `transform` function to HashMap, HashSet, OrderedMap, and OrderedSet.

### Changed
- **Breaking** Rename `LazySeq.foldLeft` to just `LazySeq.fold`.

## 0.9.3 - 2022-08-03
### Added
- Add LazySeq.distinctAndSortBy which allows distinct and also sorting by one or more
  properties.
- Add deleteMin, deleteMax, lookupMin, lookupMax to OrderedMap
- Add OrderedMap.partition to partition the map into two maps
- Add OrderedSet class

### Changed
- **Breaking**: Rename `LazySeq.ofIterable` to just `LazySeq.of`. This is used frequently and a short name
  is better, and this is the last chance before the 1.0 API release.
- The LazySeq.filter function now can restrict the type if the function has a type guard.
- The LazySeq.groupBy and LazySeq.orderedGroupBy now correctly allow iteration more than
  once.

## 0.9.2 - 2022-07-21
### Changed
- The toLazySeq (and friends) methods on HashMap, HashSet, and OrderedMap now correctly
  allow iteration more than once (so implementing the iterable protocol).

## 0.9.1 - 2022-07-15
### Changed
- rename LazySeq maxOn, minOn, sort, and sumOn to maxBy, minBy, sortBy, and sumBy
  to be consistent with the rest of the methods on LazySeq
- require at least one argument to LazySeq.distinctBy, LazySeq.maxBy, LazySeq.minBy,
  LazySeq.sortBy LazySeq.toSortedArray

## 0.9.0 - 2022-07-13
Initial release, implementing `HashMap`, `HashSet`, `OrderedMap`, and `LazySeq`.
