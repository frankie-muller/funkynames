/**
 * funkynames — like petnames, but funkier.
 *
 * Two generators over six hand-curated word pools:
 *
 *   generateHandle()  nimble-violet-tundra      structured, readable, ~29 bits
 *   generateCode()    copper-drift-marsh-owl    flat draws, ~45 bits at 4 words
 *
 * ...and, unusually, the arithmetic that says what those numbers mean. See
 * `entropy.ts`: a three-word name feels about as unguessable as a password and
 * is nowhere close, and that gap is where the bugs live.
 *
 * CSPRNG by default. Zero dependencies. Runs in Node, the browser and
 * React Native.
 *
 * https://www.singularcontinuum.com
 */

// ── Generators ───────────────────────────────────────────────────────────────
export {
  generateHandle,
  generateHandles,
  handleEntropy,
  HANDLE_SLOTS,
  type HandleOptions,
} from './handle.js';

export {
  generateCode,
  generateCodes,
  codeEntropy,
  mergePools,
  DEFAULT_CODE_WORDS,
  type CodeOptions,
} from './code.js';

// ── Working backwards ────────────────────────────────────────────────────────
export {
  wordsForBits,
  parseName,
  type ParsedWord,
  type ParsedName,
} from './analyze.js';

// ── Entropy ──────────────────────────────────────────────────────────────────
export {
  entropyOfSlots,
  entropyOfDraws,
  timeToGuess,
  humanizeSeconds,
  describeBits,
  type EntropyReport,
} from './entropy.js';

// ── Randomness (exported so you can supply your own source) ──────────────────
export {
  randomInt,
  pick,
  type RandomSource,
  type RandomOptions,
  withinLength,
  type LengthOptions,
} from './random.js';

// ── The word pools ───────────────────────────────────────────────────────────
export {
  POOLS,
  POOL_NAMES,
  ninjactives,
  verbtrics,
  kawaiiolors,
  memactions,
  biome,
  monsterials,
  type PoolName,
} from './pools.js';
