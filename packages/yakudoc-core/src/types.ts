export interface TranslationEntry {
  /** 抽出した原文(トリム済み) */
  original: string;
  /** 訳文。空文字列は「翻訳待ち」を意味する */
  translated: string;
  /** 補助情報。リネーム検出用の "src/api/user.ts#fetchUser" 形式 */
  symbol?: string;
  /**
   * 訳文の言語コード。翻訳エンジンが書き込み時に付与する。
   * 無いエントリ(手動編集・旧バージョンのファイル)は現在の翻訳先言語と
   * みなす(アップグレードで既存の訳が失効しないようにするため)。
   */
  lang?: string;
}

/** .yakudoc/translations.json 全体。キーは正規化した原文のハッシュ */
export type TranslationsFile = Record<string, TranslationEntry>;

/**
 * `yakudoc translate --engine <name>` が翻訳エンジンパッケージ
 * (yakudoc-ai-prep / yakudoc-mt)に渡すオプション。
 * エンジン側は `run(options: EngineRunOptions): Promise<void>` を公開する。
 */
export interface EngineRunOptions {
  /** プロジェクトルート(CLI 実行時のカレントディレクトリ) */
  projectDir: string;
  /** translations.json のパス(省略時: .yakudoc/translations.json) */
  translationsPath?: string;
  /** 翻訳結果 JSON を書き戻す場合、そのファイルのパス */
  applyPath?: string;
  /** yakudoc-mt: 使用するモデルの HF id を明示する(modelSize より優先) */
  model?: string;
  /** yakudoc-mt: モデルの大きさ。small | large | auto(既定は auto) */
  modelSize?: string;
  /** 翻訳先の言語コード(languages.ts で解決済み。省略時: ja) */
  targetLang?: string;
}
