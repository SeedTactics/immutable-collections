# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

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
