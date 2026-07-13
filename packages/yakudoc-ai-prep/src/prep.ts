import * as fs from "node:fs";
import * as path from "node:path";
import {
  DEFAULT_TARGET_LANG,
  needsTranslation,
  protectText,
  readTranslations,
  resolveLanguage,
  resolveTranslationsPath as resolveDefaultTranslationsPath,
  type EngineRunOptions,
  type LanguageSpec,
} from "yakudoc";

/** .yakudoc/ai/request.json の形式 */
export interface RequestFile {
  /** 翻訳先の言語コード(例: "ja") */
  targetLanguage: string;
  entries: Record<
    string,
    {
      /** プレースホルダー保護済みの原文 */
      source: string;
      /** <phN> トークン → 元の断片(apply 時の復元に使う) */
      placeholders: string[];
      symbol?: string;
    }
  >;
}

export interface PrepareSummary {
  pending: number;
  requestPath: string;
  promptPath: string;
  glossaryPath: string;
}

export function resolveTranslationsPath(options: EngineRunOptions): string {
  return resolveDefaultTranslationsPath(
    options.projectDir,
    options.translationsPath
  );
}

/**
 * 言語ごとの用語集パス。既定言語(ja)は従来の glossary.json を使い続け、
 * それ以外は glossary.<code>.json に分ける(日本語向けに育てた用語集が
 * 他言語の依頼文へ混入しないようにするため)。
 */
function glossaryPathFor(yakudocDir: string, langCode: string): string {
  return path.join(
    yakudocDir,
    langCode === DEFAULT_TARGET_LANG
      ? "glossary.json"
      : `glossary.${langCode}.json`
  );
}

/**
 * 翻訳待ちエントリから LLM 向けの下準備ファイル一式を生成する。
 *
 * - .yakudoc/ai/request.json  保護済み原文とプレースホルダー対応表
 * - .yakudoc/ai/prompt.md     そのまま LLM に貼れる依頼文(用語集込み)
 * - .yakudoc/glossary.json    用語集(無ければ空で作成。ユーザーが育てる)
 */
export function prepare(options: EngineRunOptions): PrepareSummary | undefined {
  // 翻訳待ちが 0 件でも言語コードは必ず検証する(不正な指定を黙って通さない)
  const lang = resolveLanguage(options.targetLang ?? DEFAULT_TARGET_LANG);
  const translationsPath = resolveTranslationsPath(options);
  const translations = readTranslations(translationsPath);
  if (!translations) {
    throw new Error(
      `${translationsPath} が見つかりません。先に \`yakudoc extract\` を実行してください。`
    );
  }

  const yakudocDir = path.dirname(translationsPath);
  const glossaryPath = glossaryPathFor(yakudocDir, lang.code);
  if (!fs.existsSync(glossaryPath)) {
    fs.writeFileSync(glossaryPath, "{}\n");
  }
  const glossary = JSON.parse(fs.readFileSync(glossaryPath, "utf8")) as Record<
    string,
    string
  >;

  const pending = Object.entries(translations).filter(([, entry]) =>
    needsTranslation(entry, lang.code)
  );
  if (pending.length === 0) {
    return undefined;
  }

  const request: RequestFile = { targetLanguage: lang.code, entries: {} };
  for (const [hash, entry] of pending) {
    const protectedText = protectText(entry.original);
    request.entries[hash] = {
      source: protectedText.text,
      placeholders: protectedText.placeholders,
      ...(entry.symbol !== undefined ? { symbol: entry.symbol } : {}),
    };
  }

  const aiDir = path.join(yakudocDir, "ai");
  fs.mkdirSync(aiDir, { recursive: true });
  const requestPath = path.join(aiDir, "request.json");
  const promptPath = path.join(aiDir, "prompt.md");
  fs.writeFileSync(requestPath, JSON.stringify(request, null, 2) + "\n");
  fs.writeFileSync(promptPath, buildPrompt(request, glossary, lang));

  return { pending: pending.length, requestPath, promptPath, glossaryPath };
}

/**
 * LLM への依頼文を組み立てる。翻訳先が日本語なら日本語の依頼文、
 * それ以外は英語の依頼文にする(利用者の言語が分からないため)。
 */
function buildPrompt(
  request: RequestFile,
  glossary: Record<string, string>,
  lang: LanguageSpec
): string {
  const sources: Record<string, string> = {};
  for (const [hash, entry] of Object.entries(request.entries)) {
    sources[hash] = entry.source;
  }

  const glossaryEntries = Object.entries(glossary);
  const glossaryList = glossaryEntries
    .map(([source, target]) => `- ${source} → ${target}`)
    .join("\n");

  if (lang.code !== "ja") {
    return buildEnglishPrompt(sources, glossaryList, lang);
  }

  const glossarySection =
    glossaryList ||
    "(未設定。`.yakudoc/glossary.json` に \"英語\": \"日本語\" の形式で追加すると、ここに反映されます)";

  return `# yakudoc 翻訳依頼

以下の JSON は TypeScript/JavaScript の JSDoc コメント(英語)の一覧です。
各値を日本語に翻訳し、**同じキーを持つ JSON** を返してください。

## ルール

- 出力は \`{ "<キー>": "<訳文>", ... }\` 形式の JSON のみを、コードブロックで囲んで返す
- \`<ph0>\` \`<ph1>\` のようなトークンはコード・リンク・URL の保護用の印。**翻訳・削除せず**、訳文の対応する位置にそのまま残す
- 文体は「です・ます調」で簡潔に。JSDoc の一行説明として自然な日本語にする
- 技術用語は用語集に従う。用語集に無い一般的な技術用語(callback、Promise など)は無理に訳さずカタカナまたは原語のままでよい

## 用語集

${glossarySection}

## 原文

\`\`\`json
${JSON.stringify(sources, null, 2)}
\`\`\`

## 翻訳結果の反映

返ってきた JSON を \`.yakudoc/ai/response.json\` に保存し、次のコマンドで書き戻します:

\`\`\`bash
npx yakudoc translate --engine prep --apply .yakudoc/ai/response.json
\`\`\`
`;
}

function buildEnglishPrompt(
  sources: Record<string, string>,
  glossaryList: string,
  lang: LanguageSpec
): string {
  const glossaryFile = `.yakudoc/glossary.${lang.code}.json`;
  const glossarySection =
    glossaryList ||
    `(empty — add \`"source term": "translation"\` pairs to \`${glossaryFile}\` and they will be listed here)`;

  return `# yakudoc translation request

The JSON below lists JSDoc comments (English) extracted from a TypeScript/JavaScript project.
Translate each value into **${lang.name}** and return a JSON object with **the same keys**.

## Rules

- Return only a JSON object of the form \`{ "<key>": "<translation>", ... }\`, wrapped in a code block
- Tokens such as \`<ph0>\` \`<ph1>\` protect code, links, and URLs. Do **not** translate or remove them; keep each one at the corresponding position in the translation
- Keep each translation concise and natural as a one-line JSDoc description
- Follow the glossary for technical terms. Common technical terms not in the glossary (callback, Promise, …) may stay untranslated

## Glossary

${glossarySection}

## Source texts

\`\`\`json
${JSON.stringify(sources, null, 2)}
\`\`\`

## Applying the result

Save the returned JSON as \`.yakudoc/ai/response.json\`, then write it back with:

\`\`\`bash
npx yakudoc translate --engine prep --apply .yakudoc/ai/response.json
\`\`\`
`;
}
