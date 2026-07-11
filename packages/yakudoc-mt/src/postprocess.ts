// 日本語文字(ひらがな・カタカナ・長音符・CJK 統合漢字・々)
const JA = "\\u3040-\\u30ff\\u4e00-\\u9fff\\u3005";
const JA_BEFORE_COMMA = new RegExp(`([${JA}])\\s*,`, "gu");
const JA_BEFORE_PERIOD = new RegExp(`([${JA}])\\s*\\.`, "gu");
const SPACE_AFTER_JA_PUNCT = /([、。])[ \t]+/gu;

/**
 * 機械翻訳(NLLB)の日本語出力を読みやすく整える後処理。
 *
 * NLLB は日本語文でも ASCII の "," "." を出すことがある。日本語文字に
 * 隣接する ASCII 句読点だけを全角(、。)へ変換し、句読点直後の余分な
 * 空白を詰める。小数点(1.5)や英字・保護トークン直後の "." は
 * 「直前が日本語文字」の条件で除外され、変換されない。
 *
 * 保護トークン(<ph0> など)を復元する前に適用する前提。コード片や
 * URL の中身には触れない。
 */
export function normalizeJapaneseOutput(text: string): string {
  return text
    .replace(JA_BEFORE_COMMA, "$1、")
    .replace(JA_BEFORE_PERIOD, "$1。")
    .replace(SPACE_AFTER_JA_PUNCT, "$1")
    .trim();
}

/**
 * 翻訳先言語に応じた後処理を返す。
 *
 * 句読点の全角化は日本語専用(中国語も CJK 文字を使うが ASCII カンマの
 * 変換先が異なる)。日本語以外はトリムのみ行う。
 */
export function postprocessFor(targetLang: string): (text: string) => string {
  return targetLang === "ja"
    ? normalizeJapaneseOutput
    : (text: string): string => text.trim();
}
