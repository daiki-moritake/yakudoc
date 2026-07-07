import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtractedComment } from "./extract";
import type { TranslationsFile } from "./types";

/** translations.json を読み込む。存在しなければ undefined */
export function readTranslations(filePath: string): TranslationsFile | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
  const parsed = JSON.parse(raw) as TranslationsFile;
  const result: TranslationsFile = {};
  for (const [key, entry] of Object.entries(parsed)) {
    if (entry && typeof entry.original === "string") {
      result[key] = {
        original: entry.original,
        translated: typeof entry.translated === "string" ? entry.translated : "",
        ...(entry.symbol !== undefined ? { symbol: entry.symbol } : {}),
      };
    }
  }
  return result;
}

export interface MergeStats {
  /** 訳文を保持できたエントリ数 */
  translated: number;
  /** 翻訳待ちのエントリ数 */
  untranslated: number;
  /** 今回の抽出に現れなかった既存エントリ数 */
  stale: number;
}

/**
 * 抽出結果を既存ファイルへマージする。
 *
 * - ハッシュが一致する既存エントリの訳文は保持する(差分翻訳)
 * - 新規の原文は translated: "" の「翻訳待ち」として追加する
 * - ソースから消えた原文は既定では残す(抽出漏れで訳を失わないため)。
 *   prune: true で削除する
 */
export function mergeTranslations(
  existing: TranslationsFile,
  extracted: ExtractedComment[],
  options: { prune: boolean }
): { merged: TranslationsFile; stats: MergeStats } {
  const merged: TranslationsFile = {};
  let translated = 0;
  for (const item of extracted) {
    const previous = existing[item.hash];
    const translation = previous?.translated ?? "";
    if (translation) {
      translated += 1;
    }
    merged[item.hash] = {
      original: item.original,
      translated: translation,
      symbol: item.symbol,
    };
  }

  let stale = 0;
  for (const [key, entry] of Object.entries(existing)) {
    if (merged[key]) {
      continue;
    }
    stale += 1;
    if (!options.prune) {
      merged[key] = entry;
    }
  }

  return {
    merged,
    stats: { translated, untranslated: extracted.length - translated, stale },
  };
}

/** symbol → original の順で整列して書き出す(diff を安定させるため) */
export function writeTranslations(
  filePath: string,
  data: TranslationsFile
): void {
  const sortedKeys = Object.keys(data).sort((a, b) => {
    const left = data[a];
    const right = data[b];
    return (
      (left.symbol ?? "").localeCompare(right.symbol ?? "") ||
      left.original.localeCompare(right.original)
    );
  });
  const sorted: TranslationsFile = {};
  for (const key of sortedKeys) {
    sorted[key] = data[key];
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + "\n");
}
