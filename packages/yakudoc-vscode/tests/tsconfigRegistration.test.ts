import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parse } from "jsonc-parser";
import { addYakudocPlugin } from "../src/tsconfigRegistration";

describe("addYakudocPlugin", () => {
  it("compilerOptions.plugins が無ければ作成して追加する", () => {
    const input = `{
  "compilerOptions": {
    "strict": true
  }
}`;
    const { text, changed } = addYakudocPlugin(input);
    assert.equal(changed, true);
    assert.deepEqual(parse(text).compilerOptions.plugins, [
      { name: "yakudoc-ts-plugin" },
    ]);
    // 既存の設定は保持される
    assert.equal(parse(text).compilerOptions.strict, true);
  });

  it("既存の plugins 配列には末尾に追加する", () => {
    const input = `{
  "compilerOptions": {
    "plugins": [{ "name": "other-plugin" }]
  }
}`;
    const { text, changed } = addYakudocPlugin(input);
    assert.equal(changed, true);
    assert.deepEqual(parse(text).compilerOptions.plugins, [
      { name: "other-plugin" },
      { name: "yakudoc-ts-plugin" },
    ]);
  });

  it("登録済みなら何も変更しない", () => {
    const input = `{
  "compilerOptions": {
    "plugins": [{ "name": "yakudoc-ts-plugin" }]
  }
}`;
    const { text, changed } = addYakudocPlugin(input);
    assert.equal(changed, false);
    assert.equal(text, input);
  });

  it("JSONC のコメントを保持する", () => {
    const input = `{
  // ビルド設定
  "compilerOptions": {
    "strict": true // 厳格モード
  }
}`;
    const { text } = addYakudocPlugin(input);
    assert.ok(text.includes("// ビルド設定"));
    assert.ok(text.includes("// 厳格モード"));
    assert.deepEqual(parse(text).compilerOptions.plugins, [
      { name: "yakudoc-ts-plugin" },
    ]);
  });

  it("compilerOptions 自体が無い空の tsconfig にも追加できる", () => {
    const { text, changed } = addYakudocPlugin("{}");
    assert.equal(changed, true);
    assert.deepEqual(parse(text).compilerOptions.plugins, [
      { name: "yakudoc-ts-plugin" },
    ]);
  });
});
