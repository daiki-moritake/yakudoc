import * as fs from "node:fs";
import * as path from "node:path";
import {
  placeholderToken,
  readTranslations,
  restoreText,
  writeTranslations,
  type EngineRunOptions,
} from "yakudoc-core";
import { resolveTranslationsPath, type RequestFile } from "./prep";

export interface ApplySummary {
  applied: number;
  skipped: string[];
}

/**
 * LLM から返ってきた翻訳結果 JSON({ hash: 訳文 })を translations.json に
 * 書き戻す。プレースホルダーを復元し、トークンが欠けた訳文は採用しない。
 */
export function applyResponse(
  options: EngineRunOptions & { applyPath: string }
): ApplySummary {
  const translationsPath = resolveTranslationsPath(options);
  const translations = readTranslations(translationsPath);
  if (!translations) {
    throw new Error(`${translationsPath} が見つかりません。`);
  }

  const requestPath = path.join(
    path.dirname(translationsPath),
    "ai",
    "request.json"
  );
  let request: RequestFile | undefined;
  try {
    request = JSON.parse(fs.readFileSync(requestPath, "utf8")) as RequestFile;
  } catch {
    request = undefined;
  }

  const responsePath = path.resolve(options.projectDir, options.applyPath);
  const response = parseResponse(responsePath);

  const summary: ApplySummary = { applied: 0, skipped: [] };
  for (const [hash, translatedRaw] of Object.entries(response)) {
    if (typeof translatedRaw !== "string" || translatedRaw.trim() === "") {
      summary.skipped.push(`${hash}: 訳文が空です`);
      continue;
    }
    const entry = translations[hash];
    if (!entry) {
      summary.skipped.push(`${hash}: translations.json に存在しないキーです`);
      continue;
    }
    const placeholders = request?.entries[hash]?.placeholders ?? [];
    const { text, missing } = restoreText(translatedRaw.trim(), placeholders);
    if (missing.length > 0) {
      summary.skipped.push(
        `${hash}: 保護トークン ${missing.map(placeholderToken).join(" ")} が訳文にありません`
      );
      continue;
    }
    entry.translated = text;
    summary.applied += 1;
  }

  writeTranslations(translationsPath, translations);
  return summary;
}

/**
 * 翻訳結果を読み込む。LLM の出力をそのまま保存したファイルでも動くよう、
 * ```json フェンスで囲まれている場合は中身を取り出す。
 */
function parseResponse(responsePath: string): Record<string, unknown> {
  let raw: string;
  try {
    raw = fs.readFileSync(responsePath, "utf8");
  } catch {
    throw new Error(`翻訳結果ファイルが見つかりません: ${responsePath}`);
  }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("object expected");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(
      `翻訳結果を JSON として解釈できませんでした: ${responsePath}` +
        `\n  { "<キー>": "<訳文>" } 形式のオブジェクトを保存してください。`
    );
  }
}
