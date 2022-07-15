# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

- rename LazySeq.maxOn to LazySeq.maxBy to be consistent with the rest of the methods on LazySeq
- rename LazySeq.minOn to LazySeq.minBy to be consistent with the rest of the methods on LazySeq
- rename LazySeq.sort to LazySeq.sortBy to be consistent with the rest of the methods on LazySeq
- require at least one argument to LazySeq.distinctBy, LazySeq.maxBy, LazySeq.minBy, LazySeq.sortBy LazySeq.toSortedArray

## 0.9.0 - 2022-07-13

Initial release, implementing `HashMap`, `HashSet`, `OrderedMap`, and `LazySeq`.