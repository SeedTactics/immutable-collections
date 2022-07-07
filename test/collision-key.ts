/* Copyright John Lenz, BSD license, see LICENSE file for details */

import { mkCompareByProperties } from "../src/data-structures/comparison.js";

// a key type that can generate hash collisions
export class CollidingKey {
  readonly h: number;
  readonly x: number;

  public constructor(hash: number, x: number) {
    this.h = hash;
    this.x = x;
  }

  private static compareS = mkCompareByProperties<CollidingKey>(
    (k) => k.h,
    (k) => k.x
  );

  public compare(other: CollidingKey): number {
    return CollidingKey.compareS(this, other);
  }

  public hash() {
    // only include this.hash so that we can generate collisions
    return this.h;
  }

  public toString(): string {
    return `${this.h}::${this.x}`;
  }
}

let lastX = 0;
const collisionHashPrefix = Math.floor(Math.random() * 32);
const sparseHashMid = (Math.floor(Math.random() * 32) << 15) | (Math.floor(Math.random() * 32) << 10);

export function randomCollisionKey(): CollidingKey {
  let h: number;

  const r = Math.random();
  if (r < 0.1) {
    // in one part of the tree, we want a lot of collisions.  Only allow 100 possible values for the hash
    h = (Math.floor(Math.random() * 10) << 10) | (Math.floor(Math.random() * 10) << 5) | collisionHashPrefix;
  } else if (r < 0.2) {
    // in another part of the tree, we want it very sparse at the upper levels (so we get long chains of single-children bitmap-indexed nodes)
    h = (Math.floor(Math.random() * 2 ** 12) << 20) | sparseHashMid | Math.floor(Math.random() * 32);
  } else {
    h = (Math.random() * 2 ** 32) | 0;
  }

  lastX++;
  return new CollidingKey(h, lastX);
}

export function distinctKeyWithHash(hash: number): CollidingKey {
  lastX++;
  return new CollidingKey(hash, lastX);
}

export function createKeyWithSameHash(count: number): ReadonlyArray<CollidingKey> {
  const h = (Math.random() * 2 ** 32) | 0;
  const ret = [];
  for (let i = 0; i < count; i++) {
    lastX++;
    ret.push(new CollidingKey(h, lastX));
  }
  return ret;
}

export function createKeyWithSamePrefix(counts: ReadonlyArray<number>): ReadonlyArray<ReadonlyArray<CollidingKey>> {
  const prefix = Math.floor(Math.random() * 2 ** 25);

  const ret: CollidingKey[][] = [];

  for (let countI = 0; countI < counts.length; countI++) {
    const h = prefix | (Math.floor(Math.random() * 2 ** 4) << 30) | (countI << 25);
    const chunk: CollidingKey[] = [];
    for (let i = 0; i < counts[countI]; i++) {
      lastX++;
      chunk.push(new CollidingKey(h, lastX));
    }
    ret.push(chunk);
  }

  return ret;
}
