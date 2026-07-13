import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { protectText, restoreText } from "../src/placeholders";

describe("protectText", () => {
  it("インラインコードをトークンに置き換える", () => {
    const result = protectText("Returns the `UserData` object.");
    assert.equal(result.text, "Returns the <ph0> object.");
    assert.deepEqual(result.placeholders, ["`UserData`"]);
  });

  it("{@link} インラインタグと URL を保護する", () => {
    const result = protectText(
      "See {@link fetchUser} and https://example.com/docs for details."
    );
    assert.equal(result.text, "See <ph0> and <ph1> for details.");
    assert.deepEqual(result.placeholders, [
      "{@link fetchUser}",
      "https://example.com/docs",
    ]);
  });

  it("フェンス付きコードブロックを丸ごと保護する", () => {
    const original = "Usage:\n```ts\nconst x = fetchUser(\"1\");\n```\nDone.";
    const result = protectText(original);
    assert.equal(result.text, "Usage:\n<ph0>\nDone.");
    assert.equal(result.placeholders[0].includes("fetchUser"), true);
  });

  it("{型} 注釈を保護し、{@link} タグとは別扱いにする", () => {
    const result = protectText(
      "Returns {Promise<string>}. See {@link Foo} and pass {number|null}."
    );
    assert.equal(result.text, "Returns <ph1>. See <ph0> and pass <ph2>.");
    assert.deepEqual(result.placeholders, [
      "{@link Foo}",
      "{Promise<string>}",
      "{number|null}",
    ]);
  });

  it("保護対象が無ければそのまま返す", () => {
    const result = protectText("Fetches user data from the API.");
    assert.equal(result.text, "Fetches user data from the API.");
    assert.deepEqual(result.placeholders, []);
  });
});

describe("restoreText", () => {
  it("トークンを元の断片に復元する(往復)", () => {
    const original = "See {@link fetchUser} and `UserData`.";
    const { text, placeholders } = protectText(original);
    const translated = text.replace("See", "参照:");
    const restored = restoreText(translated, placeholders);
    assert.deepEqual(restored.missing, []);
    assert.ok(restored.text.includes("{@link fetchUser}"));
    assert.ok(restored.text.includes("`UserData`"));
  });

  it("訳文からトークンが消えていたら missing で報告する", () => {
    const restored = restoreText("トークンを消してしまった訳文", ["`code`"]);
    assert.deepEqual(restored.missing, [0]);
  });

  it("同じトークンが複数回使われていても全て復元する", () => {
    const restored = restoreText("<ph0> と <ph0>", ["`x`"]);
    assert.equal(restored.text, "`x` と `x`");
  });
});
