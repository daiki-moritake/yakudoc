import {
  resolveLanguage,
  resolveTranslationsPath,
  type EngineRunOptions,
} from "yakudoc-core";
import { translatePending } from "./engine";
import { resolveModel } from "./resolveModel";
import { createLocalTranslator } from "./translator";

export { translatePending, type MtSummary, type TranslateFn } from "./engine";
export { createLocalTranslator, DEFAULT_MODEL } from "./translator";
export { normalizeJapaneseOutput, postprocessFor } from "./postprocess";
export {
  resolveModel,
  MODEL_TIERS,
  AUTO_LARGE_MIN_GB,
  type ModelSpec,
  type ResolvedModel,
} from "./resolveModel";

/**
 * `yakudoc translate --engine local` のエントリポイント。
 *
 * モデルは次の優先順位で決まる:
 *   --model / YAKUDOC_MT_MODEL(明示) >
 *   --model-size / YAKUDOC_MT_MODEL_SIZE(small|large|auto) >
 *   auto(搭載メモリから判定)
 */
export async function run(options: EngineRunOptions): Promise<void> {
  if (options.applyPath) {
    throw new Error(
      "--apply は --engine prep 用のオプションです。local エンジンは直接 translations.json に書き込みます。"
    );
  }

  const translationsPath = resolveTranslationsPath(
    options.projectDir,
    options.translationsPath
  );

  const resolved = resolveModel({
    explicitModel: options.model ?? process.env.YAKUDOC_MT_MODEL,
    size: options.modelSize ?? process.env.YAKUDOC_MT_MODEL_SIZE,
    targetLang: options.targetLang,
  });
  const lang = resolveLanguage(resolved.targetLang);

  console.log(`翻訳モデル: ${resolved.model}`);
  console.log(`選択理由: ${resolved.reason}`);
  console.log(`翻訳先言語: ${lang.name} (${lang.code})`);
  if (resolved.warning) {
    console.warn(`警告: ${resolved.warning}`);
  }
  console.log("(初回はモデルのダウンロードに時間がかかることがあります)");

  const translate = await createLocalTranslator(resolved, resolved.targetLang);
  const summary = await translatePending(
    translationsPath,
    translate,
    (message) => console.log(message),
    undefined,
    resolved.targetLang
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
