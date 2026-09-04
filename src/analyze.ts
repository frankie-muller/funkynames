/**
 * Working backwards.
 *
 * The generators answer "give me a name". These answer the two questions you
 * actually arrive with: *how long does it need to be?* and *is this string
 * even one of mine?*
 */
import { mergePools } from './code.js';
import { POOLS, POOL_NAMES, type PoolName } from './pools.js';
import { entropyOfDraws, type EntropyReport } from './entropy.js';

/**
 * How many words to reach a target strength.
 *
 * The inverse of guessing and checking. State the security you need and this
 * gives you the shape:
 *
 *   wordsForBits(45)  -> { words: 4, ... }   an invite link
 *   wordsForBits(60)  -> { words: 6, ... }   a reset token
 *   wordsForBits(128) -> { words: 12, ... }  key material, at which point use a key
 *
 * Rounds UP, always. Landing 0.4 bits under target and calling it done is how
 * a "60-bit" token ships at 59.6 — small in isolation, and the wrong habit for
 * a number whose only job is to be a floor.
 */
export function wordsForBits(
  targetBits: number,
  options: { dedupe?: boolean } = {},
): { words: number; achieved: EntropyReport } {
  if (!Number.isFinite(targetBits) || targetBits < 0) {
    throw new RangeError('funkynames: targetBits must be a non-negative number');
  }
  const poolSize = mergePools(options.dedupe ?? true).length;
  const bitsPerWord = Math.log2(poolSize);
  const words = Math.max(1, Math.ceil(targetBits / bitsPerWord));
  return { words, achieved: entropyOfDraws(poolSize, words) };
}

/** One word, and where it came from. */
export interface ParsedWord {
  word: string;
  /** Every pool containing it — 159 words live in more than one. */
  pools: PoolName[];
}

export interface ParsedName {
  words: ParsedWord[];
  /** True when the word count and pools match the handle shape exactly. */
  looksLikeHandle: boolean;
}

/**
 * Splits a name and reports which pool each word came from, or `null` if any
 * word is not ours.
 *
 * Useful as an input filter: a submitted string that parses is one this
 * library could have produced, which rejects typos and junk before you spend a
 * database round trip on them.
 *
 * NOT an authorisation check. Anyone can assemble a valid-looking name from
 * the published word lists — parsing proves the shape, never the claim. Look
 * the name up before you believe it.
 */
export function parseName(
  name: string,
  options: { separator?: string } = {},
): ParsedName | null {
  const separator = options.separator ?? '-';
  if (typeof name !== 'string' || name.length === 0) { return null; }

  const parts = name.toLowerCase().split(separator);
  if (parts.some((p) => p.length === 0)) { return null; }

  const words: ParsedWord[] = [];
  for (const part of parts) {
    const pools = POOL_NAMES.filter((p) => (POOLS[p] as readonly string[]).includes(part));
    if (pools.length === 0) { return null; }
    words.push({ word: part, pools: [...pools] });
  }

  return { words, looksLikeHandle: matchesHandleShape(words) };
}

/** Whether the parsed words could have come out of `generateHandle`. */
function matchesHandleShape(words: readonly ParsedWord[]): boolean {
  const SHAPE: ReadonlyArray<readonly PoolName[]> = [
    ['ninjactives', 'verbtrics'],
    ['kawaiiolors', 'memactions'],
    ['biome', 'monsterials'],
  ];
  if (words.length !== SHAPE.length) { return false; }
  return words.every((w, i) => {
    const allowed = SHAPE[i] as readonly PoolName[];
    return w.pools.some((p) => allowed.includes(p));
  });
}
