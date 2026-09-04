# Contributing

## Right now: issues yes, code PRs no

Early release, API still moving. **Pull requests aren't being accepted yet** — please don't spend an evening on one; it'll sit unmerged, and that's a waste of your time rather than a judgment on your patch.

Issues are wanted.

## Most useful things to file

**A word that shouldn't be there.** The corpus was repaired, not born clean — the source lists had been truncated at around seven characters, and while 136 fragments were restored, there are almost certainly survivors I missed. If a generated name contains something that looks chopped (`hippogr`, `tricer`) or just wrong, that's a real find. Paste the name.

**A word that should be there.** The pools are opinionated and lean heavily on martial arts, chess, dinosaurs, mythology and internet slang. Gaps are real — especially outside English and Japanese. See the house rules below before proposing.

**Entropy maths that's wrong.** If `entropyOfSlots`, `entropyOfDraws`, `timeToGuess` or `birthday50` gives a number you can show is incorrect, that's the highest-severity bug this repo can have. The whole premise is that these numbers are trustworthy; a wrong one is worse than no number at all. Show your working and I'll fix it fast.

**Advice that's misleading.** `describeBits` maps bit counts to plain-English verdicts, and those verdicts are judgment calls. If one would lead someone to ship something unsafe, say so — with the scenario.

**A platform where the CSPRNG doesn't resolve.** `crypto.getRandomValues` should exist in Node 18+, browsers, Deno, Bun and React Native with a polyfill. If it throws somewhere it shouldn't, tell me the runtime and version.

## Before you file

```bash
npm install
npm test        # typecheck + word hygiene + entropy floors
```

If it's about a specific name, include the exact string and the options you passed.

## House rules for word entries

- **Lowercase, letters and digits only.** No spaces, no hyphens, no accents. A word containing the separator makes names ambiguous to split — the harness rejects this outright.
- **Two to eighteen characters.** Most words are 4–7; the long tail is dinosaurs and mythology (`pachycephalosaurus`, `quetzalcoatl`). Callers who need short names filter with `minLength`/`maxLength`.
- **It has to sound good next to the others.** This is the actual bar. `quetzalcoatl` and `stonks` both earn their place; a technically valid word that's merely inoffensive doesn't.
- **Right pool.** `ninjactives` describe, `verbtrics` move, `kawaiiolors` colour, `memactions` act, `biome` is places and living things, `monsterials` is monsters and materials.
- **No duplicates within a pool.** Across pools is fine — 159 words already do it, and both generators handle it deliberately.
- **Real or deliberately invented, not truncated.** `xenite` and `voidal` are invented materials and welcome. `hippogr` is a chopped word and isn't.

## The harness is the contract

`npm test` asserts word hygiene, entropy floors, deterministic injected randomness and a stuck-RNG canary. It runs in CI on every push.

The entropy floors matter most: they mean shrinking a pool — including by "tidying" it — fails the build rather than quietly weakening every name the library issues. If your change moves the numbers, that's fine, but it has to be a decision someone made rather than one that happened.

## Code of conduct

Be decent. Arguing about whether `skibidi` belongs in a word list is the entire spirit of this project; arguing unpleasantly isn't.
