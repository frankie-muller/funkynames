#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Apply a reviewed proposal file to src/pools.ts.
//
//   node scripts/apply-proposals.mjs proposals/recommended.json          # dry run
//   node scripts/apply-proposals.mjs proposals/recommended.json --write  # apply
//
// The file's `words` is { poolName: [word, ...] }. Every word is re-checked
// against the harness rules here — shape, corpus duplicate, in-file duplicate,
// prefix-of-existing — because a reviewed file can still carry a mistake, and
// the pool is the one place a mistake becomes permanent. Then `npm test` runs
// the full harness on the result; this script never skips it.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const write = process.argv.includes('--write');

if (!file) {
  console.error('\nUsage: node scripts/apply-proposals.mjs <proposals/file.json> [--write]\n');
  process.exit(1);
}

const spec = JSON.parse(readFileSync(resolve(root, file), 'utf8'));
const incoming = spec.words;
if (!incoming || typeof incoming !== 'object') {
  console.error('Expected a `words` object of { pool: [word, ...] }.');
  process.exit(1);
}

const source = readFileSync(join(root, 'src/pools.ts'), 'utf8');
const POOL_RE = /export const (\w+): readonly string\[\] = \[([\s\S]*?)\n\];/g;
const pools = new Map();
let m;
while ((m = POOL_RE.exec(source)) !== null) {
  pools.set(m[1], [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]));
}
if (pools.size === 0) {
  console.error('Could not parse any pools from src/pools.ts — has its shape changed?');
  process.exit(1);
}
const everyWord = new Set([...pools.values()].flat());

const WORD = /^[a-z0-9]+$/;
const added = new Map();
const skipped = [];

for (const [pool, words] of Object.entries(incoming)) {
  if (!pools.has(pool)) { skipped.push(`${pool}: unknown pool (${words.length} words ignored)`); continue; }
  const current = pools.get(pool);
  const seen = new Set(current);
  const out = [];
  for (const raw of words) {
    const w = String(raw).trim().toLowerCase();
    if (!WORD.test(w)) { skipped.push(`${pool}/${w}: bad shape`); continue; }
    if (seen.has(w)) { skipped.push(`${pool}/${w}: already in this pool`); continue; }
    if (everyWord.has(w)) {
      // Cross-pool duplicates are allowed (159 already exist) but worth seeing.
      skipped.push(`${pool}/${w}: note — already in another pool, added anyway`);
    }
    const parent = [...everyWord].find((e) => e !== w && e.startsWith(w) && w.length >= 4);
    if (parent) { skipped.push(`${pool}/${w}: prefix of existing '${parent}' — refused as a likely truncation`); continue; }
    seen.add(w);
    out.push(w);
  }
  added.set(pool, out);
}

// Cross-pool notes are informational; strip them from the refusal list.
const refused = skipped.filter((s) => !s.includes('note —'));
const notes = skipped.filter((s) => s.includes('note —'));

console.log(`\n${write ? 'APPLYING' : 'DRY RUN'} — ${file}\n`);
let total = 0;
for (const [pool, words] of added) {
  const before = pools.get(pool).length;
  total += words.length;
  console.log(`  ${pool.padEnd(14)} ${String(before).padStart(4)} → ${String(before + words.length).padStart(4)}  (+${words.length})`);
}
console.log(`  ${'TOTAL'.padEnd(14)} +${total}`);
if (notes.length) { console.log(`\n  ${notes.length} cross-pool duplicates (allowed):`); for (const n of notes.slice(0, 12)) console.log(`    ${n}`); if (notes.length > 12) console.log(`    … ${notes.length - 12} more`); }
if (refused.length) { console.log(`\n  REFUSED ${refused.length}:`); for (const r of refused) console.log(`    ${r}`); }

if (!write) { console.log('\n  Nothing written. Re-run with --write to apply, then `npm test`.\n'); process.exit(0); }

let out = source;
for (const [pool, words] of added) {
  if (words.length === 0) continue;
  const all = [...pools.get(pool), ...words];
  const lines = [];
  for (let i = 0; i < all.length; i += 8) lines.push(`  ${all.slice(i, i + 8).map((w) => `'${w}'`).join(', ')},`);
  out = out.replace(
    new RegExp(`(export const ${pool}: readonly string\\[\\] = \\[)([\\s\\S]*?)(\\n\\];)`),
    `$1\n${lines.join('\n')}$3`,
  );
  out = out.replace(
    new RegExp(`(/\\*\\* [^*]*?)\\d+( words\\. \\*/\\s*\\nexport const ${pool}\\b)`),
    `$1${all.length}$2`,
  );
}
writeFileSync(join(root, 'src/pools.ts'), out);
console.log('\n  ✓ src/pools.ts rewritten. Run `npm test` now — the harness is the gate, not this script.\n');
