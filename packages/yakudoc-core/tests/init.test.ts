import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { addPluginToTsconfig, initProject } from "../src/init";
import { readTranslations } from "../src/translationsFile";

const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** tsconfig.json と JSDoc 付きソースを持つ最小プロジェクトを作る */
function makeProject(tsconfigText: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-init-"));
  tempDirs.push(dir);
  fs.writeFileSync(path.join(dir, "tsconfig.json"), tsconfigText);
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(
    path.join(dir, "src", "greet.ts"),
    [
      "/** Greets the given name. */",
      "export function greet(name: string): string {",
      "  return `Hello, ${name}`;",
      "}",
      "",
    ].join("\n")
  );
  return dir;
}

describe("addPluginToTsconfig", () => {
  it("plugins が無い tsconfig に追記する", () => {
    const { text, changed } = addPluginToTsconfig(
      `{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n`
    );
    assert.equal(changed, true);
    const parsed = JSON.parse(text) as {
      compilerOptions: { plugins: Array<{ name: string }> };
    };
    assert.deepEqual(parsed.compilerOptions.plugins, [
      { name: "yakudoc-ts-plugin" },
    ]);
  });

  it("既存の plugins 配列の末尾に追加する", () => {
    const { text, changed } = addPluginToTsconfig(
      `{\n  "compilerOptions": {\n    "plugins": [{ "name": "other-plugin" }]\n  }\n}\n`
    );
    assert.equal(changed, true);
    const parsed = JSON.parse(text) as {
      compilerOptions: { plugins: Array<{ name: string }> };
    };
    assert.deepEqual(
      parsed.compilerOptions.plugins.map((plugin) => plugin.name),
      ["other-plugin", "yakudoc-ts-plugin"]
    );
  });

  it("登録済みなら何もしない", () => {
    const original = `{\n  "compilerOptions": {\n    "plugins": [{ "name": "yakudoc-ts-plugin" }]\n  }\n}\n`;
    const { text, changed } = addPluginToTsconfig(original);
    assert.equal(changed, false);
    assert.equal(text, original);
  });

  it("JSONC のコメントを保持する", () => {
    const { text, changed } = addPluginToTsconfig(
      `{\n  // strict は必須\n  "compilerOptions": {\n    "strict": true\n  }\n}\n`
    );
    assert.equal(changed, true);
    assert.ok(text.includes("// strict は必須"));
    assert.ok(text.includes(`"name": "yakudoc-ts-plugin"`));
  });
});

describe("initProject", () => {
  it("プラグイン登録と初回 extract を一括で行う", () => {
    const dir = makeProject(`{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n`);

    const summary = initProject({ projectDir: dir });

    assert.equal(summary.pluginRegistered, true);
    assert.equal(summary.tsconfigPath, path.join(dir, "tsconfig.json"));
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(dir, "tsconfig.json"), "utf8")
    ) as { compilerOptions: { plugins: Array<{ name: string }> } };
    assert.deepEqual(tsconfig.compilerOptions.plugins, [
      { name: "yakudoc-ts-plugin" },
    ]);

    assert.equal(summary.extract.extracted, 1);
    const translations = readTranslations(summary.extract.outPath)!;
    const entries = Object.values(translations);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].original, "Greets the given name.");
    assert.equal(entries[0].translated, "");
  });

  it("再実行しても冪等で、既存の訳文を保持する", () => {
    const dir = makeProject(`{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n`);

    const first = initProject({ projectDir: dir });
    const translations = readTranslations(first.extract.outPath)!;
    const hash = Object.keys(translations)[0];
    translations[hash].translated = "指定された名前に挨拶する。";
    fs.writeFileSync(
      first.extract.outPath,
      JSON.stringify(translations, null, 2)
    );
    const tsconfigAfterFirst = fs.readFileSync(
      path.join(dir, "tsconfig.json"),
      "utf8"
    );

    const second = initProject({ projectDir: dir });

    assert.equal(second.pluginRegistered, false);
    assert.equal(
      fs.readFileSync(path.join(dir, "tsconfig.json"), "utf8"),
      tsconfigAfterFirst
    );
    const merged = readTranslations(second.extract.outPath)!;
    assert.equal(merged[hash].translated, "指定された名前に挨拶する。");
  });

  it("tsconfig.json が無ければエラーになる", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-init-"));
    tempDirs.push(dir);
    assert.throws(
      () => initProject({ projectDir: dir }),
      /tsconfig\.json が見つかりません/
    );
  });
});
