#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// The harness.
//
// Word lists are data, and data rots quietly: a stray capital, a word with a
// hyphen in it, a duplicate pasted twice. None of that throws — it just makes
// the output subtly wrong and the entropy claims subtly false. So the claims
// are assertions here, and CI runs them.
//
//   node scripts/verify.mjs
//   exit 0 = green, 1 = something in the data or the maths moved
// ─────────────────────────────────────────────────────────────────────────────
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workDir = mkdtempSync(join(tmpdir(), 'funkynames-verify-'));

let api;
try {
  const bundle = join(workDir, 'funkynames.mjs');
  execSync(
    `npx esbuild src/index.ts --bundle --format=esm --platform=node --outfile=${JSON.stringify(bundle)}`,
    { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] },
  );
  api = await import(pathToFileURL(bundle).href);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

const {
  POOLS, POOL_NAMES, HANDLE_SLOTS, mergePools,
  generateHandle, generateHandles, generateCode, generateCodes,
  handleEntropy, codeEntropy, entropyOfSlots, entropyOfDraws,
  timeToGuess, randomInt,
} = api;

const failures = [];
const notes = [];
const fail = (msg) => failures.push(msg);

// ── 1. Word hygiene ──────────────────────────────────────────────────────────
// A word containing the separator would make a handle ambiguous to split;
// uppercase or whitespace would produce two spellings of the same name.
const WORD = /^[a-z0-9]+$/;
let totalWords = 0;
for (const name of POOL_NAMES) {
  const pool = POOLS[name];
  if (!Array.isArray(pool) || pool.length === 0) { fail(`pool '${name}' is empty`); continue; }
  totalWords += pool.length;

  const seen = new Set();
  for (const w of pool) {
    if (typeof w !== 'string' || !WORD.test(w)) {
      fail(`pool '${name}' has an invalid word: ${JSON.stringify(w)} (expected /^[a-z0-9]+$/)`);
    }
    if (seen.has(w)) { fail(`pool '${name}' repeats '${w}' — duplicates skew the draw`); }
    seen.add(w);
  }
}

// ── 2. Slots reference real pools ────────────────────────────────────────────
for (const slot of HANDLE_SLOTS) {
  for (const name of slot) {
    if (!POOL_NAMES.includes(name)) { fail(`HANDLE_SLOTS references unknown pool '${name}'`); }
  }
}

// ── 3. Entropy floors ────────────────────────────────────────────────────────
// Locked so that shrinking the pools — or a "tidy-up" that halves one — shows
// up as a failing build rather than a quietly weaker product.
const h = handleEntropy();
const c3 = codeEntropy(3);
const c4 = codeEntropy(4);
const floors = [
  ['handle', h, 30.0],
  ['code x3', c3, 34.5],
  ['code x4', c4, 46.0],
];
for (const [label, rep, floor] of floors) {
  if (rep.bits < floor) {
    fail(`${label} entropy fell to ${rep.bits.toFixed(2)} bits, below the ${floor} floor`);
  }
}

// ── 4. The maths itself ──────────────────────────────────────────────────────
if (entropyOfSlots([2, 2, 2]).bits !== 3) { fail('entropyOfSlots([2,2,2]) should be exactly 3 bits'); }
if (entropyOfDraws(2, 8).keyspace !== 256) { fail('entropyOfDraws(2,8) should be 256'); }
if (entropyOfSlots([]).keyspace !== 0) { fail('entropyOfSlots([]) should be 0'); }
{
  // Doubling the target count should halve the expected attempts.
  const one = timeToGuess(1e6, 10, 1).attempts;
  const two = timeToGuess(1e6, 10, 2).attempts;
  if (Math.abs(one / two - 2) > 1e-9) { fail('timeToGuess should scale inversely with liveTargets'); }
}

// ── 5. Generators ────────────────────────────────────────────────────────────
{
  const parts = generateHandle().split('-');
  if (parts.length !== HANDLE_SLOTS.length) {
    fail(`generateHandle produced ${parts.length} parts, expected ${HANDLE_SLOTS.length}`);
  }
  if (generateCode().split('-').length !== 4) { fail('generateCode should default to 4 words'); }
  if (generateCode({ words: 6 }).split('-').length !== 6) { fail('generateCode ignored { words: 6 }'); }
  if (!generateCode({ separator: '.' }).includes('.')) { fail('generateCode ignored { separator }'); }

  const handles = generateHandles(50);
  if (new Set(handles).size !== 50) { fail('generateHandles returned duplicates'); }
  const codes = generateCodes(50);
  if (new Set(codes).size !== 50) { fail('generateCodes returned duplicates'); }

  // Every generated word must come from the pools — catches a separator
  // sneaking into the data, since that would split into unknown fragments.
  const all = new Set(mergePools(false));
  for (const name of [...handles, ...codes]) {
    for (const part of name.split('-')) {
      if (!all.has(part)) { fail(`generated fragment '${part}' is not a pool word (from '${name}')`); }
    }
  }
}

// ── 6. Injected randomness is deterministic ──────────────────────────────────
// The documented escape hatch for tests. If it stops being reproducible, every
// snapshot test downstream starts flaking.
{
  const seeded = () => { let i = 0; const seq = [0.1, 0.5, 0.9, 0.3, 0.7, 0.2]; return () => seq[i++ % seq.length]; };
  const a = generateCode({ random: seeded(), words: 4 });
  const b = generateCode({ random: seeded(), words: 4 });
  if (a !== b) { fail(`injected random is not deterministic: '${a}' vs '${b}'`); }
  if (randomInt(10, { random: () => 0 }) !== 0) { fail('randomInt should honour an injected source'); }
  if (randomInt(10, { random: () => 0.999 }) !== 9) { fail('randomInt mis-scales an injected source'); }
}

// ── 7. CSPRNG is in range and not obviously stuck ────────────────────────────
{
  const counts = new Array(8).fill(0);
  for (let i = 0; i < 8000; i++) {
    const v = randomInt(8);
    if (!Number.isInteger(v) || v < 0 || v >= 8) { fail(`randomInt(8) returned ${v}`); break; }
    counts[v]++;
  }
  // Not a randomness test — just a stuck-generator canary. A fair d8 over 8,000
  // draws lands each face near 1,000; anything outside [700, 1300] is broken,
  // not unlucky (that band is ~9 sigma).
  if (counts.some((c) => c < 700 || c > 1300)) {
    fail(`randomInt(8) distribution looks stuck: ${counts.join(', ')}`);
  }
}

// ── Informational ────────────────────────────────────────────────────────────
{
  const seen = new Map();
  for (const name of POOL_NAMES) {
    for (const w of POOLS[name]) {
      if (!seen.has(w)) { seen.set(w, []); }
      seen.get(w).push(name);
    }
  }
  const cross = [...seen].filter(([, names]) => names.length > 1);
  notes.push(`${cross.length} words appear in 2+ pools (deduped for codes, kept for handles)`);

  const short = [...seen.keys()].filter((w) => w.length <= 2);
  if (short.length) { notes.push(`${short.length} words of <=2 chars: ${short.join(', ')}`); }
}

// ── Report ───────────────────────────────────────────────────────────────────
const line = '─'.repeat(64);
console.log(`\n${line}`);
console.log(`POOLS      ${POOL_NAMES.length} pools · ${totalWords} words · ${mergePools(true).length} distinct`);
for (const [label, rep] of [['HANDLE', h], ['CODE x3', c3], ['CODE x4', c4]]) {
  console.log(
    `${label.padEnd(10)} ${rep.bits.toFixed(2).padStart(6)} bits · ` +
    `${rep.readable.padStart(14)} · collides at ${rep.birthday50.toLocaleString('en-US')}`,
  );
}
console.log(line);
for (const n of notes) { console.log(`note  ${n}`); }

if (failures.length) {
  console.log();
  for (const f of failures) { console.error(`  ✗ ${f}`); }
  console.error(`\n❌ ${failures.length} failure${failures.length === 1 ? '' : 's'}\n`);
  process.exit(1);
}
console.log('\n✅ ALL GREEN\n');
