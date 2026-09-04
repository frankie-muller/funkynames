#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Sync every figure the README quotes from the built library.
//
//   node scripts/sync-readme.mjs          # rewrite README.md, print what moved
//   node scripts/sync-readme.mjs --check  # exit 1 if anything is stale (CI)
//
// The README's whole pitch is "the numbers are trustworthy". A number typed
// by hand goes stale the moment a pool changes, and a stale security figure
// is worse than none. So the figures are computed from dist/ and written in;
// the prose around them stays human.
//
// Requires `npm run build` first — it reads the compiled library, the same
// thing consumers get.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const lib = await import(pathToFileURL(join(root, 'dist/index.js')).href);
const { POOLS, POOL_NAMES, codeEntropy, handleEntropy, timeToGuess, wordsForBits, mergePools, withinLength, entropyOfDraws } = lib;

const fmt = (n) => n.toLocaleString('en-US');
const lit = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '_');

const h = handleEntropy();
const c3 = codeEntropy(3);
const c4 = codeEntropy(4);
const c6 = codeEntropy(6);
const all = mergePools(true);
const total = mergePools(false).length;
const t1 = timeToGuess(c3.keyspace, 50, 1);
const t10k = timeToGuess(c3.keyspace, 50, 10_000);
const t4 = timeToGuess(c4.keyspace, 50, 10_000);
const w60 = wordsForBits(60);
const perWord = Math.round(Math.log2(all.length));
const band = (a, b) => ({ bits: codeEntropy(4, { minLength: a, maxLength: b }).bits.toFixed(1), n: withinLength(all, { minLength: a, maxLength: b }).length });
const inside = t10k.seconds < 3_600 ? 'inside an hour' : t10k.seconds < 86_400 ? 'inside a day' : t10k.seconds < 604_800 ? 'inside a week' : `in ${t10k.readable}`;
const roundTo500 = (n) => fmt(Math.round(n / 500) * 500);

const POOL_EMOJI = { ninjactives: '🥷', verbtrics: '⚡', kawaiiolors: '🌸', memactions: '😤', biome: '🌍', monsterials: '👹' };

// Each entry: [label, regex, replacement]. Regexes match the SHAPE of a figure
// site, not its current value, so this works no matter what is there now.
const SITES = [
  ['headline handle bits', /(generateHandle\(\)\s+readable, )[\d.]+ bits/, `$1${h.bits.toFixed(1)} bits`],
  ['headline code bits', /(generateCode\(\)\s+flat draws, )[\d.]+ bits/, `$1${c4.bits.toFixed(1)} bits`],
  ['intro codeEntropy(3)', /(const e = codeEntropy\(3\);\s+\/\/ )[\d.]+ bits — "roughly/, `$1${c3.bits.toFixed(1)} bits — "roughly`],
  ['intro timeToGuess', /(timeToGuess\(e\.keyspace, 50, 10_000\); \/\/ → ")[^"]+(")/, `$1${t10k.readable}$2`],
  ['intro sentence', /Three words, [\d.]+ (?:million|billion|trillion) combinations, and a determined attacker gets one [^\n]+?\.(?=\s)/, `Three words, ${c3.readable} combinations, and a determined attacker gets one ${inside}.`],
  ['codeEntropy(4) literal', /\/\/ \{ keyspace: [\d_]+, bits: [\d.]+, birthday50: [\d_]+, readable: '[^']+' \}/, `// { keyspace: ${lit(c4.keyspace)}, bits: ${c4.bits.toFixed(2)}, birthday50: ${lit(c4.birthday50)}, readable: '${c4.readable}' }`],
  ['describeBits arg', /describeBits\([\d.]+\);/, `describeBits(${c4.bits.toFixed(2)});`],
  ['wordsForBits(60)', /\/\/ \{ words: \d+, achieved: \{ bits: [\d.]+, \.\.\. \} \}/, `// { words: ${w60.words}, achieved: { bits: ${w60.achieved.bits.toFixed(1)}, ... } }`],
  ['birthday paragraph', /A [\d.]+-bit handle space holds [\d.]+ (?:million|billion) names/, `A ${h.bits.toFixed(1)}-bit handle space holds ${h.readable} names`],
  ['birthday number', /\*\*You need about [\d,]+\.\*\*/, `**You need about ${roundTo500(h.birthday50)}.**`],
  ['dilution codeEntropy(3)', /(const e = codeEntropy\(3\);\s+\/\/ )[\d.]+ bits, [\d.]+ (?:million|billion|trillion)/, `$1${c3.bits.toFixed(1)} bits, ${c3.readable}`],
  ['dilution one target', /(timeToGuess\(e\.keyspace, 50, 1\);\s+\/\/ one target\s+→ ')[^']+(')/, `$1${t1.readable}$2`],
  ['dilution ten thousand', /(timeToGuess\(e\.keyspace, 50, 10_000\);\s+\/\/ ten thousand\s+→ ')[^']+(')/, `$1${t10k.readable}$2`],
  ['dilution sentence', /Ten thousand outstanding invite links turned [^\n]+? into [^\n]+?\.(?=\s)/, `Ten thousand outstanding invite links turned ${t1.readable} into ${t10k.readable}.`],
  ['lever row', /\| \*\*Add a word\*\* \| \+\d+ bits — [^|]+ becomes \*\*[^*]+\*\* \| one word \|/, `| **Add a word** | +${perWord} bits — ${t10k.readable} becomes **${t4.readable}** | one word |`],
  ['default table 3', /\| 3 \| [\d.]+ \| roughly/, `| 3 | ${c3.bits.toFixed(1)} | roughly`],
  ['default table 4', /\| \*\*4\*\* \| \*\*[\d.]+\*\* \| comparable/, `| **4** | **${c4.bits.toFixed(1)}** | comparable`],
  ['default table 6', /\| 6 \| [\d.]+ \| brute/, `| 6 | ${c6.bits.toFixed(1)} | brute`],
  ['filter table', /\| all \| [\d.]+ \|\n\| 3–5 chars \| [\d.]+ \|\n\| 6–8 chars \| [\d.]+ \|\n\| 7–8 chars \| \*\*[\d.]+\*\* \|/, `| all | ${c4.bits.toFixed(1)} |\n| 3–5 chars | ${band(3, 5).bits} |\n| 6–8 chars | ${band(6, 8).bits} |\n| 7–8 chars | **${band(7, 8).bits}** |`],
  ['filter sentence', /because only [\d,]+ of [\d,]+ words qualify\./, `because only ${fmt(band(7, 8).n)} of ${fmt(all.length)} words qualify.`],
  ['filter cost', /costs you (?:\w+|\d+) bits, because/, `costs you ${Math.round(c4.bits - Number(band(7, 8).bits))} bits, because`],
  ['pool totals', /\*\*6 pools · [\d,]+ words · [\d,]+ distinct\.\*\*/, `**6 pools · ${fmt(total)} words · ${fmt(all.length)} distinct.**`],
  ...POOL_NAMES.map((p) => [`pool header ${p}`, new RegExp(`(### ${POOL_EMOJI[p]} \`${p}\` — )\\d+`), `$1${POOLS[p].length}`]),
  ['harness block', /POOLS {6}6 pools · \d+ words · \d+ distinct\nHANDLE {6}[\d.]+ bits · +[\d.]+ (?:million|billion) · collides at [\d,]+\nCODE x3 {5}[\d.]+ bits · +[\d.]+ (?:million|billion|trillion) · collides at [\d,]+\nCODE x4 {5}[\d.]+ bits · +[\d.]+ (?:billion|trillion) · collides at [\d,]+/,
    `POOLS      6 pools · ${total} words · ${all.length} distinct\nHANDLE      ${h.bits.toFixed(2)} bits ·  ${h.readable} · collides at ${fmt(h.birthday50)}\nCODE x3     ${c3.bits.toFixed(2)} bits ·   ${c3.readable} · collides at ${fmt(c3.birthday50)}\nCODE x4     ${c4.bits.toFixed(2)} bits ·   ${c4.readable} · collides at ${fmt(c4.birthday50)}`],
];

let md = readFileSync(join(root, 'README.md'), 'utf8');
const original = md;
const changed = [];
const missing = [];
for (const [label, re, replacement] of SITES) {
  if (!re.test(md)) { missing.push(label); continue; }
  const next = md.replace(re, replacement);
  if (next !== md) { changed.push(label); md = next; }
}

if (missing.length) {
  console.error(`\n  ${missing.length} figure site(s) not found — the README prose moved and the regex needs updating:`);
  for (const m of missing) { console.error(`    · ${m}`); }
}

if (check) {
  if (changed.length || missing.length) {
    console.error(`\n  README is stale: ${changed.length} figure(s) differ from the library.\n  Run: node scripts/sync-readme.mjs\n`);
    for (const c of changed) { console.error(`    · ${c}`); }
    process.exit(1);
  }
  console.log('  README figures match the library.');
  process.exit(0);
}

if (md !== original) {
  writeFileSync(join(root, 'README.md'), md);
  console.log(`\n  ✓ README.md — ${changed.length} figure(s) updated:`);
  for (const c of changed) { console.log(`    · ${c}`); }
} else {
  console.log('\n  README.md already in sync.');
}
console.log(`\n  ${fmt(total)} words · ${fmt(all.length)} distinct · handle ${h.bits.toFixed(2)} · code×4 ${c4.bits.toFixed(2)}\n`);
if (missing.length) { process.exit(1); }
