import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AUTO_LARGE_MIN_GB, MODEL_TIERS, resolveModel } from "../src/resolveModel";

const GB = 1024 ** 3;

describe("resolveModel", () => {
  it("明示モデルを最優先し、名前から言語コードを推定する(NLLB)", () => {
    const r = resolveModel({ explicitModel: "Xenova/nllb-200-distilled-600M" }, 4 * GB);
    assert.equal(r.model, "Xenova/nllb-200-distilled-600M");
    assert.equal(r.srcLang, "eng_Latn");
    assert.equal(r.tgtLang, "jpn_Jpan");
  });

  it("明示モデルが mBART なら en_XX/ja_XX を推定する", () => {
    const r = resolveModel({ explicitModel: "custom/mbart-ja" }, 4 * GB);
    assert.equal(r.srcLang, "en_XX");
    assert.equal(r.tgtLang, "ja_XX");
  });

  it("明示モデルが未知アーキテクチャなら言語コードなし(opus など)", () => {
    const r = resolveModel({ explicitModel: "Xenova/opus-mt-en-jap" }, 4 * GB);
    assert.equal(r.srcLang, undefined);
    assert.equal(r.tgtLang, undefined);
  });

  it("size: small / large はメモリに関係なく該当ティアを返す", () => {
    assert.equal(resolveModel({ size: "small" }, 64 * GB).model, MODEL_TIERS.small.model);
    assert.equal(resolveModel({ size: "large" }, 1 * GB).model, MODEL_TIERS.large.model);
  });

  it("size 大文字小文字を問わない", () => {
    assert.equal(resolveModel({ size: "LARGE" }, 1 * GB).model, MODEL_TIERS.large.model);
  });

  it("auto: メモリが下限未満なら small", () => {
    const r = resolveModel({ size: "auto" }, (AUTO_LARGE_MIN_GB - 1) * GB);
    assert.equal(r.model, MODEL_TIERS.small.model);
    assert.match(r.reason, /auto/);
  });

  it("auto: メモリが下限以上なら large", () => {
    const r = resolveModel({ size: "auto" }, AUTO_LARGE_MIN_GB * GB);
    assert.equal(r.model, MODEL_TIERS.large.model);
  });

  it("size 未指定は auto として扱う", () => {
    assert.equal(resolveModel({}, 1 * GB).model, MODEL_TIERS.small.model);
    assert.equal(resolveModel({}, 32 * GB).model, MODEL_TIERS.large.model);
  });

  it("不明な size はエラーにする", () => {
    assert.throws(() => resolveModel({ size: "huge" }, 8 * GB), /model-size/);
  });

  it("明示モデルは size より優先される", () => {
    const r = resolveModel({ explicitModel: "x/y-nllb", size: "large" }, 1 * GB);
    assert.equal(r.model, "x/y-nllb");
  });

  it("targetLang でモデルの言語コードが切り替わる(NLLB)", () => {
    const r = resolveModel({ size: "small", targetLang: "de" }, 4 * GB);
    assert.equal(r.srcLang, "eng_Latn");
    assert.equal(r.tgtLang, "deu_Latn");
    assert.equal(r.targetLang, "de");
  });

  it("targetLang でモデルの言語コードが切り替わる(mBART)", () => {
    const r = resolveModel({ size: "large", targetLang: "ko" }, 4 * GB);
    assert.equal(r.srcLang, "en_XX");
    assert.equal(r.tgtLang, "ko_KR");
  });

  it("明示モデルにも targetLang が効く", () => {
    const r = resolveModel(
      { explicitModel: "custom/nllb-tuned", targetLang: "fr" },
      4 * GB
    );
    assert.equal(r.tgtLang, "fra_Latn");
  });

  it("targetLang 未指定は従来どおり日本語のコードになる", () => {
    const r = resolveModel({ size: "small" }, 4 * GB);
    assert.equal(r.tgtLang, "jpn_Jpan");
    assert.equal(r.targetLang, "ja");
  });

  it("未対応の targetLang はエラーにする", () => {
    assert.throws(
      () => resolveModel({ size: "small", targetLang: "xx" }, 4 * GB),
      /未対応の言語コード/
    );
  });

  it("言語コードを導出できない明示モデルには警告を付ける", () => {
    const r = resolveModel(
      { explicitModel: "Xenova/opus-mt-en-jap", targetLang: "de" },
      4 * GB
    );
    assert.equal(r.tgtLang, undefined);
    assert.ok(r.warning?.includes("言語ペア固定"));
  });

  it("言語コードを導出できるモデルには警告を付けない", () => {
    const r = resolveModel({ explicitModel: "x/y-nllb", targetLang: "de" }, 4 * GB);
    assert.equal(r.warning, undefined);
  });
});
