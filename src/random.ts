/**
 * Randomness.
 *
 * The default source is a CSPRNG (`crypto.getRandomValues`), available
 * unmodified in Node 18+, every current browser, and Deno/Bun. There is no
 * import of `node:crypto` here on purpose — that would break the browser
 * build, and this library has to run in both.
 *
 * WHY NOT `Math.random()`: V8 implements it as xorshift128+, seeded per
 * process and never reseeded. Observe enough consecutive outputs and the
 * internal state — and therefore every future output — can be recovered. That
 * is irrelevant when you are naming a test fixture and disqualifying when the
 * string you generate is worth something to whoever holds it. Since a library
 * cannot know which case it is in, the safe default is the only honest one.
 *
 * You can still inject a plain `() => number` for reproducible tests. Doing so
 * is explicit, local, and obvious in a diff — which is exactly what you want
 * an insecure-but-deterministic mode to be.
 */

/** A source of floats in [0, 1) — the shape of `Math.random`. */
export type RandomSource = () => number;

export interface RandomOptions {
  /**
   * Deterministic source for tests. Omit in production: the default CSPRNG is
   * both unbiased and unpredictable, and a seeded generator is neither.
   */
  random?: RandomSource;
}

function getCrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error(
      'funkynames: no Web Crypto available. Node 18+, a modern browser, ' +
      'Deno or Bun all provide it. On React Native, install a polyfill such ' +
      'as react-native-get-random-values. To generate without a CSPRNG, pass ' +
      'an explicit { random } source.',
    );
  }
  return c;
}

/**
 * A uniformly distributed integer in [0, max).
 *
 * Rejection sampling, not modulo. `value % max` is biased whenever `max` does
 * not divide 2³² evenly: the low residues get one extra chance each. With a
 * 2,516-word pool the skew is ~0.00000006% per word — invisible, and still
 * wrong. Discarding the unusable tail costs one extra draw about 0.00006% of
 * the time and makes the distribution exact.
 */
export function randomInt(max: number, options: RandomOptions = {}): number {
  if (!Number.isInteger(max) || max <= 0) {
    throw new RangeError(`funkynames: max must be a positive integer, got ${max}`);
  }
  if (options.random) {
    return Math.floor(options.random() * max) % max;
  }

  const crypto = getCrypto();
  const buf = new Uint32Array(1);
  // Largest multiple of `max` that fits in a uint32; anything at or above it
  // would wrap unevenly, so it is redrawn instead.
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0] as number;
  } while (value >= limit);
  return value % max;
}

/** A uniformly chosen element. Throws on an empty list rather than inventing one. */
export function pick<T>(items: readonly T[], options: RandomOptions = {}): T {
  if (items.length === 0) {
    throw new RangeError('funkynames: cannot pick from an empty list');
  }
  return items[randomInt(items.length, options)] as T;
}

/** Length constraints shared by both generators. */
export interface LengthOptions {
  /** Shortest word to draw, inclusive. */
  minLength?: number;
  /** Longest word to draw, inclusive. */
  maxLength?: number;
}

/**
 * Applies length constraints to a word list.
 *
 * Throws rather than returning an empty list: a generator that silently found
 * nothing to draw from would either loop or produce garbage, and the caller
 * needs to know their range excluded everything.
 */
export function withinLength(words: readonly string[], options: LengthOptions = {}): string[] {
  const min = options.minLength ?? 0;
  const max = options.maxLength ?? Infinity;
  if (min > max) {
    throw new RangeError(`funkynames: minLength (${min}) exceeds maxLength (${max})`);
  }
  if (min <= 0 && max === Infinity) { return words as string[]; }

  const kept = words.filter((w) => w.length >= min && w.length <= max);
  if (kept.length === 0) {
    throw new RangeError(
      `funkynames: no words between ${min} and ${max} characters — the pools run 2 to 18`,
    );
  }
  return kept;
}
