import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeJapaneseOutput, postprocessFor } from "../src/postprocess";

describe("normalizeJapaneseOutput", () => {
  it("日本語文字に続く ASCII の読点・句点を全角にする", () => {
    assert.equal(
      normalizeJapaneseOutput("2つの数字を足して,合計を返します."),
      "2つの数字を足して、合計を返します。"
    );
  });

  it("句読点の直後の余分な空白を詰める(トークン前の空白は残す)", () => {
    // "取得し, <ph0> オブジェクトを返します." が入力
    assert.equal(
      normalizeJapaneseOutput("APIから取得し, <ph0> を返します."),
      "APIから取得し、<ph0> を返します。"
    );
  });

  it("小数点は変換しない(直前が日本語文字でない)", () => {
    assert.equal(
      normalizeJapaneseOutput("バージョン 1.5 を返します."),
      "バージョン 1.5 を返します。"
    );
  });

  it("保護トークン直後の ASCII ピリオドは変換しない", () => {
    // 直前が '>'(ASCII)なので全角化されない
    assert.equal(
      normalizeJapaneseOutput("結果は <ph0>."),
      "結果は <ph0>."
    );
  });

  it("英文中のカンマ・ピリオドには触れない", () => {
    assert.equal(
      normalizeJapaneseOutput("See a, b and c."),
      "See a, b and c."
    );
  });

  it("句読点が無い出力はそのまま(前後の空白のみ除去)", () => {
    assert.equal(
      normalizeJapaneseOutput("  ユーザーの一意な識別子  "),
      "ユーザーの一意な識別子"
    );
  });

  it("カタカナ長音符のあとの句点も全角化する", () => {
    assert.equal(
      normalizeJapaneseOutput("データを取得するためのハンドラー."),
      "データを取得するためのハンドラー。"
    );
  });
});

describe("postprocessFor", () => {
  it("ja では句読点の全角化を行う", () => {
    assert.equal(
      postprocessFor("ja")("2つの数字を足して,合計を返します."),
      "2つの数字を足して、合計を返します。"
    );
  });

  it("ja 以外はトリムのみで句読点に触れない", () => {
    // 中国語も CJK 文字を使うが、ASCII カンマの変換先が日本語と異なるため
    // 全角化は適用されない
    assert.equal(
      postprocessFor("zh")("  从 API 获取用户数据,并返回结果.  "),
      "从 API 获取用户数据,并返回结果."
    );
    assert.equal(
      postprocessFor("de")("  Ruft Benutzerdaten von der API ab.  "),
      "Ruft Benutzerdaten von der API ab."
    );
  });
});
