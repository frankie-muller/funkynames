#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// GROW — propose new words for a pool, using the LLM of your choice.
//
//   npm run grow -- --pool monsterials --min-length 8 --max-length 12 -n 40
//   ALCHEMY-style: it does NOT write to src/pools.ts. It writes a reviewable
//   proposal to proposals/, you read it, you paste what you agree with, and
//   `npm test` decides whether it may live.
//
// ENV
//   FUNKY_PROVIDER  anthropic (default) | openai | gemini | watsonx | custom
//   FUNKY_API_KEY   required (falls back to ANTHROPIC_API_KEY / OPENAI_API_KEY
//                   / GEMINI_API_KEY so an already-exported key just works)
//   FUNKY_MODEL     overrides the per-provider default
//   FUNKY_API_URL   required for `custom` — any OpenAI-compatible endpoint
//
//   watsonx additionally reads WATSONX_URL, WATSONX_PROJECT_ID,
//   WATSONX_API_VERSION and WATSONX_MODEL_ID — the same names IBM's own
//   tooling uses, so an existing project .env works unchanged:
//     set -a; source /path/to/orchestrator/.env; set +a
//
// `custom` covers Ollama, llama.cpp, vLLM, LM Studio — so the pools can be
// grown with no API key and no network at all.
// ─────────────────────────────────────────────────────────────────────────────
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Args ─────────────────────────────────────────────────────────────────────
function arg(...names) {
  for (const n of names) {
    const i = process.argv.indexOf(n);
    if (i !== -1 && process.argv[i + 1]) { return process.argv[i + 1]; }
  }
  return undefined;
}

const poolName = arg('--pool', '-p');
const count = Number(arg('--count', '-n') || 30);
const minLength = Number(arg('--min-length') || 0);
const maxLength = Number(arg('--max-length') || 0);

if (!poolName) {
  console.error(`
Usage: npm run grow -- --pool <name> [-n 30] [--min-length 8] [--max-length 12]

Pools:  ninjactives  verbtrics  kawaiiolors  memactions  biome  monsterials

The length flags are the point. 62% of the corpus is 5-6 letters, so an
unconstrained run mostly returns more of what you already have. Ask for the
tier that is actually starving:

  npm run grow -- --pool monsterials --min-length 8 --max-length 12 -n 40
`);
  process.exit(1);
}

// ── Providers ────────────────────────────────────────────────────────────────
const PROVIDERS = {
  anthropic: {
    defaultModel: 'claude-sonnet-5',
    envKeys: ['FUNKY_API_KEY', 'ANTHROPIC_API_KEY'],
    request: (model, prompt, key) => ({
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: { model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] },
    }),
    extract: (j) => j?.content?.[0]?.text,
  },
  openai: {
    defaultModel: 'gpt-4o',
    envKeys: ['FUNKY_API_KEY', 'OPENAI_API_KEY'],
    request: (model, prompt, key) => ({
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: { model, messages: [{ role: 'user', content: prompt }] },
    }),
    extract: (j) => j?.choices?.[0]?.message?.content,
  },
  gemini: {
    defaultModel: 'gemini-2.5-flash',
    envKeys: ['FUNKY_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    request: (model, prompt, key) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: { contents: [{ parts: [{ text: prompt }] }] },
    }),
    extract: (j) => j?.candidates?.[0]?.content?.parts?.[0]?.text,
  },
  watsonx: {
    // IBM watsonx.ai. The chat endpoint is close to OpenAI's shape, but the
    // auth is not: an IBM Cloud API key is not a bearer token, it is exchanged
    // for a short-lived one. That is why `request` may be async here.
    defaultModel: process.env.WATSONX_MODEL_ID || 'openai/gpt-oss-120b',
    envKeys: ['FUNKY_API_KEY', 'WATSONX_APIKEY', 'IBM_CLOUD_API_KEY'],
    request: async (model, prompt, key) => {
      const base = (process.env.WATSONX_URL || '').replace(/\/+$/, '');
      const project = process.env.WATSONX_PROJECT_ID;
      const version = process.env.WATSONX_API_VERSION || '2024-10-08';
      if (!base || !project) {
        throw new Error(
          'watsonx needs WATSONX_URL and WATSONX_PROJECT_ID. If you already have ' +
          'a project .env with them:  set -a; source <path>/.env; set +a',
        );
      }

      const iam = await fetch('https://iam.cloud.ibm.com/identity/token', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
          apikey: key,
        }),
      });
      if (!iam.ok) {
        throw new Error(
          `IAM token exchange failed (${iam.status}). The key is rejected before ` +
          'watsonx is even reached — check WATSONX_APIKEY / IBM_CLOUD_API_KEY.',
        );
      }
      const { access_token: token } = await iam.json();

      return {
        url: `${base}/ml/v1/text/chat?version=${version}`,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: {
          model_id: model,
          project_id: project,
          messages: [{ role: 'user', content: prompt }],
          // Word invention wants variety, not the temperature 0 an
          // audit-grade decision agent would use.
          temperature: 0.9,
          // Reasoning models on watsonx spend the budget thinking BEFORE they
          // emit content, so an undersized limit returns an empty string
          // rather than a truncated one. Generous on purpose.
          max_tokens: Number(process.env.WATSONX_MAX_TOKENS) || 8000,
          time_limit: 120000,
        },
      };
    },
    extract: (j) => j?.choices?.[0]?.message?.content,
  },
  custom: {
    defaultModel: 'local',
    envKeys: ['FUNKY_API_KEY'],
    request: (model, prompt, key) => {
      const url = process.env.FUNKY_API_URL;
      if (!url) { throw new Error('FUNKY_PROVIDER=custom requires FUNKY_API_URL'); }
      return {
        url,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key || 'none'}` },
        body: { model, messages: [{ role: 'user', content: prompt }] },
      };
    },
    extract: (j) => j?.choices?.[0]?.message?.content,
  },
};

const providerName = process.env.FUNKY_PROVIDER || 'anthropic';
const provider = PROVIDERS[providerName];
if (!provider) {
  console.error(`Unknown FUNKY_PROVIDER "${providerName}". Options: ${Object.keys(PROVIDERS).join(', ')}`);
  process.exit(1);
}
const apiKey = provider.envKeys.map((k) => process.env[k]).find(Boolean);
if (!apiKey && providerName !== 'custom') {
  console.error(
    `No API key. Set one of: ${provider.envKeys.join(', ')}\n` +
    `(Or use FUNKY_PROVIDER=custom with a local model and no key at all.)`,
  );
  process.exit(1);
}
const model = process.env.FUNKY_MODEL || provider.defaultModel;

// ── Registers ────────────────────────────────────────────────────────────────
// The pools are voices, not parts of speech. A generic "give me 50 adjectives"
// flattens exactly what makes the output good, so each pool carries its own
// brief. Edit these freely — they are the editorial position of the project.
const REGISTERS = {
  ninjactives: {
    role: 'Descriptors — they occupy the FIRST slot of a handle, so they modify what follows.',
    voice: `Adjectives with something at stake. The pool runs from ordinary English
descriptors, through martial arts and fighting traditions, through chess
vocabulary, and into music genres worn as attitude rather than category.
Plain but vivid beats obscure. A word that sounds like a stance.`,
  },
  verbtrics: {
    role: 'Descriptors and motion — also the FIRST slot, alternating with ninjactives.',
    voice: `Verbs, motion, and units of measurement — plus a strong seam of playful,
faintly British adjectives, mostly ending in -y, that sound invented for a
children's book. Think buzz, spinup, zepto, wobbly, spiffy, twonky, chortle.
Nonsense is welcome if it is PHONETICALLY confident.`,
  },
  kawaiiolors: {
    role: 'The MIDDLE slot — colour and texture between the descriptor and the noun.',
    voice: `Colour words, cute-adjacent Japanese loanwords, tactile textures — and,
unexpectedly, the contents of a forge or workshop: anvil, loom, vial, wheel.
That collision is deliberate. Soft and hard in the same pool.`,
  },
  memactions: {
    role: 'The MIDDLE slot, alternating with kawaiiolors.',
    voice: `Internet-native slang sitting directly beside 1950s retro-futurist
transport: skibidi and telepod, stonks and warpjet. Gaming vocabulary too.
This is the ONE pool where current slang belongs — everywhere else it dates
the corpus badly.`,
  },
  biome: {
    role: 'The FINAL slot — the noun a handle lands on. Highest-value pool to grow.',
    voice: `Living and growing things, with no dividing line between registers:
animals, then dinosaurs, then the entire vegetable aisle, then folklore
creatures. A quokka, a hadrosaurus, a parsnip and a pixie are all equally at
home. Concrete and picturable.`,
  },
  monsterials: {
    role: 'The FINAL slot, alternating with biome. Highest-value pool to grow.',
    voice: `Two seams. Elements, minerals and invented sci-fi alloys (yttrium,
xenite, voidal). And monster folklore from Europe, Japan and Mesoamerica,
mostly untranslated: nuckelavee, bakeneko, tzitzimitl, quetzalcoatl.
Non-European folklore is the thinnest part of the whole corpus.`,
  },
};

// ── Load the real pools ──────────────────────────────────────────────────────
const workDir = mkdtempSync(join(tmpdir(), 'funkynames-grow-'));
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

const { POOLS, POOL_NAMES } = api;
if (!POOL_NAMES.includes(poolName)) {
  console.error(`\nUnknown pool "${poolName}". Available:\n  ${POOL_NAMES.join('\n  ')}`);
  process.exit(1);
}

const pool = [...POOLS[poolName]];
const everyWord = new Set(POOL_NAMES.flatMap((n) => [...POOLS[n]]));
const register = REGISTERS[poolName];

// A stratified sample, not the first N: showing only the alphabetical head
// would teach the model that every word starts with 'a'.
function sample(list, n) {
  const step = Math.max(1, Math.floor(list.length / n));
  const out = [];
  for (let i = 0; i < list.length && out.length < n; i += step) { out.push(list[i]); }
  return out;
}

const lengthRule = minLength || maxLength
  ? `\nLENGTH: every word must be between ${minLength || 2} and ${maxLength || 20} characters. ` +
    `This is the point of the run — the corpus is 62% five- and six-letter words, ` +
    `so words outside this range are not useful here and will be discarded.`
  : '';

const prompt = `You are extending one word pool of a name generator called funkynames.

POOL: ${poolName}  (${pool.length} words today)
ROLE: ${register.role}

VOICE OF THIS POOL:
${register.voice}
${lengthRule}

A representative sample of what is already in it:
${sample(pool, 45).join(', ')}

Propose ${count} NEW words for this pool.

HARD RULES — a word breaking any of these is discarded automatically:
- lowercase a-z and digits only. No spaces, hyphens, apostrophes or accents.
  "quetzalcoatl" yes; "day-glo" and "café" no.
- A COMPLETE word. Never truncate to fit a length limit. If a word is too long,
  choose a different word. (The source corpus was once truncated at seven
  characters and it took a repair pass to undo; do not reintroduce that.)
- Not already in the corpus, and not a plural, tense or inflection of a word
  in it. If "dragon" is present, "dragons" and "dragoning" are not new words.
- Real, or deliberately invented and phonetically confident. Invented alloys
  and creature names are welcome; typos and mangled words are not.

EDITORIAL BAR — this is what actually matters:
- It has to sound good NEXT TO the sample words. Read it aloud in a name.
- Prefer the vivid over the merely valid. "inoffensive" is a failure.
- Avoid anything that dates fast unless this is the memactions pool.
- Avoid brand names, real people's names, and anything slurring or crude.

Return ONLY a JSON array, no prose, no markdown fence:
[{"word":"example","why":"six words on why it fits this pool"}]`;

// ── Call ─────────────────────────────────────────────────────────────────────
console.log(`\nGROW  ${poolName}  (${pool.length} words today)`);
console.log(`      provider=${providerName} model=${model}`);
if (minLength || maxLength) { console.log(`      length ${minLength || 2}-${maxLength || 20}`); }
console.log(`      asking for ${count}...\n`);

let url; let headers; let body;
try {
  // Config and auth faults surface here (a missing WATSONX_URL, a rejected IAM
  // exchange). They are the caller's to fix, so print the message rather than
  // a stack trace.
  ({ url, headers, body } = await provider.request(model, prompt, apiKey));
} catch (err) {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
if (!res.ok) {
  console.error(`API error ${res.status} ${res.statusText}\n${(await res.text()).slice(0, 600)}`);
  process.exit(1);
}
const text = provider.extract(await res.json());
if (!text) { console.error('Could not extract text — check the provider adapter.'); process.exit(1); }

const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
let proposals;
try {
  proposals = JSON.parse((fenced ? fenced[1] : text).trim());
} catch {
  console.error(`Response was not valid JSON:\n${text.slice(0, 600)}`);
  process.exit(1);
}
if (!Array.isArray(proposals)) { console.error('Expected a JSON array.'); process.exit(1); }

// ── Filter ───────────────────────────────────────────────────────────────────
// Harder than it looks necessary, because every one of these has actually
// happened to this corpus at least once.
const WORD = /^[a-z0-9]+$/;
const accepted = [];
const rejected = [];
const seenThisRun = new Set();

for (const p of proposals) {
  const word = String(p?.word ?? '').trim().toLowerCase();
  const why = String(p?.why ?? '').trim();
  const reject = (reason) => rejected.push({ word, reason });

  if (!word) { continue; }
  if (!WORD.test(word)) { reject('not /^[a-z0-9]+$/'); continue; }
  if (seenThisRun.has(word)) { reject('duplicate within this batch'); continue; }
  if (everyWord.has(word)) { reject('already in the corpus'); continue; }
  if (minLength && word.length < minLength) { reject(`shorter than ${minLength}`); continue; }
  if (maxLength && word.length > maxLength) { reject(`longer than ${maxLength}`); continue; }

  // Inflections of a word already present.
  const stems = [
    word.replace(/s$/, ''), word.replace(/es$/, ''), word.replace(/ing$/, ''),
    word.replace(/ed$/, ''), word.replace(/y$/, ''), word.replace(/er$/, ''),
  ].filter((s) => s !== word && s.length > 2);
  const stem = stems.find((s) => everyWord.has(s));
  if (stem) { reject(`inflection of '${stem}'`); continue; }

  // The truncation trap: a proposal that is a PREFIX of an existing word, or
  // that an existing word is a prefix of, is almost always a chopped variant.
  // Prefix-of-existing is a WARNING, not a rejection. Round one's four catches
  // were real truncations; round two's were kelp, basil, chalk, grit — words
  // the brief asked for. The distinction needs a dictionary or a reader, so
  // the proposal carries the flag and the human decides.
  const prefixOf = [...everyWord].find((w) => w !== word && w.startsWith(word) && word.length >= 4);

  seenThisRun.add(word);
  accepted.push({ word, why, ...(prefixOf ? { warn: `prefix of existing '${prefixOf}' — confirm it is a word, not a truncation` } : {}) });
}

// ── Write ────────────────────────────────────────────────────────────────────
const outDir = join(root, 'proposals');
mkdirSync(outDir, { recursive: true });
const tag = minLength || maxLength ? `-${minLength || 2}to${maxLength || 20}` : '';
const outFile = join(outDir, `${poolName}${tag}.json`);
writeFileSync(outFile, `${JSON.stringify({
  pool: poolName,
  generatedAt: new Date().toISOString(),
  provider: providerName,
  model,
  constraints: { count, minLength: minLength || null, maxLength: maxLength || null },
  accepted,
  rejected,
}, null, 2)}\n`);

for (const a of accepted) { console.log(`  + ${a.word.padEnd(20)} ${a.why}`); }
if (rejected.length) {
  console.log();
  for (const r of rejected) { console.log(`  - ${r.word.padEnd(20)} ${r.reason}`); }
}

console.log(`\n${accepted.length} accepted · ${rejected.length} rejected`);
console.log(`Written to  proposals/${poolName}${tag}.json\n`);
console.log(`NEXT: read it, delete what you disagree with, paste the words into`);
console.log(`      src/pools.ts under '${poolName}', then run:  npm test\n`);
console.log(`The harness checks shape, duplicates and entropy floors. It cannot`);
console.log(`tell you whether a word SOUNDS right — that part is yours.\n`);
