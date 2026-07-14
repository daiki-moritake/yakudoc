# yakudoc

[![CI](https://github.com/daiki-moritake/yakudoc/actions/workflows/ci.yml/badge.svg)](https://github.com/daiki-moritake/yakudoc/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[日本語](./README.md) | English

**Read your dependencies' docs in your language.**

lodash, zod, `@types/node` — the English JSDoc that shows up in your editor's hover can be displayed in Japanese (or 21 other languages) without changing a single line of code.

```bash
npx yakudoc add zod
```

That's it — hovering over zod's API now shows the docs in your language. If a community translation pack has been published for the library, **the translations are applied automatically** (zero translation work). If not, translate with the built-in model or any AI, then share the result with `yakudoc export` for the next person.

Your own project's JSDoc can be translated with the same mechanism.

## Motivation

The English documentation you read the most every day is not a README or an official site — it is **the JSDoc of your dependencies, shown in the editor hover**. It is precise, but it costs a mental translation every time. And rewriting the comments is off the table: the code belongs to a library, or to a team that works in English.

yakudoc only touches what is displayed.

- The original text stays as-is (neither `node_modules` nor your code is rewritten; no noise in Git diffs)
- Translations are injected only into what the editor displays
- Translations of a library are shared across all of its users — **once someone translates it, everyone benefits with a single `add`**

## How it works

VSCode's JS/TS language features (hover, completion details, signature help) are all produced by `tsserver`. yakudoc registers itself as a **Language Service Plugin** on `tsserver` and rewrites the `documentation` / `tags` returned by `getQuickInfoAtPosition` and friends with the translated text.

```text
[your code]   [node_modules/zod/**.d.ts]
      │              │
      ▼              ▼
 tsserver (TypeScript itself)
      │
      ▼
 yakudoc-ts-plugin  ← swaps documentation with translations
      │                ↑ matched by source-text hash
      │        .yakudoc/translations.json  (your own code)
      │        .yakudoc/packs/*.json       (dependency translation packs)
      ▼
 VSCode hover / completion / signature help
```

Matching is done by **hashing the original text**, so it does not matter which file a comment lives in. That is why it works on dependency docs out of the box, and why translations survive library upgrades as long as the original text has not changed.

## Packages

This is a monorepo consisting of the following packages.

| Package | Role |
| --- | --- |
| `yakudoc` | The CLI (`add` / `init` / `extract` / `status` / `translate` / `export` / `doctor`). Manages translation packs and the translation file |
| `yakudoc-ts-plugin` | The `tsserver` plugin that swaps the displayed documentation |
| `yakudoc-vscode` | VSCode extension: auto-registers the plugin in `tsconfig.json`, toggle UI, etc. |
| `yakudoc-mt` (optional) | Bundles an open-weight translation model for fully offline translation |
| `yakudoc-ai-prep` (optional) | Generates prep files so you can have any AI (e.g. Claude) do the translation |

You only need one of `yakudoc-mt` / `yakudoc-ai-prep` (and neither, if you only use community translation packs).

## Setup

### 1. Install and run init

```bash
npm install --save-dev yakudoc yakudoc-ts-plugin
npx yakudoc init
```

`init` registers `yakudoc-ts-plugin` in your tsconfig.json (preserving comments) and runs the first extraction of your own code. It is safe to re-run.

In VSCode, run "TypeScript: Restart TS Server" from the command palette afterwards.

### 2. Add translations for your dependencies

```bash
npx yakudoc add zod lodash
```

For each package this will:

1. Extract JSDoc from the type definitions (`.d.ts`) in `node_modules`
2. Apply translations from the community pack, if one has been published
3. Write the pack to `.yakudoc/packs/<package>.json`

```text
zod@3.23.8: 431 entries from 12 declaration files
  Community pack: applied 418 translations
  Progress: 418 / 431 translated (97%) / 13 pending
  Written to: .yakudoc/packs/zod.json
```

Commit `.yakudoc/` to Git and your whole team shares the same translations.

### 3. Install the VSCode extension (optional, recommended)

Search for "yakudoc" in the Marketplace. It automates tsconfig registration and provides a status-bar toggle, plus command-palette commands for init / extract / status.

## Usage

### Checking progress

```bash
npx yakudoc status
```

Aggregates translations.json and all packs, with a per-source breakdown. Use `--json` for machine-readable output and `--fail-on-pending` to exit with code 1 when anything is untranslated (for CI).

### Translating

Entries that the community pack did not cover — and your own code — are translated with an engine. All files (translations.json + packs) are processed together, each unique source text is translated once, and `--pkg <name>` narrows the target to one pack.

There are two engines. If exactly one is installed, `--engine` can be omitted.

#### Option A: built-in model

```bash
npm install --save-dev yakudoc-mt
npx yakudoc translate --engine local
```

Offline, no API key. Uses an open-weight MT model — convenient rather than perfect. The first run downloads the model (progress shown in 10% steps).

```bash
npx yakudoc translate --engine local --model-size small   # NLLB-200 distilled 600M (fast, light)
npx yakudoc translate --engine local --model-size large   # mBART-50 (better quality, needs RAM)
npx yakudoc translate --engine local --model <HF model id>
```

| Size | Model | Notes |
| --- | --- | --- |
| `small` | NLLB-200 distilled 600M | Light and fast; a few hundred MB download |
| `large` | mBART-50 | More natural output; 1GB+ download, more RAM/time |
| `auto` (default) | `large` with 16GB+ RAM, otherwise `small` | — |

Environment variables `YAKUDOC_MT_MODEL_SIZE` (`small`/`large`/`auto`) and `YAKUDOC_MT_MODEL` are also honored.

#### Option B: any AI of your choice

```bash
npm install --save-dev yakudoc-ai-prep
npx yakudoc translate --engine prep
```

This writes three files under `.yakudoc/`:

- `ai/prompt.md` — a ready-to-paste request for an LLM, including rules, the glossary, and the protected source texts
- `ai/request.json` — machine-readable source list and placeholder table
- `glossary.json` — the glossary; grow it as `{ "source term": "translation" }`

Hand `prompt.md` to Claude (or any LLM), save the returned JSON as `.yakudoc/ai/response.json`, and write it back:

```bash
npx yakudoc translate --engine prep --apply .yakudoc/ai/response.json
```

Placeholder tokens (`<ph0>` …) are restored on write-back; translations that lost a token are rejected and stay pending, so inline code and links never break.

### Reflecting changes

Saving translations.json or a pack is enough — the `tsserver` plugin watches for file changes (including packs being added or removed) and updates the display without restarting the editor.

### Translating your own code

```bash
npx yakudoc extract
```

Scans the JSDoc comments of your project and writes pending entries to `.yakudoc/translations.json`. Code samples in `@example`, reference tags like `@see`, inline `` `code` ``, `{@link ...}`, `{types}` and URLs are protected or excluded so translations cannot break them.

### When something is off

```bash
npx yakudoc doctor
```

Checks plugin registration, plugin installation, translation files, translation packs, target language, and engines — and prints the fix for anything wrong (exit code 1 if problems remain).

If everything is ✔ but the hover has not changed, run "TypeScript: Restart TS Server".

## Sharing translation packs

This is the most important property of yakudoc: **a dependency's translations are a shared asset, not something personal.**

When you finish translating a pack, one command produces a shareable file:

```bash
npx yakudoc export zod
```

Open a pull request adding the generated `zod.json` to the [yakudoc-packs](https://github.com/daiki-moritake/yakudoc-packs) repository as `packs/en/…` (per language), and from then on every `npx yakudoc add zod` in the world gets those translations automatically.

- Entries are keyed by source-text hash, so packs are **robust to version differences** (unchanged API docs keep their translations)
- `add` never overwrites translations you made locally (community packs only fill pending entries)
- The intended workflow is Wikipedia-style: machine-translated packs polished by humans through PRs

The registry is replaceable (private/company registries work): priority is `--registry` > `YAKUDOC_REGISTRY` env var > `registry` in `.yakudoc/config.json` > default. Use `add --no-fetch` for offline runs.

## Changing the target language

The default target is Japanese, but any supported language can be used.

```bash
npx yakudoc init --lang ko                       # set Korean as the target
npx yakudoc translate --engine local --lang de   # German for this run only
```

`--lang` at `init` is saved to `.yakudoc/config.json` and used by subsequent `add` / `translate`. Community packs are organized per language (`packs/<code>/`).

Supported: `ja` `en` `ko` `zh` `de` `fr` `es` `pt` `it` `nl` `sv` `fi` `pl` `cs` `uk` `ru` `tr` `ar` `hi` `id` `vi` `th` (languages supported by both NLLB-200 and mBART-50). `en` is a target for reading packages whose source docs are not in English (such as yakudoc itself) in English.

Translations record the language they were made in; switching the target later automatically returns entries translated in the previous language to "pending". Glossaries are per-language: `glossary.json` for Japanese, `glossary.<code>.json` otherwise.

## Incremental translation

Translation keys are hashes of the source text.

- **Your code**: editing a JSDoc comment invalidates only that entry. Re-running `extract` preserves existing translations
- **Dependencies**: after upgrading a library, re-run `yakudoc add <package>`. Only APIs whose docs actually changed become pending; everything else carries over

Entries whose source text no longer exists are kept by default; pass `--prune` to delete them.

## Scope and limitations

- TypeScript / JavaScript only for now (it relies on the `tsserver` plugin mechanism)
- For dependencies, the extraction source is JSDoc in type definitions (`.d.ts` / `.d.mts` / `.d.cts`). Packages without type definitions are not supported (point at `@types/*` instead)
- Python docstrings and closed-source language servers such as Pylance are not supported
- Translation quality depends on the engine (built-in model or external AI) and on the community packs

## Contributing

Bug reports, feature proposals, and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev setup and how to run tests.

Translation packs go to [yakudoc-packs](https://github.com/daiki-moritake/yakudoc-packs).

## License

[MIT](./LICENSE)
