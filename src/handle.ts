/**
 * Handles — three structured slots.
 *
 *   nimble-violet-tundra
 *   (descriptor)-(colour/action)-(place/thing)
 *
 * Each slot draws from a PAIR of pools, so the shape stays readable while the
 * vocabulary stays wide. The structure is the point: a handle reads like a
 * name because the grammar is fixed, unlike a code where any word can land
 * anywhere.
 */
import { POOLS, type PoolName } from './pools.js';
import { entropyOfSlots, type EntropyReport } from './entropy.js';
import { pick, withinLength, type LengthOptions, type RandomOptions } from './random.js';

/**
 * Which pools feed each slot. Two pools per slot, merged at draw time.
 * Exported so you can compute the entropy of the real shape rather than a
 * number someone typed into a README.
 */
export const HANDLE_SLOTS: ReadonlyArray<readonly PoolName[]> = [
  ['ninjactives', 'verbtrics'],
  ['kawaiiolors', 'memactions'],
  ['biome', 'monsterials'],
];

export interface HandleOptions extends RandomOptions, LengthOptions {
  /** Joins the words. Default `'-'`. */
  separator?: string;
}

function slotWords(slot: readonly PoolName[]): string[] {
  // Deduplicated across the pair: a word present in both pools of one slot
  // would otherwise be twice as likely to appear as any other.
  return [...new Set(slot.flatMap((name) => POOLS[name]))];
}

/**
 * A slot's words within the length range — and if there are none, an error
 * that says WHICH slot, because "no words between 12 and 12 characters" is
 * false for the corpus as a whole and only true of one slot. A handle needs a
 * word in every slot; a code does not, which is why the message points there.
 */
function slotWordsInRange(slot: readonly PoolName[], options: LengthOptions): string[] {
  try {
    return withinLength(slotWords(slot), options);
  } catch (err) {
    if (err instanceof RangeError && (options.minLength !== undefined || options.maxLength !== undefined)) {
      const lo = options.minLength ?? 2;
      const hi = options.maxLength ?? 'any';
      throw new RangeError(
        `funkynames: no words between ${lo} and ${hi} characters in the ` +
        `${slot.join(' + ')} slot — a handle needs a word in every slot. ` +
        'Widen the range, or use generateCode(), which draws from all pools at once.',
      );
    }
    throw err;
  }
}

/**
 * One handle.
 *
 * No word appears twice. 124 words sit in pools feeding DIFFERENT slots
 * (`atomic` is both a ninjactive and a memaction), so without this a handle
 * lands on `atomic-atomic-tundra` about once in 5,950 — harmless, and it reads
 * as a bug to whoever gets it.
 *
 * Redrawing the offending slot rather than pre-filtering keeps every remaining
 * word equally likely. The cost is one extra draw ~0.017% of the time and
 * under 0.0003 bits of entropy; `handleEntropy()` reports the adjusted figure.
 */
export function generateHandle(options: HandleOptions = {}): string {
  const separator = options.separator ?? '-';
  const chosen: string[] = [];

  for (const slot of HANDLE_SLOTS) {
    const words = slotWordsInRange(slot, options);
    let word = pick(words, options);
    // Bounded: with an injected `random` that returns a constant, this would
    // otherwise spin forever. After the cap, accept the repeat rather than
    // throw — a slightly ugly handle beats a crash.
    for (let attempt = 0; attempt < 16 && chosen.includes(word); attempt++) {
      word = pick(words, options);
    }
    chosen.push(word);
  }

  return chosen.join(separator);
}

/**
 * `count` DISTINCT handles.
 *
 * Distinct within this batch only — this library has no idea what you have
 * already issued. Uniqueness across your users is a database question, and the
 * birthday bound in `handleEntropy()` says how often you should expect to have
 * to ask it.
 */
export function generateHandles(count: number, options: HandleOptions = {}): string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError('funkynames: count must be a non-negative integer');
  }
  const out = new Set<string>();
  // The keyspace is ~10^8 and callers ask for single digits, so collisions are
  // vanishingly rare — but a bounded loop beats a theoretically infinite one.
  const maxAttempts = count * 100 + 100;
  let attempts = 0;
  while (out.size < count && attempts < maxAttempts) {
    out.add(generateHandle(options));
    attempts++;
  }
  if (out.size < count) {
    throw new Error(
      `funkynames: could only generate ${out.size} distinct handles of ${count} requested`,
    );
  }
  return [...out];
}

/**
 * What the handle shape is actually worth. Computed from the pools, not quoted.
 *
 * Slot sizes are the raw pool sizes: rejecting repeats removes a vanishing
 * fraction of the space (~0.017%), and reporting the un-adjusted product would
 * overstate it. Overstating entropy is the one direction a security number
 * must never be wrong in, so the loss is subtracted rather than ignored.
 */
export function handleEntropy(options: LengthOptions = {}): EntropyReport {
  const sizes = HANDLE_SLOTS.map((slot) => slotWordsInRange(slot, options).length);
  const raw = entropyOfSlots(sizes);

  // Fraction of combinations containing a repeated word, summed pairwise over
  // slots. Pairs are disjoint enough at these sizes that inclusion-exclusion
  // beyond the first term is noise.
  const sets = HANDLE_SLOTS.map((slot) => new Set(slotWordsInRange(slot, options)));
  let collisionFraction = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const a = sets[i] as Set<string>;
      const b = sets[j] as Set<string>;
      let shared = 0;
      for (const w of a) { if (b.has(w)) { shared++; } }
      collisionFraction += shared / (a.size * b.size);
    }
  }

  return entropyOfSlots([raw.keyspace * (1 - collisionFraction)]);
}
