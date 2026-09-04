/**
 * The funkynames demo — the real library, running in your browser.
 *
 * Three panels: roll some names, take the entropy apart, then ask whether the
 * shape you picked is strong enough for what you want to use it for.
 */
import {
  POOLS, POOL_NAMES, type PoolName,
  generateHandle, generateCode,
  handleEntropy, entropyOfDraws,
  timeToGuess, describeBits, humanizeSeconds,
  wordsForBits, withinLength,
} from '../src/index.js';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) { throw new Error(`missing #${id}`); }
  return el as T;
};

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

// ── Word length, shared by every panel ───────────────────────────────────────
// Options come from the lengths actually present, so the dropdowns can never
// offer a range that yields nothing.

const minLen = $<HTMLSelectElement>('min-len');
const maxLen = $<HTMLSelectElement>('max-len');
const lengthNote = $('length-note');

const LENGTHS = [...new Set(POOL_NAMES.flatMap((n) => POOLS[n].map((w) => w.length)))]
  .sort((a, b) => a - b);

for (const len of LENGTHS) {
  minLen.append(new Option(`${len} chars`, String(len)));
  maxLen.append(new Option(`${len} chars`, String(len)));
}
minLen.value = String(LENGTHS[0]);
maxLen.value = String(LENGTHS[LENGTHS.length - 1]);

/** Current filter, normalised so min never exceeds max. */
function lengthRange(): { minLength: number; maxLength: number } {
  let lo = Number(minLen.value);
  let hi = Number(maxLen.value);
  if (lo > hi) { [lo, hi] = [hi, lo]; minLen.value = String(lo); maxLen.value = String(hi); }
  return { minLength: lo, maxLength: hi };
}

function onLengthChange(): void {
  const range = lengthRange();
  const kept = withinLength([...new Set(POOL_NAMES.flatMap((n) => [...POOLS[n]]))], range).length;
  const total = new Set(POOL_NAMES.flatMap((n) => [...POOLS[n]])).size;
  const pct = Math.round((kept / total) * 100);
  lengthNote.textContent = `${kept.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} words (${pct}%)`;
  lengthNote.classList.toggle('warn', pct < 25);
  rollHandles();
  rollCodes();
  syncLab();
  syncSafety();
}

minLen.addEventListener('change', onLengthChange);
maxLen.addEventListener('change', onLengthChange);

// ── Panel 1: Roll ────────────────────────────────────────────────────────────

const handleList = $('handle-list');
const codeList = $('code-list');
const codeWords = $<HTMLInputElement>('code-words');
const codeWordsOut = $('code-words-out');

function row(name: string): string {
  return `<li><code>${name}</code><button class="copy" data-name="${name}" type="button" aria-label="Copy ${name}">copy</button></li>`;
}

function rollHandles(): void {
  const opts = lengthRange();
  try {
    handleList.innerHTML = Array.from({ length: 6 }, () => row(generateHandle(opts))).join('');
  } catch (err) {
    // A narrow range can empty a slot even when the merged pool still has words.
    handleList.innerHTML = `<li class="empty">${(err as Error).message}</li>`;
  }
}

function rollCodes(): void {
  const words = Number(codeWords.value);
  codeWordsOut.textContent = String(words);
  const opts = { words, ...lengthRange() };
  try {
    codeList.innerHTML = Array.from({ length: 6 }, () => row(generateCode(opts))).join('');
  } catch (err) {
    codeList.innerHTML = `<li class="empty">${(err as Error).message}</li>`;
  }
}

$('roll-handles').addEventListener('click', rollHandles);
$('roll-codes').addEventListener('click', rollCodes);
codeWords.addEventListener('input', () => { rollCodes(); syncLab(); });

// One listener for the whole page rather than one per button, since the rows
// are replaced on every roll.
document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement)?.closest?.('.copy') as HTMLButtonElement | null;
  if (!btn) { return; }
  const name = btn.dataset.name ?? '';
  void navigator.clipboard?.writeText(name).then(() => {
    btn.textContent = 'copied';
    setTimeout(() => { btn.textContent = 'copy'; }, 1200);
  }).catch(() => { btn.textContent = 'copy failed'; });
});

// ── Panel 2: Entropy lab ─────────────────────────────────────────────────────

const poolToggles = $('pool-toggles');
const labWords = $<HTMLInputElement>('lab-words');
const labWordsOut = $('lab-words-out');
const rate = $<HTMLInputElement>('rate');
const rateOut = $('rate-out');
const targets = $<HTMLInputElement>('targets');
const targetsOut = $('targets-out');

const enabled = new Set<PoolName>(POOL_NAMES);

for (const name of POOL_NAMES) {
  const id = `pool-${name}`;
  const label = document.createElement('label');
  label.className = 'toggle';
  label.innerHTML =
    `<input type="checkbox" id="${id}" checked> <span>${name}</span> ` +
    `<b>${POOLS[name].length}</b>`;
  poolToggles.append(label);
  label.querySelector('input')!.addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    if (on) { enabled.add(name); } else { enabled.delete(name); }
    label.classList.toggle('off', !on);
    syncLab();
  });
}

/** Distinct words across the enabled pools — the same union the library uses. */
function activePoolSize(): number {
  const union = new Set<string>();
  for (const name of enabled) { for (const w of POOLS[name]) { union.add(w); } }
  try {
    return withinLength([...union], lengthRange()).length;
  } catch {
    return 0; // the range excluded everything; callers render the empty state
  }
}

// Log sliders: guess rates and outstanding-token counts both span orders of
// magnitude, and a linear slider would spend 90% of its travel in the boring
// end. Values are 0-100, mapped to 10^(min..max).
const logScale = (v: number, lo: number, hi: number) => 10 ** (lo + (v / 100) * (hi - lo));

function syncLab(): void {
  const words = Number(labWords.value);
  labWordsOut.textContent = String(words);

  const poolSize = activePoolSize();
  const guessesPerSecond = logScale(Number(rate.value), 0, 6);
  const liveTargets = logScale(Number(targets.value), 0, 7);
  rateOut.textContent = `${fmt(guessesPerSecond)}/sec`;
  targetsOut.textContent = fmt(liveTargets);

  if (poolSize === 0) {
    $('lab-readout').innerHTML =
      '<p class="empty">Nothing to draw from — widen the length range, or turn a pool back on.</p>';
    return;
  }

  const e = entropyOfDraws(poolSize, words);
  const guess = timeToGuess(e.keyspace, guessesPerSecond, liveTargets);

  // Severity is about the guessing outcome, not the bit count: 45 bits with a
  // million live targets and no rate limit is worse than 34 bits with neither.
  const band = guess.seconds < 86_400 ? 'bad' : guess.seconds < 31_557_600 * 10 ? 'warn' : 'good';

  $('lab-readout').innerHTML = `
    <div class="readout">
      <div><span class="k">Pool</span><b>${fmt(poolSize)}</b><i>distinct words</i></div>
      <div><span class="k">Keyspace</span><b>${e.readable}</b><i>${fmt(e.keyspace)}</i></div>
      <div><span class="k">Entropy</span><b>${e.bits.toFixed(1)} bits</b><i>${describeBits(e.bits)}</i></div>
      <div><span class="k">Collides after</span><b>${fmt(e.birthday50)}</b><i>names, 50% chance — the birthday bound, not the keyspace</i></div>
    </div>
    <div class="verdict ${band}">
      <span class="k">Expected time to guess one live name</span>
      <b>${guess.readable}</b>
      <i>${fmt(guess.attempts)} attempts at ${fmt(guessesPerSecond)}/sec with ${fmt(liveTargets)} outstanding</i>
    </div>`;
}

labWords.addEventListener('input', syncLab);
rate.addEventListener('input', syncLab);
targets.addEventListener('input', syncLab);

// ── Panel 3: Is this safe for… ───────────────────────────────────────────────

interface UseCase {
  id: string;
  label: string;
  /** Bits this use actually needs, and why that number. */
  bits: number;
  note: string;
  rateLimited: boolean;
}

const USE_CASES: UseCase[] = [
  {
    id: 'username', label: 'Username or display handle', bits: 0,
    note: 'Public by definition, so guessing is not a threat. What matters is collisions — check uniqueness when you issue one.',
    rateLimited: false,
  },
  {
    id: 'room', label: 'Room / lobby code', bits: 28,
    note: 'Short-lived and low-value, but joinable by anyone who guesses. Fine at modest entropy provided rooms expire.',
    rateLimited: true,
  },
  {
    id: 'invite', label: 'Invite or share link', bits: 45,
    note: 'Long-lived and grants access. Many are outstanding at once, which dilutes the keyspace — this is where population bites.',
    rateLimited: true,
  },
  {
    id: 'reset', label: 'Password reset token', bits: 60,
    note: 'Single-use, short-lived, and full account takeover if guessed. Should be minted per request and expire in minutes.',
    rateLimited: true,
  },
  {
    id: 'apikey', label: 'API key or bearer token', bits: 128,
    note: 'Never rate-limited in practice and often never rotated. Honestly: use random bytes, not words. Words are for humans to read aloud.',
    rateLimited: false,
  },
];

const useCaseSelect = $<HTMLSelectElement>('use-case');
for (const u of USE_CASES) { useCaseSelect.append(new Option(u.label, u.id)); }

function syncSafety(): void {
  const useCase = USE_CASES.find((u) => u.id === useCaseSelect.value) as UseCase;
  const words = Number(labWords.value);
  const poolSize = activePoolSize();

  if (poolSize === 0) { $('safety-readout').innerHTML = ''; return; }

  const e = entropyOfDraws(poolSize, words);

  if (useCase.bits === 0) {
    const h = handleEntropy();
    $('safety-readout').innerHTML = `
      <div class="verdict good">
        <span class="k">Verdict</span><b>Entropy is not the question here</b>
        <i>${useCase.note}</i>
      </div>
      <p class="foot">A handle collides after about ${fmt(h.birthday50)} issued names — that is when
      "pick another" starts happening often enough to notice, and when a fourth slot earns its place.</p>`;
    return;
  }

  const ok = e.bits >= useCase.bits;
  const needed = wordsForBits(useCase.bits);

  $('safety-readout').innerHTML = `
    <div class="verdict ${ok ? 'good' : 'bad'}">
      <span class="k">Verdict</span>
      <b>${ok ? `${words} words is enough` : `${words} words is not enough`}</b>
      <i>${e.bits.toFixed(1)} bits against a ${useCase.bits}-bit bar${
        ok ? '' : ` — you need ${needed.words} words (${needed.achieved.bits.toFixed(1)} bits)`
      }</i>
    </div>
    <p class="foot">${useCase.note}${
      useCase.rateLimited
        ? ' <strong>Rate limiting is doing half the work here:</strong> at one attempt per minute instead of the slider’s rate, the same keyspace holds for ' +
          humanizeSeconds(timeToGuess(e.keyspace, 1 / 60, logScale(Number(targets.value), 0, 7)).seconds) + '.'
        : ''
    }</p>`;
}

useCaseSelect.addEventListener('change', syncSafety);
for (const el of [labWords, rate, targets]) { el.addEventListener('input', syncSafety); }
poolToggles.addEventListener('change', syncSafety);

// ── Open on something real ───────────────────────────────────────────────────

onLengthChange(); // fills the note and rolls both panels
