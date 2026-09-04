# funkynames

[![verify](https://github.com/frankie-muller/funkynames/actions/workflows/verify.yml/badge.svg)](https://github.com/frankie-muller/funkynames/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-C2185B.svg)](LICENSE)

**Like petnames, but funkier.** Readable handles and higher-entropy codes from six hand-curated pools — and, unusually, the arithmetic that says what they're worth.

Everyone else pairs a plain adjective with a plain animal, so you get `happy-otter` until the heat death of the universe. These pools pull from martial arts, chess, dinosaurs, internet slang, retro-futurist transport and monster folklore from four continents.

**▶ [Try it in your browser](https://frankie-muller.github.io/funkynames)** — roll names, toggle pools, and watch the entropy move.

```
janissary-cheems-zircon        generateHandle()   readable, 28.8 bits
graphene-brief-troll-shaolin   generateCode()     flat draws, 44.7 bits
```

Zero runtime dependencies. CSPRNG by default. Runs in Node, browsers and React Native.

---

## Why another name generator

Because most of them hand you a string and leave you to guess whether it's safe to use as one.

A three-word name *feels* about as unguessable as a password. It isn't, and the gap is where the bugs live — a share link that looked fine, a room code someone walked into, a reset token that was really a six-character password. This library generates names **and tells you what they're actually worth**, in the two different senses that matter.

```ts
import { codeEntropy, timeToGuess } from 'funkynames';

const e = codeEntropy(3);            // 33.5 bits — "roughly a 6-character password"
timeToGuess(e.keyspace, 50, 10_000); // → "6.9 hours"
```

Three words, 12.4 billion combinations, and a determined attacker gets one in an afternoon. That number is the reason this repo exists.

## Install

```bash
npm install github:frankie-muller/funkynames
```

Ships compiled ESM plus TypeScript declarations, and the source alongside. `prepare` builds on install, so a git install gets the same output a registry install would.

> **Not on npm yet.** The API may move before `1.0` — pin a commit if you depend on it.

## Use

### Handles — readable

```ts
import { generateHandle, generateHandles } from 'funkynames';

generateHandle();                               // 'flow-tempest-dingo'
generateHandle({ separator: '_' });             // 'berserker_plushy_rabbit'
generateHandle({ minLength: 3, maxLength: 5 }); // 'rough-lorry-beet'
generateHandles(5);                             // five distinct
```

Three structured slots — descriptor, colour or action, place or thing — each drawing from a pair of pools. The grammar is fixed, which is what makes it read like a name. **No word repeats within a handle.**

### Codes — harder to guess

```ts
import { generateCode } from 'funkynames';

generateCode();                    // 'squid-tart-cheems-sorcer'  (4 words)
generateCode({ words: 6 });        // for a reset token
generateCode({ words: 3 });        // opt in, and read the entropy section first
```

Flat draws from every pool merged. Any word, any position: more bits per word, less like a name. **Four words is the default**, deliberately — see below.

### Entropy — the point

```ts
import { codeEntropy, handleEntropy, timeToGuess, describeBits, wordsForBits } from 'funkynames';

codeEntropy(4);
// { keyspace: 28_622_168_300_961, bits: 44.70, birthday50: 6_299_054, readable: '28.6 trillion' }

describeBits(44.70);
// 'comparable to a 4-word Diceware passphrase — a reasonable rate-limited credential'

wordsForBits(60);
// { words: 6, achieved: { bits: 67.1, ... } }   ← state the security, get the shape
```

### Checking a name

```ts
import { parseName } from 'funkynames';

parseName('flow-tempest-dingo');
// { words: [{ word: 'flow', pools: ['verbtrics'] }, …], looksLikeHandle: true }

parseName('not-a-real-name');   // null
```

Useful as an input filter — reject typos before spending a database round trip. **Not an authorisation check:** the word lists are public, so anyone can assemble a valid-looking name. Parsing proves the shape, never the claim.

## Entropy, properly

Entropy is just *how many equally likely outcomes, expressed as bits*. Each bit doubles the space. The useful part is knowing which question you're asking, because there are two and they have very different answers.

### Question 1 — will two users get the same name?

The trap is the birthday paradox. A 28.8-bit handle space holds 470 million names, so it feels like you'd need hundreds of millions of users before a clash.

**You need about 25,500.** Collisions arrive at the *square root* of the keyspace, not the total.

That's fine — check uniqueness when you issue one and reroll on a clash. It just tells you when rerolls start happening often enough to notice, and that's the signal to add a slot.

### Question 2 — can someone guess a name they don't hold?

This is the one that matters when the string is a credential. And here's what most generators never mention:

> **The attacker doesn't want a *specific* name. They want *any live one*.**

So the odds per guess aren't `1 / keyspace`, they're `live_targets / keyspace`. A large keyspace gets **diluted by a large population**:

```ts
const e = codeEntropy(3);                  // 33.5 bits, 12.4 billion
timeToGuess(e.keyspace, 50, 1);            // one target      → '7.9 years'
timeToGuess(e.keyspace, 50, 10_000);       // ten thousand    → '6.9 hours'
```

Same keyspace, same attacker. Ten thousand outstanding invite links turned eight years into an afternoon.

Three levers, and the cheapest one is free:

| Lever | Effect | Cost |
|---|---|---|
| **Add a word** | +11 bits — 6.9 hours becomes **1.8 years** | one word |
| **Expire them** | linear — halve what's outstanding, double the time | some plumbing |
| **Rate limit** | linear — 50/sec down to 1/min makes it centuries | ~nothing |

**Rate limiting is not a layer on top of entropy. It is half of the calculation.** If you take one thing from this library, take that.

### Why four words is the default

| Words | Bits | Verdict |
|---|--:|---|
| 3 | 33.5 | roughly a 6-character random password |
| **4** | **44.7** | comparable to a 4-word Diceware passphrase |
| 6 | 67.1 | brute force impractical even unthrottled |

Three words is enough for a name nobody is hunting, and not enough for anything a stranger profits from guessing. The fourth word costs one word and buys eleven bits — the cheapest security here. So four is what you get, and three is what you opt into.

### Filtering costs you

Restricting word length narrows the pool, and the library reports the real number rather than the flattering one:

| Range | Bits at 4 words |
|---|--:|
| all | 44.7 |
| 3–5 chars | 41.3 |
| 6–8 chars | 39.6 |
| 7–8 chars | **32.1** |

Long words only looks tidy and costs you twelve bits, because only 259 of 2,313 words qualify.

## The words

**6 pools · 2,485 words · 2,313 distinct.** The pool names are portmanteaus, and they are load-bearing — each one describes a *register*, not a part of speech. That register is why the output doesn't sound like everything else.

Most generators pair a plain adjective with a plain animal, so you get `happy-otter` and `brave-badger` forever. These pools pull from martial arts, chess, dinosaurs, internet slang, retro-futurist transport, workshop tools, root vegetables, and monster folklore from four continents. What comes out is odd on purpose.

### 🥷 `ninjactives` — 754

*Ninja + adjectives.* Descriptors with something at stake. Starts in ordinary English and keeps going: plain adjectives, then martial arts, then chess vocabulary, then a long run of music genres used as attitude.

> `salty` · `eerie` · `sticky` · `aikido` · `samurai` · `janissary` · `fianchetto` · `citypop` · `taiko` · `drone` · `mashup`

### ⚡ `verbtrics` — 365

*Verbs + metrics.* Motion and measurement, colliding with a big seam of playful, faintly British adjectives that sound like they were invented for a children's book and mostly weren't.

> `buzz` · `snap` · `spinup` · `zepto` · `drift` · `fizzy` · `spiffy` · `plonky` · `twonky` · `wobbly` · `pesky` · `chortle` · `humbug`

### 🌸 `kawaiiolors` — 345

*Kawaii + colours.* Colour words, cute-adjacent Japanese, tactile textures — and then, unexpectedly, a workshop: the tools and vessels you'd find in a forge.

> `aqua` · `dijon` · `vermilion` · `neko` · `sakura` · `milky` · `gritty` · `anvil` · `forge` · `loom` · `vial` · `homunculus`

### 😤 `memactions` — 504

*Memes + actions.* Internet-native slang sitting directly beside 1950s retro-futurist transport, which turns out to be a very good combination.

> `susmax` · `okboom` · `stonks` · `yeet` · `drifter` · `telepod` · `warpjet` · `timecar` · `flycar` · `skybus` · `wormax`

### 🌍 `biome` — 276

*Living and growing things.* Animals, then dinosaurs, then the entire vegetable aisle, then folklore creatures — with no dividing line between them.

> `alpaca` · `krill` · `marten` · `triceratops` · `gorgosaurus` · `iguanodon` · `parsnip` · `radish` · `yam` · `pixie` · `nessie`

### 👹 `monsterials` — 241

*Monsters + materials.* Elements and invented alloys at one end, and at the other the deepest seam in the corpus: monster folklore from Europe, Japan and Mesoamerica, mostly untranslated.

> `vanadium` · `yttrium` · `lumen` · `novaic` · `xenite` · `griffin` · `djinn` · `tengu` · `kitsune` · `bakeneko` · `hobgoblin` · `nuckelavee` · `ahuizotl` · `quetzalcoatl` · `tzitzimitl`

### What that produces

```
digital-pickup-tengu          gritty-yeet-parsnip
hyperpop-anvil-triceratops    samurai-vermilion-nuckelavee
aikido-milky-quetzalcoatl     wobbly-forge-iguanodon
```

Curated for how they *sound together*, not for coverage. That's the whole editorial position: a name should be memorable enough that someone reads it aloud.

Pools are exported, so you can build your own shapes from them:

```ts
import { POOLS, entropyOfSlots } from 'funkynames';
entropyOfSlots([POOLS.kawaiiolors.length, POOLS.monsterials.length]);
```

## Randomness

Default source is `crypto.getRandomValues` — Node 18+, every current browser, Deno and Bun. On React Native, add `react-native-get-random-values`.

**Not `Math.random()`.** V8 implements it as xorshift128+, seeded once per process and never reseeded; observe enough consecutive outputs and the internal state, and every future output, can be recovered. Irrelevant when naming a test fixture, disqualifying when the string is worth something. A library can't know which case it's in, so the safe default is the only honest one.

Integers come from rejection sampling rather than `% max`, which is biased whenever `max` doesn't divide 2³² evenly.

For reproducible tests, inject a source explicitly:

```ts
generateCode({ random: seededRandom });  // deterministic, and obvious in a diff
```

## Verify

```bash
npm test
```

```
POOLS      6 pools · 2487 words · 2315 distinct
HANDLE      28.81 bits ·  470.2 million · collides at 25,530
CODE x3     33.53 bits ·   12.4 billion · collides at 131,145
CODE x4     44.71 bits ·   28.7 trillion · collides at 6,309,952
✅ ALL GREEN
```

The harness asserts word hygiene (no duplicates, no separators or capitals hiding in the data), entropy floors so a shrunk pool fails the build instead of quietly weakening the product, deterministic injected randomness, and a stuck-generator canary. CI additionally packs the tarball and imports it from a scratch project, which catches the packaging faults a test suite can't see.

## Known gaps

- **The corpus was repaired, not born clean.** The source lists had been truncated at roughly seven characters — a hard cliff in the length distribution, with longer words *chopped* rather than excluded. That left fragments like `hippogr`, `tricer` and `quetzco` sitting in the pools as if they were words. **138 were restored and 28 unrecoverable fragments dropped.** `scripts/repairs.json` records every decision, including the judgment calls: `iguan` became `iguanodon` rather than `iguana` because its neighbours are `trex` and `stego`, and `blackb` became `blackberry` rather than `blackbird` because its neighbours are `lychee` and `edamame`.

  Two survivors were found later, by reading the deployed demo's own output rather than by any test: `edmont` (the system dictionary has no dinosaur names, so the detector was blind to it) and `pachycephalosaur` — which was **my own repair, itself truncated**. `edmont` became `edmontosaurus`; `pachyr` was dropped instead, because its only honest expansion runs to eighteen characters, and a single word that long stretches the length filter for no benefit. There may be more; the detector can only catch fragments that are prefixes of words a 1934 dictionary happens to contain.

- **159 words appear in two or more pools.** Codes deduplicate them so every word is equally likely; handles keep them, but never repeat a word inside one name.

- **9 words are two characters** — `gm`, `im`, `fm`, `cm`, `fr`, `gg`, `pi`, `ox`, `ok`. Some are deliberate (chess titles, an ox), some are probably noise, and I've left them rather than guess which is which.

- **Opinionated and uneven.** Heavy on martial arts, chess, dinosaurs, mythology and internet slang; thin on almost everything else. It reflects one person's taste, which is exactly why the names have a voice — a balanced corpus would produce blander names.

- **The word lists are public**, so `parseName` proves shape and never identity. Anyone can assemble a valid-looking name from the README.

## License

[MIT](LICENSE) — code and word lists.

Built by [Frank Müller](https://www.singularcontinuum.com).
