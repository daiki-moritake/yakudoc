import * as path from "node:path";
import { readTranslations } from "./translationsFile";
import type { TranslationsFile } from "./types";

/** 翻訳待ちの 1 エントリ。status の一覧表示に使う */
export interface PendingEntry {
  symbol: string;
  original: string;
}

export interface StatusCounts {
  total: number;
  translated: number;
  untranslated: number;
  /** 翻訳待ちエントリ(symbol → original 順)。translated が空のものだけ */
  pending: PendingEntry[];
}

/**
 * translations.json の内容から進捗を集計する(純粋関数・ファイル I/O なし)。
 *
 * extract と違いソースの再走査は行わないため stale は数えない。
 * translated が空文字列のエントリを「翻訳待ち」として集計・列挙する。
 */
export function computeStatus(translations: TranslationsFile): StatusCounts {
  const pending: PendingEntry[] = [];
  let translated = 0;
  for (const entry of Object.values(translations)) {
    if (entry.translated) {
      translated += 1;
    } else {
      pending.push({ symbol: entry.symbol ?? "", original: entry.original });
    }
  }
  pending.sort(
    (a, b) => a.symbol.localeCompare(b.symbol) || a.original.localeCompare(b.original)
  );
  const total = translated + pending.length;
  return { total, translated, untranslated: pending.length, pending };
}

export interface StatusOptions {
  /** プロジェクトルート。出力パスの基準 */
  projectDir: string;
  /** translations.json のパス(既定: .yakudoc/translations.json) */
  outPath?: string;
}

export interface StatusSummary extends StatusCounts {
  outPath: string;
}

/**
 * translations.json を読み込んで進捗を集計する。
 * ファイルが存在しなければ undefined(CLI 側で extract 誘導のメッセージを出す)。
 */
export function statusProject(options: StatusOptions): StatusSummary | undefined {
  const outPath = path.resolve(
    options.projectDir,
    options.outPath ?? path.join(".yakudoc", "translations.json")
  );
  const translations = readTranslations(outPath);
  if (!translations) {
    return undefined;
  }
  return { outPath, ...computeStatus(translations) };
}
