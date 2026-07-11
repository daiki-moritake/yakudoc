import { DEFAULT_TARGET_LANG } from "yakudoc-core";
import type { TranslateFn } from "./engine";
import { postprocessFor } from "./postprocess";
import { MODEL_TIERS, type ModelSpec } from "./resolveModel";

/** 既定の小モデル(後方互換のため公開) */
export const DEFAULT_MODEL = MODEL_TIERS.small.model;

// @huggingface/transformers は ESM 専用パッケージのため、CommonJS から
// 読み込むには本物の dynamic import が必要になる。tsc(module: commonjs)は
// import() を require() に変換してしまうので、変換を逃れる形で呼び出す。
const dynamicImport = new Function(
  "specifier",
  "return import(specifier)"
) as (specifier: string) => Promise<typeof import("@huggingface/transformers")>;

/**
 * transformers.js の翻訳パイプラインを起動して TranslateFn を返す。
 * 初回はモデルのダウンロードが走る(small で数百 MB、large は 1GB 超)。
 *
 * 言語コード(srcLang/tgtLang)はモデルのアーキテクチャで異なるため
 * ModelSpec で受け取る(NLLB: eng_Latn/jpn_Jpan、mBART: en_XX/ja_XX)。
 */
export async function createLocalTranslator(
  spec: ModelSpec = MODEL_TIERS.small,
  targetLang: string = DEFAULT_TARGET_LANG
): Promise<TranslateFn> {
  const postprocess = postprocessFor(targetLang);
  const { pipeline } = await dynamicImport("@huggingface/transformers");
  // dtype 未指定だと fp32(数 GB)を取得してしまう。
  // CPU 実行前提のツールなので 8bit 量子化版を使う。
  const translator = (await pipeline("translation", spec.model, {
    dtype: "q8",
  })) as unknown as (
    texts: string[],
    options?: Record<string, unknown>
  ) => Promise<unknown>;

  // 各原文を個別に翻訳する。バッチ翻訳は 1 つの max_new_tokens を全文で
  // 共有してしまうが、長さ上限は原文ごとに変えたいため。
  return async (texts: string[]): Promise<string[]> =>
    Promise.all(
      texts.map(async (text) => {
        // src_lang / tgt_lang は translation パイプライン固有のオプション
        // (公開されている型定義の GenerationConfig には含まれない)。
        //
        // max_new_tokens を原文の長さに比例させて厳しめに絞るのが重要。
        // NLLB は正しい訳を最初に出したあと EOS を出せずに多言語の
        // ゴミを延々と生成し続けることがあり、上限で断ち切ることで
        // 先頭の正しい訳だけを取り出す。
        const options: Record<string, unknown> = {
          max_new_tokens: estimateMaxTokens(text),
        };
        if (spec.srcLang) {
          options.src_lang = spec.srcLang;
        }
        if (spec.tgtLang) {
          options.tgt_lang = spec.tgtLang;
        }
        const outputs = await translator([text], options);
        const first = Array.isArray(outputs) ? outputs[0] : outputs;
        const raw = String(
          (first as { translation_text?: unknown }).translation_text ?? ""
        );
        // 保護トークン復元前に出力を整える(日本語なら句読点の全角化など)
        return postprocess(raw);
      })
    );
}

/** 原文の語数からおおまかな生成トークン上限を見積もる(日本語は語より増える) */
function estimateMaxTokens(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.min(Math.max(words * 4 + 12, 24), 128);
}
