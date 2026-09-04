#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Build the GitHub Pages demo.
//
//   npm run build:demo        → demo/demo.js  (open demo/index.html directly)
//   npm run build:demo -- --out site   → a deployable copy in site/
//
// Bundles the REAL src/ modules into the page. There is no API and no server:
// the dictionary is the payload, which is only viable because the library is
// offline by design. Reported below so the size stays honest.
// ─────────────────────────────────────────────────────────────────────────────
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outIdx = process.argv.indexOf('--out');
const outDir = outIdx !== -1 && process.argv[outIdx + 1]
  ? join(root, process.argv[outIdx + 1])
  : join(root, 'demo');

mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'demo.js');

await build({
  entryPoints: [join(root, 'demo/main.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  sourcemap: false,
  outfile: outFile,
  logLevel: 'warning',
});

// ── Cache busting ────────────────────────────────────────────────────────────
// GitHub Pages serves assets with a cache lifetime, and the bundle's URL never
// changes between deploys — so a returning visitor keeps running the previous
// build against the current page. That is invisible to whoever shipped it and
// confusing to everyone else: the page says one thing, the data says another.
//
// Stamping the content hash into the script URL means a changed bundle is a
// changed URL, so browsers fetch it. An unchanged bundle keeps its URL and
// stays cached, which is the behaviour you actually want.
// Only the DEPLOYED copy gets stamped. demo/index.html stays a clean template
// with a bare src, so building in place never churns a tracked file — and a
// local dev server has no stale-cache problem to solve anyway.
const hash = createHash('sha256').update(readFileSync(outFile)).digest('hex').slice(0, 8);
if (outDir !== join(root, 'demo')) {
  const html = readFileSync(join(root, 'demo/index.html'), 'utf8')
    .replace(/src="\.\/demo\.js(?:\?v=[a-f0-9]+)?"/, `src="./demo.js?v=${hash}"`);
  writeFileSync(join(outDir, 'index.html'), html);
}

const raw = statSync(outFile).size;
const gz = gzipSync(readFileSync(outFile)).length;
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`demo.js  ${kb(raw)} raw · ${kb(gz)} gzipped · v=${hash}  →  ${outFile.replace(root + '/', '')}`);
