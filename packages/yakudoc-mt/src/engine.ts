import {
  applyTranslation,
  collectPending,
  DEFAULT_TARGET_LANG,
  loadSourcesAt,
  placeholderToken,
  protectText,
  restoreText,
  writeSources,
} from "yakudoc";

/** 保護済みテキストの配列を受け取り、同じ順序で訳文を返す */
export type TranslateFn = (texts: string[]) => Promise<string[]>;

export interface MtSummary {
  /** 翻訳待ちだったエントリ数(原文ハッシュで重複排除済み) */
  pending: number;
  /** 訳文を書き込めたエントリ数 */
  applied: number;
  /** 採用しなかったエントリとその理由 */
  skipped: string[];
}

const DEFAULT_BATCH_SIZE = 4;

/**
 * 翻訳待ちエントリを translate 関数で翻訳して書き戻す。
 *
 * 対象は複数ファイル(translations.json と依存パッケージの翻訳パック)。
 * 同じ原文が複数ファイルにあっても翻訳は 1 回で済ませ、全ファイルへ書き戻す。
 *
 * - 原文はプレースホルダー保護してからモデルに渡す
 * - 保護トークンが訳文から消えたエントリは採用せず、翻訳待ちのまま残す
 * - 書き込んだ訳文には言語タグ(lang)を付与する。翻訳先言語と異なる
 *   言語タグを持つ既存の訳は「翻訳待ち」として翻訳し直す
 * - バッチごとに書き込むのではなく、全件処理後に一度だけ書き込む
 */
export async function translatePending(
  translationsPaths: string | string[],
  translate: TranslateFn,
  log: (message: string) => void = () => {},
  batchSize: number = DEFAULT_BATCH_SIZE,
  targetLang: string = DEFAULT_TARGET_LANG
): Promise<MtSummary> {
  const paths = Array.isArray(translationsPaths)
    ? translationsPaths
    : [translationsPaths];
  const sources = loadSourcesAt(paths);
  if (sources.length === 0) {
    throw new Error(
      `翻訳対象のファイルが見つかりません(${paths.join(", ")})。` +
        "先に `yakudoc extract` または `yakudoc add` を実行してください。"
    );
  }

  const pending = collectPending(sources, targetLang);
  const summary: MtSummary = { pending: pending.length, applied: 0, skipped: [] };
  if (pending.length === 0) {
    return summary;
  }

  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    const protectedTexts = batch.map((item) => protectText(item.original));
    const results = await translate(protectedTexts.map((p) => p.text));
    if (results.length !== batch.length) {
      throw new Error(
        `翻訳結果の件数が一致しません(期待 ${batch.length} / 実際 ${results.length})`
      );
    }

    batch.forEach((item, index) => {
      const raw = results[index]?.trim();
      if (!raw) {
        summary.skipped.push(`${item.hash}: モデルが空の訳文を返しました`);
        return;
      }
      const { text, missing } = restoreText(raw, protectedTexts[index].placeholders);
      if (missing.length > 0) {
        summary.skipped.push(
          `${item.hash}: 保護トークン ${missing.map(placeholderToken).join(" ")} が訳文から失われました`
        );
        return;
      }
      applyTranslation(sources, item.hash, text, targetLang);
      summary.applied += 1;
    });

    log(
      `翻訳中... ${Math.min(offset + batchSize, pending.length)}/${pending.length}`
    );
  }

  writeSources(sources);
  return summary;
}
