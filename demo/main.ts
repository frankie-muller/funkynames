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
const plural = (n: number, w: string) => `${fmt(n)} ${w}${n === 1 ? '' : 's'}`;

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
      <div><span class="k">Collides after</span><b>${exact(e.birthday50)}</b><i>names, 50% chance — the birthday bound, not the keyspace</i></div>
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

// ── Is this safe for… ────────────────────────────────────────────────────────
// Written for a reader who does not know what a bit is. A bit is defined once
// in the markup; every verdict leads with a comparison a person can feel and
// puts the bits in parentheses. The truth of the verdict — bits against the
// bar — is untouched; the copy around it is what changed.

interface UseCase {
  id: string;
  label: string;
  /** Bits this use actually needs. 0 means guessing is not the threat. */
  bits: number;
  /** One paragraph, plain English, carrying the bar's comparison. */
  plainWhy: string;
  rateLimited: boolean;
}

const USE_CASES: UseCase[] = [
  { id: 'username', label: 'Username or display handle', bits: 0, rateLimited: false,
    plainWhy: 'Everyone can already see it, so nobody gains anything by guessing it — the only thing that can go wrong is handing two people the same name, and you catch that by checking when you issue one.' },
  { id: 'room', label: 'Room / lobby code', bits: 30, rateLimited: true,
    plainWhy: 'A stranger who guesses it can walk into the game, but the room dies within the hour and there\'s little to steal, so just over a billion possibilities (30 bits — about a 10-digit number) is plenty, as long as rooms really do expire and you slow down repeated join attempts.' },
  { id: 'invite', label: 'Invite or share link', bits: 45, rateLimited: true,
    plainWhy: 'It lives for months, it opens a door, and thousands may be out there at once — a guesser only has to hit any one of them — so it needs about 35 trillion possibilities (45 bits — roughly an 8-character random password).' },
  { id: 'reset', label: 'Password reset token', bits: 60, rateLimited: true,
    plainWhy: 'Guess this one and you own the account, so even though it should only live for minutes it needs about a billion billion possibilities (60 bits — a 10-character random password of letters and digits).' },
  { id: 'apikey', label: 'API key or bearer token', bits: 128, rateLimited: false,
    plainWhy: 'It\'s a permanent password that machines get to try as fast as they like, so it needs 128 bits — a number 39 digits long, as many possibilities as a 22-character random password. With every pool on, that takes twelve words — the top of the slider — and nobody is reading a twelve-word key aloud. Honestly, that\'s a job for random bytes, not words; words are for saying out loud.' },
];

const useCaseSelect = $<HTMLSelectElement>('use-case');
for (const u of USE_CASES) { useCaseSelect.append(new Option(u.label, u.id)); }

/** "about 2.8 million" — mirrors the library's readable scales, with a plain cap past 10^15. */
function about(n: number): string {
  if (n >= 1e15) { return 'more than a million billion'; }
  for (const [size, label] of [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']] as const) {
    if (n >= size) { return `about ${(n / size).toFixed(1)} ${label}`; }
  }
  return `about ${Math.round(n)}`;
}

/** A duration a person can react to. Never "0.0 seconds". */
function dur(seconds: number): string {
  if (seconds < 1) { return 'less than a second'; }
  if (seconds < 60) { return `about ${plural(Math.round(seconds), 'second')}`; }
  const years = seconds / 31_557_600;
  // Past a few million years the exact figure is noise; past the age of the
  // universe it is a punchline. Say so instead of printing 21 digits.
  if (years >= 1.4e10) { return 'longer than the universe has existed'; }
  if (years >= 1e6) { return `about ${compact.format(years)} years`; }
  return humanizeSeconds(seconds);
}

/** Same band edges as describeBits(), worded as things a teenager can picture. */
function compare(bits: number): string {
  if (bits < 20) { return 'about as many possibilities as a 6-digit number, or fewer'; }
  if (bits < 30) { return 'somewhere between a 7-digit and a 9-digit number'; }
  if (bits < 40) { return 'roughly a 6-character random password'; }
  if (bits < 50) { return 'roughly an 8-character random password of letters and digits'; }
  if (bits < 70) { return 'a 10-to-12-character random password'; }
  if (bits < 128) { return 'longer than any password a person would type — 12 to 21 random characters'; }
  return 'a 22-character random password, which is what real API keys are made of';
}

const guesses = (n: number) => `${fmt(n)} ${n === 1 ? 'guess' : 'guesses'} a second`;

function syncSafety(): void {
  const useCase = USE_CASES.find((u) => u.id === useCaseSelect.value) as UseCase;
  const words = Number(labWords.value);
  const poolSize = activePoolSize();
  const out = $('safety-readout');
  const card = (cls: string, head: string, why: string, what: string) => `
    <div class="verdict ${cls}">
      <span class="k">Verdict</span>
      <b>${head}</b>
      ${why ? `<p class="vline"><span class="lead">Why:</span> ${why}</p>` : ''}
      ${what ? `<p class="vline"><span class="lead">What to change:</span> ${what}</p>` : ''}
    </div>`;

  // 1. Nothing qualifies at all.
  if (poolSize === 0) {
    out.innerHTML = `
      <div class="verdict neutral"><span class="k">Verdict</span><b>Nothing to measure yet.</b>
      <p class="vline">With the pools you have turned on and the word-length range at the top of the page, not a single word qualifies, so no codes can be made — and there is no verdict to give. Widen the range, or turn a pool back on, and this panel will fill in.</p></div>`;
    return;
  }

  // 2. Username: guessing is not the threat; collisions are.
  if (useCase.bits === 0) {
    let birthday: string;
    try {
      const h = handleEntropy(lengthRange());
      birthday = `You can issue about ${fmt(h.birthday50)} handles before that becomes a coin flip — far fewer than the total number of possible names, for the same reason a class of 23 kids usually has two people who share a birthday.`;
    } catch {
      birthday = 'At this word-length range one of the handle\'s three slots has no words in it, so no handles can be made and there is no collision figure to give — widen the range at the top of the page.';
    }
    out.innerHTML = card('good', 'Safe — nobody needs to guess a username.',
      `it\'s shown to everyone, so guessing it gains nothing. The one thing that can go wrong is handing two people the same name. ${birthday}`,
      'nothing in the recipe. Check for a match when you issue a handle and re-roll on a clash; when re-rolls start happening often, that\'s your signal to add a fourth slot. One catch: if your app ever treats the handle as a secret — a private profile link, a log-in-by-handle flow — it stopped being a username. Pick that use from the list instead and read the real verdict.')
      + `<p class="foot">${useCase.plainWhy}</p>`;
    return;
  }

  // 3. One word in the pool: the only way to zero bits, so "0.0" never prints.
  if (poolSize === 1) {
    out.innerHTML = card('bad', 'No — there\'s only one word to choose from.',
      'with a single word in the pool, every code comes out identical — that one word, over and over — so there is exactly one possible code and nothing to guess. More words won\'t help: one choice times one choice is still one choice, however many you add.',
      'turn on more pools, or widen the word-length range at the top of the page, so each word has something to choose from.')
      + `<p class="foot">${useCase.plainWhy}</p>`;
    return;
  }

  const e = entropyOfDraws(poolSize, words);
  const ok = e.bits >= useCase.bits;
  const atk = attackModel(e.keyspace);
  const guess = timeToGuess(e.keyspace, atk.perSec, atk.targets);
  const slow = timeToGuess(e.keyspace, 1 / 60, atk.targets);
  const tries = atk.clamped ? 'just one' : about(guess.attempts);
  const clampedNote = atk.clamped ? ' There are more live codes out there than there are possible codes, so every single guess lands on someone\'s.' : '';
  // atk.targets, not the raw slider value: once clamped it IS the number
  // the guess/slow calculations below actually used, and the prose has to
  // describe the same attack it's reporting numbers for.
  const attack = `Someone guessing at random — ${guesses(atk.perSec)}, with ${plural(atk.targets, 'live code')} any one of which counts as a hit — should expect to land one after ${tries} guesses, ${dur(guess.seconds)}.${clampedNote}`;

  const rateLine = useCase.rateLimited
    ? `<p class="foot">The cheap half of the answer: you decide how fast people are allowed to guess. Let them try once a minute instead of ${atk.perSec === 1 ? 'once' : `${fmt(atk.perSec)} times`} a second and the same ${words}-word codes hold out for ${dur(slow.seconds)} instead of ${dur(guess.seconds)}. That isn\'t a bonus on top of the maths — it\'s half of it, and the bar for this use assumes you\'re doing it. If a code lives longer than ${dur(guess.seconds)} and you have no throttle, treat the answer as no.</p>`
    : '';

  if (ok) {
    const why = `a ${words}-word code from these pools is ${compare(e.bits)} (${e.bits.toFixed(1)} bits; this use needs ${useCase.bits}), so there are more possible codes than the job calls for. With ${plural(atk.targets, 'live code')} out there and ${guesses(atk.perSec)}, someone guessing at random should expect their first hit after ${tries} guesses — ${dur(guess.seconds)}.`;
    if (guess.seconds < 86_400) {
      // The lab's own "bad" band: the bits clear the bar but the sliders beat it.
      out.innerHTML = card('warn', `Yes, but — ${plural(words, 'word')} clears the bar, and these sliders still beat it.`, why,
        `careful — enough bits does not mean safe at these slider settings. ${plural(atk.targets, 'live code')} and ${guesses(atk.perSec)} still means a hit in ${dur(guess.seconds)}. Expire old codes, or slow the guesser down (see the note below); one extra word also multiplies the time by the size of the pool.`)
        + `<p class="foot">${useCase.plainWhy}</p>${rateLine}`;
      return;
    }
    out.innerHTML = card('good', `Yes — ${plural(words, 'word')} clears the bar for this.`, why,
      'nothing, as long as the note below holds. Keep an eye on the two sliders, though: more live codes or faster guessing shortens that time, and one extra word multiplies it by the size of the pool.')
      + `<p class="foot">${useCase.plainWhy}</p>${rateLine}`;
    return;
  }

  // No. The remedy is measured against the SAME pool the verdict used.
  const perWord = Math.log2(poolSize);
  const needWords = Math.max(1, Math.ceil(useCase.bits / perWord));
  const sliderMax = Number(labWords.max) || 10;
  const pill = needWords <= sliderMax
    ? `<span class="pill">Use ${plural(needWords, 'word')}</span><span class="pill-cap">${entropyOfDraws(poolSize, needWords).bits.toFixed(1)} bits from these pools — clears the bar</span> Every word you add multiplies the number of possible codes by the pool size. Or turn more pools on so each word has more to choose from.`
    : `<span class="pill">More words than the slider allows</span><span class="pill-cap">turn more pools on instead, or use random bytes for this job</span> Every word you add multiplies the number of possible codes by the pool size.`;
  out.innerHTML = card('bad', `No — ${plural(words, 'word')} is not enough for this.`,
    `there are too few possible codes. A ${words}-word code from these pools is ${compare(e.bits)} (${e.bits.toFixed(1)} bits), and this use needs ${useCase.bits}. Every missing bit halves the time a guesser needs, so the gap is bigger than the two numbers look. ${attack}`,
    pill)
    + `<p class="foot">${useCase.plainWhy}</p>${rateLine}`;
}

useCaseSelect.addEventListener('change', syncSafety);

// ── Open on something real ───────────────────────────────────────────────────

onLengthChange(); // fills the note, rolls both lists, syncs both readouts
