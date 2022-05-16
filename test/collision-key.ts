import { faker } from "@faker-js/faker";

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

export function randomCollidingKey(): CollidingKey {
  return new CollidingKey(faker.datatype.number({ min: 0, max: 100 }), faker.datatype.number());
}
