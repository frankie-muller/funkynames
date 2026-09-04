#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Apply scripts/repairs.json to src/pools.ts.
//
//   node scripts/apply-repairs.mjs           # dry run — prints, changes nothing
//   node scripts/apply-repairs.mjs --write   # rewrites src/pools.ts
//
// Repairs restore words that were truncated at ~7 characters in the source data
// (`hippogr` -> `hippogriff`). Drops remove fragments with no defensible
// expansion. Keys beginning with `_` are section comments and are skipped.
//
// Two cases the naive version gets wrong, both handled here:
//   - a repaired word may ALREADY exist in its pool, which would create a
//     duplicate and skew the draw. The repair is dropped instead.
//   - a repair may collide with a word in a DIFFERENT pool. That is allowed
//     (159 words already do), but it is reported, since it changes how the
//     handle slot dedupe behaves.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');

const spec = JSON.parse(readFileSync(join(root, 'scripts/repairs.json'), 'utf8'));
const repair = Object.fromEntries(
  Object.entries(spec.repair).filter(([k]) => !k.startsWith('_')),
);
const drop = new Set(spec.drop);

const source = readFileSync(join(root, 'src/pools.ts'), 'utf8');

// Parse the pool arrays straight out of the source so this stays the one place
// the word data lives — no separate copy to drift.
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

const applied = [];
const skippedExisting = [];
const dropped = [];
const unused = new Set(Object.keys(repair));
const crossPool = [];

const updated = new Map();
for (const [name, words] of pools) {
  const present = new Set(words);
  const out = [];
  const seen = new Set();

  for (const word of words) {
    if (drop.has(word)) { dropped.push(`${name}/${word}`); continue; }

    let final = word;
    if (Object.hasOwn(repair, word)) {
      unused.delete(word);
      const replacement = repair[word];
      if (present.has(replacement) || seen.has(replacement)) {
        // The full word is already in this pool; keeping both would duplicate.
        skippedExisting.push(`${name}/${word} -> ${replacement} (already present)`);
        continue;
      }
      final = replacement;
      applied.push(`${name}/${word} -> ${replacement}`);
    }

    if (seen.has(final)) { continue; }
    seen.add(final);
    out.push(final);
  }
  updated.set(name, out);
}

// Report repaired words that now exist in more than one pool.
const owners = new Map();
for (const [name, words] of updated) {
  for (const w of words) {
    if (!owners.has(w)) { owners.set(w, []); }
    owners.get(w).push(name);
  }
}
for (const value of Object.values(repair)) {
  const names = owners.get(value);
  if (names && names.length > 1) { crossPool.push(`${value} -> ${names.join(' + ')}`); }
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`\n${write ? 'APPLYING' : 'DRY RUN'} — scripts/repairs.json\n`);
console.log(`  repaired  ${applied.length}`);
console.log(`  dropped   ${dropped.length}`);
if (skippedExisting.length) {
  console.log(`  skipped   ${skippedExisting.length} (full word already in that pool)`);
  for (const s of skippedExisting) { console.log(`              ${s}`); }
}
if (unused.size) {
  console.log(`  UNUSED    ${unused.size} repair keys matched no word — a typo in repairs.json?`);
  for (const u of unused) { console.log(`              ${u}`); }
}
if (crossPool.length) {
  console.log(`  note      ${crossPool.length} repaired words now sit in 2+ pools:`);
  for (const c of crossPool) { console.log(`              ${c}`); }
}

console.log('\n  pool sizes');
let before = 0;
let after = 0;
for (const [name, words] of updated) {
  const was = pools.get(name).length;
  before += was;
  after += words.length;
  const delta = words.length - was;
  console.log(`    ${name.padEnd(14)} ${String(was).padStart(4)} -> ${String(words.length).padStart(4)}  ${delta === 0 ? '' : (delta > 0 ? '+' : '') + delta}`);
}
const distinctBefore = new Set([...pools.values()].flat()).size;
const distinctAfter = new Set([...updated.values()].flat()).size;
console.log(`    ${'TOTAL'.padEnd(14)} ${String(before).padStart(4)} -> ${String(after).padStart(4)}`);
console.log(`    ${'distinct'.padEnd(14)} ${String(distinctBefore).padStart(4)} -> ${String(distinctAfter).padStart(4)}`);
console.log(`\n  code entropy at 4 words: ${(Math.log2(distinctBefore ** 4)).toFixed(2)} -> ${(Math.log2(distinctAfter ** 4)).toFixed(2)} bits`);

if (!write) {
  console.log('\n  Nothing written. Re-run with --write to apply.\n');
  process.exit(0);
}

// ── Rewrite, preserving the file's structure and comments ────────────────────
let out = source;
for (const [name, words] of updated) {
  const lines = [];
  for (let i = 0; i < words.length; i += 8) {
    lines.push(`  ${words.slice(i, i + 8).map((w) => `'${w}'`).join(', ')},`);
  }
  const re = new RegExp(
    `(export const ${name}: readonly string\\[\\] = \\[)([\\s\\S]*?)(\\n\\];)`,
  );
  out = out.replace(re, `$1\n${lines.join('\n')}$3`);
  // Keep the per-pool count in the doc comment honest.
  out = out.replace(
    new RegExp(`(/\\*\\* [^*]*?)\\d+( words\\. \\*/\\s*\\nexport const ${name}\\b)`),
    `$1${words.length}$2`,
  );
}
writeFileSync(join(root, 'src/pools.ts'), out);
console.log('\n  ✓ src/pools.ts rewritten. Run `npm test` next.\n');
