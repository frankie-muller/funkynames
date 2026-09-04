/**
 * Codes — N independent draws from every pool merged.
 *
 *   copper-drifting-marsh-owl
 *
 * No grammar, so any word can land in any position. That buys a much larger
 * keyspace per word than the handle shape, at the cost of reading like a name.
 *
 * Codes are the shape you reach for when the string has to be hard to GUESS
 * rather than nice to say. Read `entropy.ts` before picking a length — the
 * default of four is a deliberate choice, and three is weaker than it looks.
 */
import { POOL_NAMES, POOLS } from './pools.js';
import { entropyOfDraws, type EntropyReport } from './entropy.js';
import { pick, withinLength, type LengthOptions, type RandomOptions } from './random.js';

/**
 * Default word count.
 *
 * Three words from this corpus is ~33.6 bits — about a six-character random
 * password. That is enough for a share link nobody is hunting, and not enough
 * for anything a stranger would profit from guessing. Four words costs one
 * more word and buys ~11 bits, which is the cheapest security in this library,
 * so four is the default and three is the thing you opt into.
 */
export const DEFAULT_CODE_WORDS = 4;

export interface CodeOptions extends RandomOptions, LengthOptions {
  /** How many words. Default 4. */
  words?: number;
  /** Joins the words. Default `'-'`. */
  separator?: string;
  /**
   * Drop words that appear in more than one pool, so every word is equally
   * likely. Default true.
   *
   * With duplicates kept, a word in two pools is drawn twice as often as its
   * neighbours — which both biases the output and slightly overstates the
   * entropy, since `entropyOfDraws` assumes a uniform pool.
   */
  dedupe?: boolean;
}

let mergedCache: { deduped: string[]; raw: string[] } | null = null;

/** Every pool concatenated, in canonical order. Computed once. */
export function mergePools(dedupe = true): string[] {
  if (!mergedCache) {
    const raw = POOL_NAMES.flatMap((name) => [...POOLS[name]]);
    mergedCache = { raw, deduped: [...new Set(raw)] };
  }
  return dedupe ? mergedCache.deduped : mergedCache.raw;
}

/** One code. */
export function generateCode(options: CodeOptions = {}): string {
  const words = options.words ?? DEFAULT_CODE_WORDS;
  if (!Number.isInteger(words) || words < 1) {
    throw new RangeError('funkynames: words must be a positive integer');
  }
  const pool = withinLength(mergePools(options.dedupe ?? true), options);
  const parts: string[] = [];
  for (let i = 0; i < words; i++) {
    parts.push(pick(pool, options));
  }
  return parts.join(options.separator ?? '-');
}

/** `count` DISTINCT codes. Distinct within this batch only — see `generateHandles`. */
export function generateCodes(count: number, options: CodeOptions = {}): string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError('funkynames: count must be a non-negative integer');
  }
  const out = new Set<string>();
  const maxAttempts = count * 100 + 100;
  let attempts = 0;
  while (out.size < count && attempts < maxAttempts) {
    out.add(generateCode(options));
    attempts++;
  }
  if (out.size < count) {
    throw new Error(
      `funkynames: could only generate ${out.size} distinct codes of ${count} requested`,
    );
  }
  return [...out];
}

/**
 * What a code of `words` words is worth. Computed from the pools, after any
 * length filter — narrowing the words you will accept narrows the keyspace,
 * and that has to show up in the number rather than being quietly ignored.
 */
export function codeEntropy(
  words = DEFAULT_CODE_WORDS,
  options: LengthOptions & { dedupe?: boolean } = {},
): EntropyReport {
  const pool = withinLength(mergePools(options.dedupe ?? true), options);
  return entropyOfDraws(pool.length, words);
}
