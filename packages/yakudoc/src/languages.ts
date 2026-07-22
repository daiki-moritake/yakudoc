/**
 * 翻訳先言語のレジストリ。
 *
 * yakudoc の翻訳先はここに載っている言語コードで指定する(既定: ja)。
 * 内蔵モデル(yakudoc-mt)はモデルのアーキテクチャごとに独自の言語コード
 * 体系を持つため、NLLB-200 / mBART-50 双方のコードをここで対応付ける。
 * 掲載言語は両モデルが対応しているものに限る。
 */
import { m } from "./i18n";

export interface LanguageSpec {
  /** yakudoc で使う言語コード(ISO 639-1) */
  code: string;
  /** 英語の言語名。LLM への依頼文やログ表示に使う */
  name: string;
  /** NLLB-200 の言語コード(FLORES-200 形式) */
  nllb: string;
  /** mBART-50 の言語コード */
  mbart: string;
}

export const DEFAULT_TARGET_LANG = "ja";

export const LANGUAGES: readonly LanguageSpec[] = [
  { code: "ja", name: "Japanese", nllb: "jpn_Jpan", mbart: "ja_XX" },
  { code: "en", name: "English", nllb: "eng_Latn", mbart: "en_XX" },
  { code: "ko", name: "Korean", nllb: "kor_Hang", mbart: "ko_KR" },
  { code: "zh", name: "Simplified Chinese", nllb: "zho_Hans", mbart: "zh_CN" },
  { code: "de", name: "German", nllb: "deu_Latn", mbart: "de_DE" },
  { code: "fr", name: "French", nllb: "fra_Latn", mbart: "fr_XX" },
  { code: "es", name: "Spanish", nllb: "spa_Latn", mbart: "es_XX" },
  { code: "pt", name: "Portuguese", nllb: "por_Latn", mbart: "pt_XX" },
  { code: "it", name: "Italian", nllb: "ita_Latn", mbart: "it_IT" },
  { code: "nl", name: "Dutch", nllb: "nld_Latn", mbart: "nl_XX" },
  { code: "sv", name: "Swedish", nllb: "swe_Latn", mbart: "sv_SE" },
  { code: "fi", name: "Finnish", nllb: "fin_Latn", mbart: "fi_FI" },
  { code: "pl", name: "Polish", nllb: "pol_Latn", mbart: "pl_PL" },
  { code: "cs", name: "Czech", nllb: "ces_Latn", mbart: "cs_CZ" },
  { code: "uk", name: "Ukrainian", nllb: "ukr_Cyrl", mbart: "uk_UA" },
  { code: "ru", name: "Russian", nllb: "rus_Cyrl", mbart: "ru_RU" },
  { code: "tr", name: "Turkish", nllb: "tur_Latn", mbart: "tr_TR" },
  { code: "ar", name: "Arabic", nllb: "arb_Arab", mbart: "ar_AR" },
  { code: "hi", name: "Hindi", nllb: "hin_Deva", mbart: "hi_IN" },
  { code: "id", name: "Indonesian", nllb: "ind_Latn", mbart: "id_ID" },
  { code: "vi", name: "Vietnamese", nllb: "vie_Latn", mbart: "vi_VN" },
  { code: "th", name: "Thai", nllb: "tha_Thai", mbart: "th_TH" },
];

/** 対応している言語コードの一覧(エラーメッセージやヘルプ表示用) */
export function supportedLanguageCodes(): string[] {
  return LANGUAGES.map((lang) => lang.code);
}

/**
 * 言語コードから LanguageSpec を引く(大文字小文字は区別しない)。
 * 未対応のコードはエラーにする。
 */
export function resolveLanguage(code: string): LanguageSpec {
  const normalized = code.trim().toLowerCase();
  const found = LANGUAGES.find((lang) => lang.code === normalized);
  if (!found) {
    throw new Error(
      m().unsupportedLang(code, supportedLanguageCodes().join(", "))
    );
  }
  return found;
}
