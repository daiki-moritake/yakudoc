import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashText, normalizeText } from "../src/normalize";

describe("normalizeText", () => {
  it("改行コードを \\n に統一する", () => {
    assert.equal(normalizeText("a\r\nb\rc"), "a\nb\nc");
  });

  it("各行の前後の空白と全体の前後の空白を取り除く", () => {
    assert.equal(normalizeText("  hello  \n   world "), "hello\nworld");
  });

  it("3 行以上の連続空行を 1 つの空行に潰す", () => {
    assert.equal(normalizeText("a\n\n\n\nb"), "a\n\nb");
  });
});

describe("hashText", () => {
  it("表記ゆれ(改行コード・インデント)があっても同じキーになる", () => {
    assert.equal(
      hashText("Fetches user data.\r\n  Second line."),
      hashText("Fetches user data.\nSecond line.")
    );
  });

  it("8 桁の hex を返す", () => {
    assert.match(hashText("Fetches user data from the API."), /^[0-9a-f]{8}$/);
  });

  it("異なる原文は異なるキーになる", () => {
    assert.notEqual(hashText("foo"), hashText("bar"));
  });
});
