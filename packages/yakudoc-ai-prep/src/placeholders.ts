/**
 * 翻訳してはいけない断片(コード片・インラインタグ・URL)を
 * ⟦n⟧ 形式のトークンに置き換えて保護する。
 *
 * LLM にはトークン入りのテキストを渡し、訳文の対応する位置に
 * トークンをそのまま残してもらう。書き戻し時に restoreText で復元する。
 */

const PROTECT_PATTERNS: RegExp[] = [
  // フェンス付きコードブロック(インラインコードより先に処理する)
  /```[\s\S]*?```/g,
  // インラインコード
  /`[^`\n]+`/g,
  // {@link Foo} / {@linkcode Foo} / {@inheritDoc} などのインラインタグ
  /\{@[a-zA-Z]+[^{}]*\}/g,
  // URL
  /https?:\/\/[^\s)]+/g,
];

export interface ProtectedText {
  /** トークンに置き換え済みのテキスト */
  text: string;
  /** トークン番号 → 元の断片 */
  placeholders: string[];
}

export function protectText(original: string): ProtectedText {
  const placeholders: string[] = [];
  let text = original;
  for (const pattern of PROTECT_PATTERNS) {
    text = text.replace(pattern, (match) => {
      const token = `⟦${placeholders.length}⟧`;
      placeholders.push(match);
      return token;
    });
  }
  return { text, placeholders };
}

export interface RestoredText {
  text: string;
  /** 訳文中に見つからなかったトークン番号。1 つでもあれば訳文は採用しない */
  missing: number[];
}

export function restoreText(
  translated: string,
  placeholders: string[]
): RestoredText {
  const missing: number[] = [];
  let text = translated;
  placeholders.forEach((value, index) => {
    const token = `⟦${index}⟧`;
    if (!text.includes(token)) {
      missing.push(index);
      return;
    }
    text = text.split(token).join(value);
  });
  return { text, missing };
}
