import type { TranslateFn } from "./engine";
import { normalizeJapaneseOutput } from "./postprocess";

export const DEFAULT_MODEL = "Xenova/nllb-200-distilled-600M";

/** NLLB 系モデルで使う言語コード */
const NLLB_SOURCE_LANG = "eng_Latn";
const NLLB_TARGET_LANG = "jpn_Jpan";

// @huggingface/transformers は ESM 専用パッケージのため、CommonJS から
// 読み込むには本物の dynamic import が必要になる。tsc(module: commonjs)は
// import() を require() に変換してしまうので、変換を逃れる形で呼び出す。
const dynamicImport = new Function(
  "specifier",
  "return import(specifier)"
) as (specifier: string) => Promise<typeof import("@huggingface/transformers")>;

/**
 * transformers.js の翻訳パイプラインを起動して TranslateFn を返す。
 * 初回はモデル(既定の NLLB-200 蒸留版で数百 MB)のダウンロードが走る。
 */
export async function createLocalTranslator(
  model: string = DEFAULT_MODEL
): Promise<TranslateFn> {
  const { pipeline } = await dynamicImport("@huggingface/transformers");
  // dtype 未指定だと fp32(NLLB 600M で数 GB)を取得してしまう。
  // CPU 実行前提のツールなので 8bit 量子化版を使う。
  const translator = (await pipeline("translation", model, {
    dtype: "q8",
  })) as unknown as (
    texts: string[],
    options?: Record<string, unknown>
  ) => Promise<unknown>;
  const isNllb = model.toLowerCase().includes("nllb");

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
        if (isNllb) {
          options.src_lang = NLLB_SOURCE_LANG;
          options.tgt_lang = NLLB_TARGET_LANG;
        }
        const outputs = await translator([text], options);
        const first = Array.isArray(outputs) ? outputs[0] : outputs;
        const raw = String(
          (first as { translation_text?: unknown }).translation_text ?? ""
        );
        // 保護トークン復元前に日本語出力を整える(句読点の全角化など)
        return normalizeJapaneseOutput(raw);
      })
    );
}

/** 原文の語数からおおまかな生成トークン上限を見積もる(日本語は語より増える) */
function estimateMaxTokens(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.min(Math.max(words * 4 + 12, 24), 128);
}
