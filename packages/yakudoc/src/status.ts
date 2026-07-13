import { configPathFor, resolveTargetLang } from "./config";
import { DEFAULT_TARGET_LANG } from "./languages";
import { needsTranslation, resolveTranslationsPath } from "./translationsFile";
import { collectPending, loadProjectSources } from "./translationSet";
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

/** 翻訳パック 1 つ分の進捗 */
export interface PackStatus {
  name: string;
  version: string;
  filePath: string;
  total: number;
  translated: number;
  untranslated: number;
}

/**
 * プロジェクト全体の進捗。total / translated / untranslated / pending は
 * translations.json と全パックを合算した値(pending は原文ハッシュで
 * 重複排除済み)。project / packs に内訳を持つ。
 */
export interface StatusSummary extends StatusCounts {
  outPath: string;
  /** 集計に使った翻訳先言語(config.json から解決) */
  targetLang: string;
  /** translations.json の内訳(ファイルが無ければ undefined) */
  project?: StatusCounts;
  /** 依存パッケージの翻訳パックの内訳(name 順) */
  packs: PackStatus[];
}

/**
 * translations.json と .yakudoc/packs/ 以下の翻訳パックを読み込んで
 * 進捗を集計する。翻訳先言語は .yakudoc/config.json から解決する。
 * どのファイルも存在しなければ undefined(CLI 側で導入手順を案内する)。
 */
export function statusProject(options: StatusOptions): StatusSummary | undefined {
  const outPath = resolveTranslationsPath(options.projectDir, options.outPath);
  const sources = loadProjectSources(options.projectDir, {
    translationsPath: options.outPath,
  });
  if (sources.length === 0) {
    return undefined;
  }
  const targetLang = resolveTargetLang(
    undefined,
    configPathFor(options.projectDir)
  );

  let project: StatusCounts | undefined;
  const packs: PackStatus[] = [];
  for (const source of sources) {
    const counts = computeStatus(source.entries, targetLang);
    if (source.kind === "project") {
      project = counts;
    } else {
      packs.push({
        name: source.pack?.name ?? source.label,
        version: source.pack?.version ?? "",
        filePath: source.filePath,
        total: counts.total,
        translated: counts.translated,
        untranslated: counts.untranslated,
      });
    }
  }

  // 全体の pending は原文ハッシュで重複排除する(同じ原文が複数ファイルに
  // 現れても翻訳作業は 1 回で済むため、件数もそれに合わせる)
  const pendingItems = collectPending(sources, targetLang);
  const pending: PendingEntry[] = pendingItems.map((item) => ({
    symbol: item.symbol ?? "",
    original: item.original,
  }));
  pending.sort(
    (a, b) => a.symbol.localeCompare(b.symbol) || a.original.localeCompare(b.original)
  );

  // 「翻訳済み」= 重複排除した全エントリ − 翻訳待ち。あるファイルでは訳済みで
  // 別ファイルでは未訳のハッシュは「翻訳待ち」側に数える(collectPending が
  // いずれかのファイルで未訳ならそのハッシュを翻訳待ちに含めるため)
  const totals = new Set<string>();
  for (const source of sources) {
    for (const hash of Object.keys(source.entries)) {
      totals.add(hash);
    }
  }
  const total = totals.size;
  const untranslated = pending.length;

  return {
    outPath,
    targetLang,
    project,
    packs,
    total,
    translated: total - untranslated,
    untranslated,
    pending,
  };
}
