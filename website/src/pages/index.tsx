import React from "react";
import clsx from "clsx";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import CodeBlock from "@theme/CodeBlock";

import styles from "./index.module.css";
import {
  CodeBrackets,
  DataTransferBoth,
  Hashtag,
  NetworkReverse,
  Ruler,
  TestTube,
} from "iconoir-react";

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx("hero hero--primary", styles.heroBanner)}>
      <div className="container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs/intro">
            Introduction
          </Link>
        </div>
      </div>
    </header>
  );
}

type FeatureItem = {
  title: string;
  img?: JSX.Element;
  description: JSX.Element;
};

const features: FeatureItem[] = [
  {
    img: <NetworkReverse fontSize="x-large" color="var(--ifm-color-primary-dark)" />,
    title: "Balanced Binary Tree",
    description: (
      <p>
        This library contains an implementation of an efficient immutable balanced binary
        tree. It supports O(log n) insert and delete, along with many more bulk
        modification operations. Keys are kept in sorted order, allowing interation in
        ascending and descending order of keys.
      </p>
    ),
  },
  {
    img: <Hashtag fontSize="x-large" color="var(--ifm-color-primary-dark)" />,
    title: "Hash Array Mapped Tree",
    description: (
      <p>
        This library contains an implementation of an efficient immutable hash array
        mapped tree for O(1) operations, along with efficient bulk modification
        operations.
      </p>
    ),
  },
  {
    img: <CodeBrackets fontSize="x-large" color="var(--ifm-color-primary-dark)" />,
    title: "Zero Dependencies",
    description: (
      <p>
        This library has no dependencies and is written in pure Typescript. It supports
        tree-shaking to produce small bundles.
      </p>
    ),
  },
  {
    img: <TestTube fontSize="x-large" color="var(--ifm-color-primary-dark)" />,
    title: "Extensivly Tested",
    description: (
      <p>
        This library contains a large test suite with full code coverage of all operations
        and all edge cases.
      </p>
    ),
  },
  {
    img: <DataTransferBoth fontSize="x-large" color="var(--ifm-color-primary-dark)" />,
    title: "Lazy Sequence Operations",
    description: (
      <p>
        This library contains a data pipeline API for lazy sequence operations, similar to
        LINQ in C# or lodash/ramda. It wraps Javascript Iterables and provides a rich set
        of operations for mapping and transforming data, including terminating the
        pipeline with an immutable tree or hashmap.
      </p>
    ),
  },
  {
    img: <Ruler fontSize="x-large" color="var(--ifm-color-primary-dark)" />,
    title: "Shallow Comparison",
    description: (
      <p>
        This library guarantees that if a modification operation such as delete does not
        actually change the tree, the javascript object representing the data is returned
        unchanged. This allows React.memo or other memoization techniques to easily be
        used.
      </p>
    ),
  },
];

function Feature({ title, img, description }: FeatureItem) {
  return (
    <div className={clsx("col col--4 padding-top--md")}>
      {img ? <div className="text--center">{img}</div> : undefined}
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

function CodeExample() {
  return (
    <div className={clsx("row margin-top--lg")}>
      <CodeBlock language="ts">
        {`import { OrderedMap } from "@seedtactics/immutable-collections";

const m = OrderedMap.from([ [1, "Hello"], [2, "World"]]);
console.log(m.get(1)); // prints Hello
console.log(m.get(2)); // prints World

const m2 = m.set(1, "Goodbye");
console.log(m2.get(1)); // prints Goodbye
console.log(m.get(1)); // prints Hello

const union = m.union(m2, (a, b) => a + b);
console.log(union.get(1)); // prints HelloGoodbye
console.log(union.get(2)); // prints World`}
      </CodeBlock>
    </div>
  );
}

export default function Home(): JSX.Element {
  return (
    <Layout
      title="Typescript immutable collections"
      description="Efficient immutable balanced tree and hash array mapped trie collections for Typescript"
    >
      <HomepageHeader />
      <main>
        <div className={clsx("container margin-top--md margin-bottom--md")}>
          <div className="row">
            {features.map((props, idx) => (
              <Feature key={idx} {...props} />
            ))}
          </div>
        </div>
        <div className={clsx("container margin-top--md margin-bottom--md")}>
          <CodeExample />
        </div>
      </main>
    </Layout>
  );
}
