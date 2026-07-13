import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_TARGET_LANG,
  LANGUAGES,
  resolveLanguage,
  supportedLanguageCodes,
} from "../src/languages";

describe("resolveLanguage", () => {
  it("言語コードから NLLB / mBART のコードを引ける", () => {
    const ja = resolveLanguage("ja");
    assert.equal(ja.name, "Japanese");
    assert.equal(ja.nllb, "jpn_Jpan");
    assert.equal(ja.mbart, "ja_XX");

    const de = resolveLanguage("de");
    assert.equal(de.name, "German");
    assert.equal(de.nllb, "deu_Latn");
    assert.equal(de.mbart, "de_DE");
  });

  it("大文字・前後の空白を許容する", () => {
    assert.equal(resolveLanguage(" KO ").code, "ko");
  });

  it("未対応コードは対応一覧つきのエラーにする", () => {
    assert.throws(() => resolveLanguage("xx"), /未対応の言語コード.*\bja\b/s);
  });
});

describe("言語レジストリ", () => {
  it("既定言語(ja)がレジストリに含まれる", () => {
    assert.ok(supportedLanguageCodes().includes(DEFAULT_TARGET_LANG));
  });

  it("全言語が NLLB / mBART 両方のコードを持つ(内蔵モデル両対応の言語のみ載せる)", () => {
    for (const lang of LANGUAGES) {
      assert.ok(lang.nllb, `${lang.code}: nllb コードがありません`);
      assert.ok(lang.mbart, `${lang.code}: mbart コードがありません`);
    }
  });

  it("言語コードに重複が無い", () => {
    const codes = supportedLanguageCodes();
    assert.equal(new Set(codes).size, codes.length);
  });
});
