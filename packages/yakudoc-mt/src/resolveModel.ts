import * as os from "node:os";

export interface ModelSpec {
  /** Hugging Face のモデル id */
  model: string;
  /** translation パイプラインに渡す言語コード(opus 系など不要なモデルは undefined) */
  srcLang?: string;
  tgtLang?: string;
  /** ログ表示用の説明 */
  label: string;
}

/**
 * リソース階層ごとの既定モデル。
 * - small: 速くて軽い(既定)。NLLB-200 蒸留 600M
 * - large: より高品質だがメモリ・時間を要する。mBART-50
 */
export const MODEL_TIERS: Record<"small" | "large", ModelSpec> = {
  small: {
    model: "Xenova/nllb-200-distilled-600M",
    srcLang: "eng_Latn",
    tgtLang: "jpn_Jpan",
    label: "small (NLLB-200 蒸留 600M)",
  },
  large: {
    model: "Xenova/mbart-large-50-many-to-many-mmt",
    srcLang: "en_XX",
    tgtLang: "ja_XX",
    label: "large (mBART-50)",
  },
};

/** auto で large を選ぶ搭載メモリの下限(GiB) */
export const AUTO_LARGE_MIN_GB = 16;

export interface ResolveInput {
  /** モデルの明示指定(HF id)。指定時は size より優先 */
  explicitModel?: string;
  /** small | large | auto(未指定は auto) */
  size?: string;
}

export interface ResolvedModel extends ModelSpec {
  /** 選択理由(ログ用) */
  reason: string;
}

/** 明示モデル名から言語コードを推定する(既知のアーキテクチャのみ) */
function inferLangCodes(model: string): { srcLang?: string; tgtLang?: string } {
  const lower = model.toLowerCase();
  if (lower.includes("nllb")) {
    return { srcLang: "eng_Latn", tgtLang: "jpn_Jpan" };
  }
  if (lower.includes("mbart")) {
    return { srcLang: "en_XX", tgtLang: "ja_XX" };
  }
  if (lower.includes("m2m100")) {
    return { srcLang: "en", tgtLang: "ja" };
  }
  // opus-mt など言語ペア固定のモデルは言語コード不要
  return {};
}

/**
 * 入力(明示指定 / サイズ / 搭載メモリ)から使用モデルを決める。
 *
 * 優先順位: 明示モデル > サイズ指定(small|large)> auto(メモリから判定)。
 * totalMemBytes はテスト用に注入可能。
 */
export function resolveModel(
  input: ResolveInput,
  totalMemBytes: number = os.totalmem()
): ResolvedModel {
  if (input.explicitModel) {
    const known = Object.values(MODEL_TIERS).find(
      (tier) => tier.model === input.explicitModel
    );
    const langs = known ?? inferLangCodes(input.explicitModel);
    return {
      model: input.explicitModel,
      srcLang: langs.srcLang,
      tgtLang: langs.tgtLang,
      label: `指定モデル (${input.explicitModel})`,
      reason: `明示指定: ${input.explicitModel}`,
    };
  }

  const size = (input.size ?? "auto").toLowerCase();
  if (size === "small" || size === "large") {
    const tier = MODEL_TIERS[size];
    return { ...tier, reason: `--model-size ${size} → ${tier.label}` };
  }
  if (size !== "auto") {
    throw new Error(
      `不明な --model-size です: ${input.size}(small | large | auto のいずれか)`
    );
  }

  const gb = totalMemBytes / 1024 ** 3;
  const tier = gb >= AUTO_LARGE_MIN_GB ? MODEL_TIERS.large : MODEL_TIERS.small;
  return {
    ...tier,
    reason: `auto: 搭載メモリ ${gb.toFixed(1)}GB → ${tier.label}`,
  };
}
