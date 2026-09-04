/**
 * Entropy — the part most name generators leave out.
 *
 * A three-word name feels roughly as unguessable as a password, and it is not.
 * These helpers compute what a given configuration is actually worth, so the
 * number is on the record instead of in someone's head.
 *
 * The distinction that matters:
 *
 *   COLLISION resistance — will two honest users be handed the same name?
 *   Governed by the birthday bound: expect a repeat after roughly sqrt(N)
 *   draws, NOT N. A 29-bit keyspace collides after ~27,000 names, not 500
 *   million. Fine when you check uniqueness at the point of issue.
 *
 *   GUESSING resistance — can an attacker find a name someone else holds?
 *   Governed by the keyspace, the number of live targets, and the attempt rate
 *   you allow. This is the one that matters when the string is a credential.
 *
 * A pool of names is not a pool of secrets unless you sized it to be.
 */

/** What a configuration is worth, from every angle worth knowing. */
export interface EntropyReport {
  /** Total distinct outputs. */
  keyspace: number;
  /** log2(keyspace) — bits of entropy per generated name. */
  bits: number;
  /**
   * Draws before a repeat is more likely than not (the birthday bound).
   * Roughly 1.1774 * sqrt(keyspace).
   */
  birthday50: number;
  /** Human-readable size, e.g. "539.5 million". */
  readable: string;
}

const SCALES: ReadonlyArray<readonly [number, string]> = [
  [1e33, 'decillion'],
  [1e30, 'nonillion'],
  [1e27, 'octillion'],
  [1e24, 'septillion'],
  [1e21, 'sextillion'],
  [1e18, 'quintillion'],
  [1e15, 'quadrillion'],
  [1e12, 'trillion'],
  [1e9, 'billion'],
  [1e6, 'million'],
  [1e3, 'thousand'],
];

function readableCount(n: number): string {
  for (const [size, label] of SCALES) {
    if (n < size) { continue; }
    const mantissa = n / size;
    // A "human-readable" label only means something while the mantissa
    // stays under 1000 — past that, the true name is a rung this table
    // does not have (or never could: keyspaces are unbounded). Scientific
    // notation past the largest named scale is honest; a made-up word or
    // a mis-scaled one is not.
    if (!(mantissa < 1000)) { return n.toExponential(1); }
    return `${mantissa.toFixed(1)} ${label}`;
  }
  return String(Math.round(n));
}

function report(keyspace: number): EntropyReport {
  return {
    keyspace,
    bits: keyspace > 0 ? Math.log2(keyspace) : 0,
    birthday50: Math.round(1.1774 * Math.sqrt(keyspace)),
    readable: readableCount(keyspace),
  };
}

/**
 * Entropy of a slot-based name: one independent choice per slot, each from a
 * pool of its own size. This is how handles are built.
 *
 *   entropyOfSlots([1148, 885, 531])  // three slots -> 29.01 bits
 */
export function entropyOfSlots(slotSizes: readonly number[]): EntropyReport {
  if (slotSizes.length === 0) { return report(0); }
  if (slotSizes.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new RangeError('funkynames: slot sizes must be non-negative numbers');
  }
  return report(slotSizes.reduce((a, b) => a * b, 1));
}

/**
 * Entropy of N independent draws from ONE pool, with replacement — how codes
 * are built. With replacement is not a bug: forbidding repeats would shrink
 * the keyspace, not grow it.
 *
 *   entropyOfDraws(2516, 3)  // -> 33.9 bits
 *   entropyOfDraws(2516, 4)  // -> 45.2 bits, for one more word
 */
export function entropyOfDraws(poolSize: number, draws: number): EntropyReport {
  if (!Number.isInteger(draws) || draws < 0) {
    throw new RangeError('funkynames: draws must be a non-negative integer');
  }
  return report(poolSize ** draws);
}

/**
 * How long a sustained guessing attack takes to expect ONE success.
 *
 * The subtlety people miss: an attacker usually does not need a SPECIFIC name,
 * just ANY live one. With `liveTargets` names outstanding, each guess succeeds
 * with probability liveTargets/keyspace, so a large keyspace is diluted by a
 * large population. Expected attempts is keyspace/liveTargets, and the seconds
 * that takes is entirely set by the rate you permit.
 *
 * Which is the real lesson: rate limiting is not a nice-to-have you add on top
 * of entropy, it is half of the calculation.
 */
export function timeToGuess(
  keyspace: number,
  guessesPerSecond: number,
  liveTargets = 1,
): { attempts: number; seconds: number; readable: string } {
  if (guessesPerSecond <= 0) {
    throw new RangeError('funkynames: guessesPerSecond must be positive');
  }
  if (liveTargets < 1) {
    throw new RangeError('funkynames: liveTargets must be at least 1');
  }
  const attempts = keyspace / liveTargets;
  const seconds = attempts / guessesPerSecond;
  return { attempts, seconds, readable: humanizeSeconds(seconds) };
}

const DURATIONS: ReadonlyArray<readonly [number, string]> = [
  [31_557_600, 'year'],
  [86_400, 'day'],
  [3_600, 'hour'],
  [60, 'minute'],
];

/** Seconds as something a person can react to ("9.4 hours", "2,700 years"). */
export function humanizeSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) { return 'forever'; }
  for (const [size, label] of DURATIONS) {
    if (seconds >= size) {
      const n = seconds / size;
      const shown = n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(1);
      return `${shown} ${label}${shown === '1.0' ? '' : 's'}`;
    }
  }
  return `${seconds.toFixed(1)} seconds`;
}

/**
 * Bits, in terms of something familiar. Deliberately blunt: the point of these
 * comparisons is to stop anyone shipping a 34-bit string as a credential
 * because three words "felt like plenty".
 */
export function describeBits(bits: number): string {
  if (bits < 20) { return 'trivially guessable — naming only, never a secret'; }
  if (bits < 30) { return 'fine for names checked for uniqueness; far too weak as a secret'; }
  if (bits < 40) { return 'roughly a 6-character random password — needs strict rate limiting to be a credential'; }
  if (bits < 50) { return 'comparable to a 4-word Diceware passphrase — a reasonable rate-limited credential'; }
  if (bits < 70) { return 'strong: brute force is impractical even unthrottled'; }
  return 'cryptographic strength';
}
