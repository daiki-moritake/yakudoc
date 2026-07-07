export interface TranslationEntry {
  /** 抽出した原文(トリム済み) */
  original: string;
  /** 訳文。空文字列は「翻訳待ち」を意味する */
  translated: string;
  /** 補助情報。リネーム検出用の "src/api/user.ts#fetchUser" 形式 */
  symbol?: string;
}

/** .yakudoc/translations.json 全体。キーは正規化した原文のハッシュ */
export type TranslationsFile = Record<string, TranslationEntry>;
