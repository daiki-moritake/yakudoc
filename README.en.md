# yakudoc

[![CI](https://github.com/daiki-moritake/yakudoc/actions/workflows/ci.yml/badge.svg)](https://github.com/daiki-moritake/yakudoc/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[日本語](./README.md) | English

A toolset that translates JSDoc comments into Japanese and injects the translations into VSCode's language features (hover, completion, signature help).

It never rewrites your code. The original JSDoc stays untouched — a `tsserver` plugin swaps **only what the editor displays** with the Japanese translation.

## Motivation

English JSDoc is precise, but reading it costs a mental translation every time. On the other hand, rewriting comments in the source to Japanese is often off the table — the code belongs to a library, or to a team that works in English. yakudoc is built for exactly that situation:

- The original text stays as-is (no noise in your Git diffs)
- Translations only affect what the editor displays
- The translation engine is pluggable (a built-in lightweight model, or prep files for any AI of your choice)

## How it works

VSCode's JS/TS language features (hover, completion details, signature help) are all produced by `tsserver`. yakudoc registers itself as a **Language Service Plugin** on `tsserver` and rewrites the `documentation` / `tags` returned by `getQuickInfoAtPosition`, `getCompletionEntryDetails`, and friends with the translated text.

```
[your code]
      │
      ▼
 tsserver (TypeScript itself)
      │
      ▼
 yakudoc-ts-plugin  ← swaps documentation with translations here
      │
      ▼
 VSCode hover / completion / signature help
```

Because it rewrites the output of TypeScript itself rather than adding a separate extension, translations never show up twice next to the original hover content.

## Packages

This is a monorepo consisting of the following packages.

| Package | Role |
|---|---|
| `yakudoc-core` | Extracts JSDoc from the AST and manages the translation file |
| `yakudoc-ts-plugin` | The `tsserver` plugin that swaps the displayed documentation |
| `yakudoc-vscode` | VSCode extension: auto-registers the plugin in `tsconfig.json`, toggle UI, etc. |
| `yakudoc-mt` (optional) | Bundles an open-weight translation model for fully offline translation |
| `yakudoc-ai-prep` (optional) | Generates prep files so you can have any AI (e.g. Claude) do the translation |

You only need one of `yakudoc-mt` / `yakudoc-ai-prep` — there is no need to install both.

## Setup

### 1. Install

```bash
npm install --save-dev yakudoc-core yakudoc-ts-plugin
```

### 2. Run init

```bash
npx yakudoc init
```

This registers `yakudoc-ts-plugin` in your tsconfig.json (preserving comments) and runs the initial extraction in one go. It is safe to re-run: registration is skipped when already present, and existing translations are kept.

If you prefer to configure things manually, add the following to tsconfig.json:

```jsonc
{
  "compilerOptions": {
    "plugins": [{ "name": "yakudoc-ts-plugin" }]
  }
}
```

After registration, run "TypeScript: Restart TS Server" from the VSCode command palette to pick it up.

### 3. Install the VSCode extension (optional, recommended)

Search for "yakudoc" in the Marketplace. The extension automates tsconfig.json registration and provides a status-bar toggle.

From the command palette (`Cmd/Ctrl+Shift+P`) you can run the following without opening a terminal:

| Command | Action |
|---|---|
| `yakudoc: 翻訳対象を抽出 (extract)` | Runs `npx yakudoc extract` in the integrated terminal |
| `yakudoc: 翻訳の進捗を表示 (status)` | Runs `npx yakudoc status` in the integrated terminal |
| `yakudoc: 翻訳表示を切り替え (JP/EN)` | Toggles between original and translated display |
| `yakudoc: tsconfig.json にプラグインを登録` | Adds the plugin to an unregistered `tsconfig.json` |

## Usage

### Extract translatable text

```bash
npx yakudoc extract
```

Scans the JSDoc comments in your project and writes the pending source texts to `.yakudoc/translations.json`.

```json
{
  "a1b2c3d4": {
    "original": "Fetches user data from the API.",
    "translated": "",
    "symbol": "src/api/user.ts#fetchUser"
  }
}
```

Code samples in `@example` and reference tags such as `@see` are excluded from extraction entirely. Inline `` `code` ``, `{@link ...}`, `{type}` annotations, and URLs inside descriptions are protected by escaping them to tokens like `<ph0>` so translation cannot break them; they are restored when written back.

### Check progress

```bash
npx yakudoc status
```

Shows the number and ratio of translated / pending entries without modifying `translations.json`. Pending entries are listed with their symbol and original text, so you can see at a glance what to translate next.

```text
Translation file: /path/to/project/.yakudoc/translations.json
Progress: 12 / 20 translated (60%) / 8 pending

Pending:
  src/api/user.ts#fetchUser  Fetches user data from the API.
  …
```

For scripts and CI, `--json` switches to machine-readable output and `--fail-on-pending` exits with code 1 when untranslated entries remain.

```bash
npx yakudoc status --json                 # prints { total, translated, untranslated, pending }
npx yakudoc status --fail-on-pending       # exit 1 if anything is untranslated (catch gaps in CI)
```

### Translate

**Option A: use the built-in model**

```bash
npm install --save-dev yakudoc-mt
npx yakudoc translate --engine local
```

Offline, no API key required — translations are written straight into `translations.json`. It uses an open-weight translation model, so it favors convenience over polish. The model is downloaded on first run.

The model can be chosen to match your machine. The default is `auto`, which picks a size based on installed memory.

```bash
npx yakudoc translate --engine local --model-size small   # NLLB-200 distilled 600M (light & fast)
npx yakudoc translate --engine local --model-size large   # mBART-50 (better quality, needs memory)
npx yakudoc translate --engine local --model <HF model id>  # pin an explicit model
```

| Size | Model | Notes |
|---|---|---|
| `small` | NLLB-200 distilled 600M | Light and fast. Download is a few hundred MB |
| `large` | mBART-50 | More natural output. 1GB+ download, needs memory and time |
| `auto` (default) | `large` with 16GB+ RAM, otherwise `small` | — |

The environment variables `YAKUDOC_MT_MODEL_SIZE` (`small`/`large`/`auto`) and `YAKUDOC_MT_MODEL` (explicit model id) work as well.

**Option B: let any AI translate**

First generate the prep files:

```bash
npm install --save-dev yakudoc-ai-prep
npx yakudoc translate --engine prep
```

Three files are produced under `.yakudoc/ai/`:

- `prompt.md` — a ready-to-paste request for an LLM: translation rules, glossary, and the protected source texts
- `request.json` — a machine-readable list of source texts with the placeholder mapping
- `glossary.json` (directly under `.yakudoc/`) — the glossary. Grow it as `{ "english": "japanese" }` pairs and it is reflected into `prompt.md`

Hand `prompt.md` to an LLM such as Claude, save the returned JSON as `.yakudoc/ai/response.json`, and write it back with:

```bash
npx yakudoc translate --engine prep --apply .yakudoc/ai/response.json
```

Protected tokens (`<ph0>` etc.) are restored on write-back. A translation missing any token is rejected and stays pending, so code and links in the original can never be corrupted.

### See it in the editor

Once `translations.json` is saved, the `tsserver` plugin detects the file change automatically and updates the display. No editor restart required.

## Incremental translation

Translations are keyed by a hash of the original comment. When you edit code and a JSDoc comment changes, only that entry falls back to "pending" — unrelated changes never invalidate the rest of your translations.

Re-running `npx yakudoc extract` keeps existing translations. Entries whose original text no longer exists in the source are kept by default (so a missed extraction can't lose translations); pass `--prune` to delete them.

## Scope and limitations

- Only TypeScript / JavaScript are supported at the moment (yakudoc relies on the `tsserver` plugin mechanism)
- Python docstrings and closed-source language servers such as Pylance are not supported
- Translation quality depends on the engine you choose (built-in model or an external AI)

## Contributing

Bug reports, feature proposals, and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and how to run the tests.

## License

[MIT](./LICENSE)
