import * as path from "node:path";
import type { EngineRunOptions } from "yakudoc-core";
import { translatePending } from "./engine";
import { createLocalTranslator, DEFAULT_MODEL } from "./translator";

export { translatePending, type MtSummary, type TranslateFn } from "./engine";
export { createLocalTranslator, DEFAULT_MODEL } from "./translator";

/**
 * `yakudoc translate --engine local` のエントリポイント。
 * モデルは環境変数 YAKUDOC_MT_MODEL で差し替えられる。
 */
export async function run(options: EngineRunOptions): Promise<void> {
  if (options.applyPath) {
    throw new Error(
      "--apply は --engine prep 用のオプションです。local エンジンは直接 translations.json に書き込みます。"
    );
  }

  const translationsPath = path.resolve(
    options.projectDir,
    options.translationsPath ?? path.join(".yakudoc", "translations.json")
  );

  const model = process.env.YAKUDOC_MT_MODEL || DEFAULT_MODEL;
  console.log(`翻訳モデル: ${model}`);
  console.log("(初回はモデルのダウンロードに数分かかることがあります)");

  const translate = await createLocalTranslator(model);
  const summary = await translatePending(translationsPath, translate, (message) =>
    console.log(message)
  );

  if (summary.pending === 0) {
    console.log("翻訳待ちのエントリはありません。");
    return;
  }
  console.log(
    `${summary.pending} 件中 ${summary.applied} 件を翻訳して書き込みました`
  );
  for (const reason of summary.skipped) {
    console.warn(`スキップ: ${reason}`);
  }
}
