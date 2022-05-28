// a key type that can generate hash collisions
export class CollidingKey {
  readonly hash: number;
  readonly x: number;

  public constructor(hash: number, x: number) {
    this.hash = hash;
    this.x = x;
  }

  public equals(other: CollidingKey): boolean {
    return this.hash === other.hash && this.x === other.x;
  }

  public hashPrimitives() {
    // only include this.hash so that we can generate collisions
    return [this.hash];
  }

  public toString(): string {
    return `${this.hash}::${this.x}`;
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
    h = Math.floor(Math.random() * 2 ** 32);
  }

  lastX++;
  return new CollidingKey(h, lastX);
}
