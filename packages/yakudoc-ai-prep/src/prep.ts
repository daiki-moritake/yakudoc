import * as fs from "node:fs";
import * as path from "node:path";
import { readTranslations, type EngineRunOptions } from "yakudoc-core";
import { protectText } from "./placeholders";

/** .yakudoc/ai/request.json の形式 */
export interface RequestFile {
  targetLanguage: "ja";
  entries: Record<
    string,
    {
      /** プレースホルダー保護済みの原文 */
      source: string;
      /** ⟦n⟧ トークン → 元の断片(apply 時の復元に使う) */
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
  return path.resolve(
    options.projectDir,
    options.translationsPath ?? path.join(".yakudoc", "translations.json")
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
  const translationsPath = resolveTranslationsPath(options);
  const translations = readTranslations(translationsPath);
  if (!translations) {
    throw new Error(
      `${translationsPath} が見つかりません。先に \`yakudoc extract\` を実行してください。`
    );
  }

  const yakudocDir = path.dirname(translationsPath);
  const glossaryPath = path.join(yakudocDir, "glossary.json");
  if (!fs.existsSync(glossaryPath)) {
    fs.writeFileSync(glossaryPath, "{}\n");
  }
  const glossary = JSON.parse(fs.readFileSync(glossaryPath, "utf8")) as Record<
    string,
    string
  >;

  const pending = Object.entries(translations).filter(
    ([, entry]) => !entry.translated
  );
  if (pending.length === 0) {
    return undefined;
  }

  const request: RequestFile = { targetLanguage: "ja", entries: {} };
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
  fs.writeFileSync(promptPath, buildPrompt(request, glossary));

  return { pending: pending.length, requestPath, promptPath, glossaryPath };
}

function buildPrompt(
  request: RequestFile,
  glossary: Record<string, string>
): string {
  const sources: Record<string, string> = {};
  for (const [hash, entry] of Object.entries(request.entries)) {
    sources[hash] = entry.source;
  }

  const glossaryEntries = Object.entries(glossary);
  const glossarySection =
    glossaryEntries.length > 0
      ? glossaryEntries.map(([en, ja]) => `- ${en} → ${ja}`).join("\n")
      : "(未設定。`.yakudoc/glossary.json` に \"英語\": \"日本語\" の形式で追加すると、ここに反映されます)";

  return `# yakudoc 翻訳依頼

以下の JSON は TypeScript/JavaScript の JSDoc コメント(英語)の一覧です。
各値を日本語に翻訳し、**同じキーを持つ JSON** を返してください。

## ルール

- 出力は \`{ "<キー>": "<訳文>", ... }\` 形式の JSON のみを、コードブロックで囲んで返す
- \`⟦0⟧\` \`⟦1⟧\` のようなトークンはコード・リンク・URL の保護用の印。**翻訳・削除せず**、訳文の対応する位置にそのまま残す
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
