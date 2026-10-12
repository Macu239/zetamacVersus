/** A function returning a float in [0, 1), like Math.random. */
export type Rng = () => number;

/**
 * Creates a small, fast seeded PRNG (mulberry32), used for reproducible tests.
 * @param seed - 32-bit integer seed.
 * @returns A deterministic random function.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a random integer in an inclusive range.
 * @param rng - Random source.
 * @param min - Inclusive lower bound.
 * @param max - Inclusive upper bound.
 * @returns An integer between min and max.
 */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
