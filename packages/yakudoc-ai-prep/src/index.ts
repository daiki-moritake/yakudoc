import type { EngineRunOptions } from "yakudoc-core";
import { applyResponse } from "./apply";
import { prepare } from "./prep";

export { prepare, type PrepareSummary, type RequestFile } from "./prep";
export { applyResponse, type ApplySummary } from "./apply";

/**
 * `yakudoc translate --engine prep` のエントリポイント。
 * --apply 付きなら翻訳結果の書き戻し、無ければ下準備ファイルの生成を行う。
 */
export async function run(options: EngineRunOptions): Promise<void> {
  if (options.applyPath) {
    const summary = applyResponse({ ...options, applyPath: options.applyPath });
    console.log(`${summary.applied} 件の訳文を書き戻しました`);
    for (const reason of summary.skipped) {
      console.warn(`スキップ: ${reason}`);
    }
    return;
  }

  const summary = prepare(options);
  if (!summary) {
    console.log("翻訳待ちのエントリはありません。");
    return;
  }
  console.log(`${summary.pending} 件の翻訳待ちエントリを書き出しました:`);
  console.log(`  依頼文(LLM にそのまま貼れます): ${summary.promptPath}`);
  console.log(`  機械可読な原文一覧: ${summary.requestPath}`);
  console.log(`  用語集: ${summary.glossaryPath}`);
  console.log(
    "翻訳結果を .yakudoc/ai/response.json に保存したら、" +
      "`yakudoc translate --engine prep --apply .yakudoc/ai/response.json` で反映できます。"
  );
}
