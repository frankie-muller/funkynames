/**
 * The funkynames demo — the real library, running in your browser.
 *
 * Three panels: roll some handles and codes, take the entropy apart, then ask
 * whether the shape you picked is strong enough for what you want to use it for.
 */
import {
  POOLS, POOL_NAMES, type PoolName,
  generateHandle, generateCode,
  handleEntropy, entropyOfDraws,
  timeToGuess, describeBits, humanizeSeconds,
  withinLength,
} from '../src/index.js';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) { throw new Error(`missing #${id}`); }
  return el as T;
};

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
// Exact integers are only honest while they are exactly representable; past
// 2^53 the trailing digits are float noise dressed up as precision.
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const exact = (n: number) => (n <= Number.MAX_SAFE_INTEGER ? fmt(n) : compact.format(n));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

const status = $('sr-status');
/** One polite announcement for assistive tech; replaces, never stacks. */
function announce(text: string): void {
  status.textContent = '';
  // A tick later so identical consecutive messages are still announced.
  setTimeout(() => { status.textContent = text; }, 30);
}

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

function row(name: string): string {
  return `<li><code>${esc(name)}</code><button class="copy" data-copy="${esc(name)}" type="button" aria-label="Copy ${esc(name)}">copy</button></li>`;
}

// ── Panel 1: Handles ─────────────────────────────────────────────────────────

const handleList = $('handle-list');

function rollHandles(): void {
  const opts = lengthRange();
  try {
    handleList.innerHTML = Array.from({ length: 6 }, () => row(generateHandle(opts))).join('');
  } catch (err) {
    // A narrow range can empty a slot even when the merged pool still has words
    // in range — the library refuses rather than guesses.
    handleList.innerHTML = `<li class="empty">${esc((err as Error).message.replace(/^funkynames: /, ''))}</li>`;
  }
}

$('roll-handles').addEventListener('click', rollHandles);

// ── Codes ───────────────────────────────────────────────────────────

const codeList = $('code-list');
const codeWords = $<HTMLInputElement>('code-words');
const codeWordsOut = $('code-words-out');

function rollCodes(): void {
  const words = Number(codeWords.value);
  codeWordsOut.textContent = String(words);
  const opts = { words, ...lengthRange() };
  try {
    codeList.innerHTML = Array.from({ length: 6 }, () => row(generateCode(opts))).join('');
  } catch (err) {
    codeList.innerHTML = `<li class="empty">${esc((err as Error).message.replace(/^funkynames: /, ''))}</li>`;
  }
}

$('roll-codes').addEventListener('click', rollCodes);
codeWords.addEventListener('input', rollCodes);

// ── Copy, for every [data-copy] on the page ──────────────────────────────────
// Rows and cards are re-rendered constantly, so one delegated listener. The
// original label is remembered on the element and any pending restore is
// cancelled, so a fast second click can't strand a button on "copied".

const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard;
if (!canCopy) { document.documentElement.classList.add('no-clipboard'); }

document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement)?.closest?.('[data-copy]') as HTMLButtonElement | null;
  if (!btn) { return; }
  const text = btn.dataset.copy ?? '';
  btn.dataset.label ??= btn.textContent ?? 'copy';
  const restore = (label: string) => {
    btn.textContent = label;
    clearTimeout(Number(btn.dataset.timer));
    btn.dataset.timer = String(setTimeout(() => { btn.textContent = btn.dataset.label ?? 'copy'; }, 1200));
  };
  if (!canCopy) {
    // Legacy path: select the text in a scratch element and use execCommand.
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    restore(ok ? 'copied' : 'copy failed');
    announce(ok ? `Copied ${text}` : 'Copy failed');
    return;
  }
  void navigator.clipboard.writeText(text)
    .then(() => { restore('copied'); announce(`Copied ${text}`); })
    .catch(() => { restore('copy failed'); announce('Copy failed'); });
});

// ── Entropy lab ─────────────────────────────────────────────────────

const poolToggles = $('pool-toggles');
const labWords = $<HTMLInputElement>('lab-words');
const labWordsOut = $('lab-words-out');
const rate = $<HTMLInputElement>('rate');
const rateOut = $('rate-out');
const targets = $<HTMLInputElement>('targets');
const targetsOut = $('targets-out');
const labStatus = $('lab-status');

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
    syncSafety();
  });
}

/** Distinct words across the enabled pools, within the length range — the same union the library uses. */
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
// end. Values are 0-100, mapped to 10^(min..max), then ROUNDED ONCE so the
// number shown is the number the library is fed.
const logScale = (v: number, lo: number, hi: number) => Math.round(10 ** (lo + (v / 100) * (hi - lo)));

/** The attack model as the page currently states it. Targets are clamped to the keyspace: more live names than possible names is nonsense, not a harder attack. */
function attackModel(keyspace: number): { perSec: number; targets: number; clamped: boolean } {
  const perSec = logScale(Number(rate.value), 0, 6);
  const wanted = logScale(Number(targets.value), 0, 7);
  const clamped = wanted > keyspace;
  return { perSec, targets: clamped ? Math.max(1, Math.floor(keyspace)) : wanted, clamped };
}

let lastLab: { bits: number; guess: string } | null = null;

function syncLab(): void {
  const words = Number(labWords.value);
  labWordsOut.textContent = String(words);

  const poolSize = activePoolSize();
  const perSec = logScale(Number(rate.value), 0, 6);
  const wanted = logScale(Number(targets.value), 0, 7);
  rateOut.textContent = `${fmt(perSec)}/sec`;
  targetsOut.textContent = fmt(wanted);
  rate.setAttribute('aria-valuetext', `${fmt(perSec)} guesses per second`);
  targets.setAttribute('aria-valuetext', `${fmt(wanted)} names outstanding`);

  if (poolSize === 0) {
    $('lab-readout').innerHTML =
      '<p class="empty">Nothing to draw from — widen the word length at the top of the page, or turn a pool back on.</p>';
    lastLab = null;
    return;
  }

  const e = entropyOfDraws(poolSize, words);
  const atk = attackModel(e.keyspace);
  const guess = timeToGuess(e.keyspace, atk.perSec, atk.targets);

  // Severity is about the guessing outcome, not the bit count: 45 bits with a
  // million live targets and no rate limit is worse than 34 bits with neither.
  const band = guess.seconds < 86_400 ? 'bad' : guess.seconds < 31_557_600 * 10 ? 'warn' : 'good';

  $('lab-readout').innerHTML = `
    <div class="readout">
      <div><span class="k">Pool</span><b>${fmt(poolSize)}</b><i>distinct words in range</i></div>
      <div><span class="k">Keyspace</span><b>${e.readable}</b><i>${exact(e.keyspace)}</i></div>
      <div><span class="k">Entropy</span><b>${e.bits.toFixed(1)} bits</b><i>${describeBits(e.bits)}</i></div>
      <div><span class="k">Collides after</span><b>${fmt(e.birthday50)}</b><i>names, 50% chance — the birthday bound, not the keyspace</i></div>
    </div>
    <div class="verdict ${band}">
      <span class="k">Expected time to guess one live name</span>
      <b>${guess.readable}</b>
      <i>${exact(guess.attempts)} attempts at ${fmt(atk.perSec)}/sec with ${fmt(atk.targets)} outstanding${
        atk.clamped ? ' — capped at the keyspace: more live names than possible names means every guess lands' : ''}</i>
    </div>`;
  lastLab = { bits: e.bits, guess: guess.readable };
}

// Readouts are not live regions — a slider fires dozens of input events per
// drag and every one would be announced. One status line, updated on `change`
// (mouse-up / key release), carries the result instead.
function announceLab(): void {
  if (lastLab) { labStatus.textContent = `${lastLab.bits.toFixed(1)} bits; expected time to guess ${lastLab.guess}.`; }
}

for (const el of [labWords, rate, targets]) {
  el.addEventListener('input', () => { syncLab(); syncSafety(); });
  el.addEventListener('change', announceLab);
}

// ── Is this safe for… ───────────────────────────────────────────────

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
    note: 'Rarely rate-limited in practice, and often never rotated, so entropy has to carry the whole load. Honestly: use random bytes, not words. Words are for humans to read aloud.',
    rateLimited: false,
  },
];

const useCaseSelect = $<HTMLSelectElement>('use-case');
for (const u of USE_CASES) { useCaseSelect.append(new Option(u.label, u.id)); }

function syncSafety(): void {
  const useCase = USE_CASES.find((u) => u.id === useCaseSelect.value) as UseCase;
  const words = Number(labWords.value);
  const poolSize = activePoolSize();
  const out = $('safety-readout');

  if (poolSize === 0) {
    out.innerHTML = '<p class="empty">No pool to measure — widen the word length or turn a pool back on above.</p>';
    return;
  }

  const e = entropyOfDraws(poolSize, words);

  if (useCase.bits === 0) {
    // Measured at the same length range as everything else on the page.
    let collide = '';
    try {
      const h = handleEntropy(lengthRange());
      collide = `A handle collides after about ${fmt(h.birthday50)} issued names at this length range — that is when "pick another" starts happening often enough to notice, and when a fourth slot earns its place.`;
    } catch {
      collide = 'At this length range the handle shape has no words in one of its slots, so there is no collision figure to give — widen the range at the top of the page.';
    }
    out.innerHTML = `
      <div class="verdict good">
        <span class="k">Verdict</span><b>Entropy is not the question here</b>
        <i>${useCase.note}</i>
      </div>
      <p class="foot">${collide}</p>`;
    return;
  }

  const ok = e.bits >= useCase.bits;
  // The remedy is measured against the SAME pool the verdict used — the
  // toggled pools at this length range — not the whole corpus. A pool of one
  // word has zero bits per word, so guard the division.
  const perWord = poolSize > 1 ? Math.log2(poolSize) : 0;
  const needWords = perWord > 0 ? Math.max(1, Math.ceil(useCase.bits / perWord)) : Infinity;
  const remedy = Number.isFinite(needWords)
    ? `you need ${plural(needWords, 'word')} (${entropyOfDraws(poolSize, needWords).bits.toFixed(1)} bits) from this pool`
    : 'this pool cannot reach it at any length';

  const atk = attackModel(e.keyspace);
  out.innerHTML = `
    <div class="verdict ${ok ? 'good' : 'bad'}">
      <span class="k">Verdict</span>
      <b>${plural(words, 'word')} ${words === 1 ? 'is' : 'are'} ${ok ? 'enough' : 'not enough'}</b>
      <i>${e.bits.toFixed(1)} bits against a ${useCase.bits}-bit bar${ok ? '' : ` — ${remedy}`}</i>
    </div>
    <p class="foot">${useCase.note}${
      useCase.rateLimited
        ? ' <strong>Rate limiting is doing half the work here:</strong> at one attempt per minute instead of the slider’s rate, the same keyspace holds for ' +
          humanizeSeconds(timeToGuess(e.keyspace, 1 / 60, atk.targets).seconds) + '.'
        : ''
    }</p>`;
}

useCaseSelect.addEventListener('change', syncSafety);

// ── Open on something real ───────────────────────────────────────────────────

onLengthChange(); // fills the note, rolls both lists, syncs both readouts
