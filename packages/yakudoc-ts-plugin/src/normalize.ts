import { createHash } from "node:crypto";

/**
 * 翻訳キーの照合に使う正規化。
 *
 * tsserver が返す documentation テキストと、extractor がソースの JSDoc から
 * 抽出したテキストは、改行コードや行頭のインデントが微妙に異なることがある。
 * 双方をこの関数に通した結果が一致すれば「同じ原文」とみなす。
 *
 * 規約(extractor 側も必ずこれに従うこと):
 * - 改行は "\n" に統一する
 * - 各行の前後の空白を取り除く
 * - 3 行以上連続する空行は 1 つの空行に潰す
 * - 全体の前後の空白を取り除く
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 翻訳エントリのキー。正規化した原文の SHA-256 先頭 8 桁(hex)。
 */
export function hashText(text: string): string {
  return createHash("sha256")
    .update(normalizeText(text), "utf8")
    .digest("hex")
    .slice(0, 8);
}
