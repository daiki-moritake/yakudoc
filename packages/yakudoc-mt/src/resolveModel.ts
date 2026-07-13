import * as os from "node:os";
import {
  DEFAULT_TARGET_LANG,
  resolveLanguage,
  type LanguageSpec,
} from "yakudoc";

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
 *
 * srcLang / tgtLang は既定言語(ja)のもの。resolveModel は翻訳先言語に
 * 合わせて上書きするため、直接使う場合のみこの既定値が効く。
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
  /** 翻訳先の言語コード(未指定は ja) */
  targetLang?: string;
}

export interface ResolvedModel extends ModelSpec {
  /** 翻訳先の言語コード(解決済み) */
  targetLang: string;
  /** 選択理由(ログ用) */
  reason: string;
  /** ユーザーに伝えるべき注意事項(あれば CLI が表示する) */
  warning?: string;
}

/**
 * モデル名と翻訳先言語から、translation パイプラインに渡す言語コードを組む。
 * アーキテクチャごとにコード体系が異なる(NLLB: jpn_Jpan、mBART: ja_XX)。
 * opus-mt など言語ペア固定のモデルは言語コード不要のため空を返す。
 */
function langCodesFor(
  model: string,
  lang: LanguageSpec
): { srcLang?: string; tgtLang?: string } {
  const lower = model.toLowerCase();
  if (lower.includes("nllb")) {
    return { srcLang: "eng_Latn", tgtLang: lang.nllb };
  }
  if (lower.includes("mbart")) {
    return { srcLang: "en_XX", tgtLang: lang.mbart };
  }
  if (lower.includes("m2m100")) {
    return { srcLang: "en", tgtLang: lang.code };
  }
  return {};
}

/**
 * 入力(明示指定 / サイズ / 翻訳先言語 / 搭載メモリ)から使用モデルを決める。
 *
 * 優先順位: 明示モデル > サイズ指定(small|large)> auto(メモリから判定)。
 * totalMemBytes はテスト用に注入可能。
 */
export function resolveModel(
  input: ResolveInput,
  totalMemBytes: number = os.totalmem()
): ResolvedModel {
  const lang = resolveLanguage(input.targetLang ?? DEFAULT_TARGET_LANG);

  if (input.explicitModel) {
    const codes = langCodesFor(input.explicitModel, lang);
    return {
      model: input.explicitModel,
      ...codes,
      targetLang: lang.code,
      label: `指定モデル (${input.explicitModel})`,
      reason: `明示指定: ${input.explicitModel}`,
      // 言語コードを導出できないモデルでは --lang がモデルに伝わらないため、
      // 黙って無視せずユーザーに知らせる(言語ペア固定のモデルなら問題ない)
      ...(codes.tgtLang === undefined
        ? {
            warning:
              `モデル名からアーキテクチャを判別できないため、翻訳先言語(${lang.code})を` +
              `モデルに渡しません。言語ペア固定のモデル(opus-mt など)であれば` +
              `このままで問題ありません。`,
          }
        : {}),
    };
  }

  const size = (input.size ?? "auto").toLowerCase();
  if (size === "small" || size === "large") {
    const tier = MODEL_TIERS[size];
    return {
      ...tier,
      ...langCodesFor(tier.model, lang),
      targetLang: lang.code,
      reason: `--model-size ${size} → ${tier.label}`,
    };
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
    ...langCodesFor(tier.model, lang),
    targetLang: lang.code,
    reason: `auto: 搭載メモリ ${gb.toFixed(1)}GB → ${tier.label}`,
  };
}
