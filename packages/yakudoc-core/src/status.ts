import { configPathFor, resolveTargetLang } from "./config";
import { DEFAULT_TARGET_LANG } from "./languages";
import {
  needsTranslation,
  readTranslations,
  resolveTranslationsPath,
} from "./translationsFile";
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
 * 訳文が空、または訳文の言語が targetLang と異なるエントリを
 * 「翻訳待ち」として集計・列挙する(言語を切り替えた場合、旧言語の訳は
 * 完了扱いにならない)。
 */
export function computeStatus(
  translations: TranslationsFile,
  targetLang: string = DEFAULT_TARGET_LANG
): StatusCounts {
  const pending: PendingEntry[] = [];
  let translated = 0;
  for (const entry of Object.values(translations)) {
    if (!needsTranslation(entry, targetLang)) {
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

/**
 * status の終了コードを決める(純粋関数)。
 * --fail-on-pending 指定時に翻訳待ちが残っていれば 1(CI の失敗ゲート用)。
 * それ以外は 0。
 */
export function statusExitCode(
  counts: Pick<StatusCounts, "untranslated">,
  options: { failOnPending: boolean }
): number {
  return options.failOnPending && counts.untranslated > 0 ? 1 : 0;
}

export interface StatusOptions {
  /** プロジェクトルート。出力パスの基準 */
  projectDir: string;
  /** translations.json のパス(既定: .yakudoc/translations.json) */
  outPath?: string;
}

export interface StatusSummary extends StatusCounts {
  outPath: string;
  /** 集計に使った翻訳先言語(config.json から解決) */
  targetLang: string;
}

/**
 * translations.json を読み込んで進捗を集計する。
 * 翻訳先言語は .yakudoc/config.json から解決する(無ければ既定の ja)。
 * ファイルが存在しなければ undefined(CLI 側で extract 誘導のメッセージを出す)。
 */
export function statusProject(options: StatusOptions): StatusSummary | undefined {
  const outPath = resolveTranslationsPath(options.projectDir, options.outPath);
  const translations = readTranslations(outPath);
  if (!translations) {
    return undefined;
  }
  const targetLang = resolveTargetLang(
    undefined,
    configPathFor(options.projectDir)
  );
  return { outPath, targetLang, ...computeStatus(translations, targetLang) };
}
