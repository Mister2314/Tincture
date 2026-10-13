/**
 * Deterministic noise.
 *
 * Every motif that is not a particle system needs a source of pseudo-randomness that is
 * *stable*: the same `seed` token must draw the same tree, the same crystal, the same flow
 * field, on every load and on every machine. `Math.random()` cannot promise that, so this
 * module is built on a seeded PRNG and a hash-based value noise.
 *
 * Nothing here is a cryptographic primitive — it is decoration. What it has to be is
 * reproducible, fast, and allocation-free, because it runs inside a rAF loop.
 */

/** Mulberry32 — 32-bit, small, stable across engines, and good enough for decoration. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded random source with the helpers the renderers keep reaching for. */
export type Rng = {
  next: () => number;
  range: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  chance: (p: number) => boolean;
};

export function rng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length) % items.length],
    chance: (p) => next() < p,
  };
}

/** Integer hash -> [0,1). The lattice of the value noise; stable across runs. */
function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t: number): number => t * t * (3 - 2 * t);

/** Smooth 2D value noise in [0,1). */
export function valueNoise2(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);

  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x0 + 1, y0, seed);
  const n01 = hash2(x0, y0 + 1, seed);
  const n11 = hash2(x0 + 1, y0 + 1, seed);

  const nx0 = n00 + (n10 - n00) * fx;
  const nx1 = n01 + (n11 - n01) * fx;
  return nx0 + (nx1 - nx0) * fy;
}

/** Fractal value noise — a few octaves, still cheap. */
export function fbm2(x: number, y: number, seed: number, octaves = 3): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + o * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return norm === 0 ? 0.5 : sum / norm;
}

/**
 * Curl of a scalar noise potential: `(-dP/dy, dP/dx)`.
 *
 * Divergence-free by construction, which is exactly what makes a flow field *swirl*
 * instead of clumping into blobs. The result is written into a caller-owned array so the
 * rAF loop allocates nothing per particle.
 */
export function curl2(x: number, y: number, seed: number, out: [number, number], eps = 0.9): void {
  const dx = (fbm2(x + eps, y, seed, 3) - fbm2(x - eps, y, seed, 3)) / (2 * eps);
  const dy = (fbm2(x, y + eps, seed, 3) - fbm2(x, y - eps, seed, 3)) / (2 * eps);
  out[0] = -dy;
  out[1] = dx;
}

/** Smooth 0..1 ramp, for growth curves that must not start with a jerk. */
export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
