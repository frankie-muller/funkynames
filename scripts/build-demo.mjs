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
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
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

if (outDir !== join(root, 'demo')) {
  copyFileSync(join(root, 'demo/index.html'), join(outDir, 'index.html'));
}

const raw = statSync(outFile).size;
const gz = gzipSync(readFileSync(outFile)).length;
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`demo.js  ${kb(raw)} raw · ${kb(gz)} gzipped  →  ${outFile.replace(root + '/', '')}`);
