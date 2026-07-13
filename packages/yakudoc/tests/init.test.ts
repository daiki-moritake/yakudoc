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
function makeProject(
  tsconfigText: string,
  extraFiles: Record<string, string> = {}
): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-init-"));
  tempDirs.push(dir);
  fs.writeFileSync(path.join(dir, "tsconfig.json"), tsconfigText);
  for (const [name, content] of Object.entries(extraFiles)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
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

  it("plugins が配列以外なら安全のためエラーにする", () => {
    assert.throws(
      () =>
        addPluginToTsconfig(
          `{\n  "compilerOptions": {\n    "plugins": {}\n  }\n}\n`
        ),
      /plugins が配列ではありません/
    );
  });

  it("extends 継承分(effectivePlugins)を種にしてローカル配列を新設する", () => {
    const { text, changed } = addPluginToTsconfig(
      `{\n  "extends": "./tsconfig.base.json",\n  "compilerOptions": {\n    "target": "es2022"\n  }\n}\n`,
      "yakudoc-ts-plugin",
      [{ name: "other-plugin" }]
    );
    assert.equal(changed, true);
    const parsed = JSON.parse(text) as {
      compilerOptions: { plugins: Array<{ name: string }> };
    };
    // 継承分を含めないと、ローカル新設によって other-plugin が失効してしまう
    assert.deepEqual(
      parsed.compilerOptions.plugins.map((plugin) => plugin.name),
      ["other-plugin", "yakudoc-ts-plugin"]
    );
  });

  it("extends 先で登録済み(effectivePlugins に含まれる)なら何もしない", () => {
    const original = `{\n  "extends": "./tsconfig.base.json"\n}\n`;
    const { text, changed } = addPluginToTsconfig(original, "yakudoc-ts-plugin", [
      { name: "yakudoc-ts-plugin" },
    ]);
    assert.equal(changed, false);
    assert.equal(text, original);
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

  it("yakudoc-ts-plugin が node_modules に無ければ pluginInstalled は false", () => {
    const dir = makeProject(`{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n`);
    assert.equal(initProject({ projectDir: dir }).pluginInstalled, false);
  });

  it("yakudoc-ts-plugin が解決できれば pluginInstalled は true", () => {
    const dir = makeProject(`{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n`);
    const pkgDir = path.join(dir, "node_modules", "yakudoc-ts-plugin");
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "yakudoc-ts-plugin", version: "0.0.0", main: "index.js" })
    );
    fs.writeFileSync(path.join(pkgDir, "index.js"), "module.exports = {};\n");

    assert.equal(initProject({ projectDir: dir }).pluginInstalled, true);
  });

  it("tsconfig.json が無ければエラーになる", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-init-"));
    tempDirs.push(dir);
    assert.throws(
      () => initProject({ projectDir: dir }),
      /tsconfig\.json が見つかりません/
    );
  });

  it("--lang 指定で config.json に翻訳先言語を保存する", () => {
    const dir = makeProject(`{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n`);

    const summary = initProject({ projectDir: dir, targetLang: "de" });

    assert.equal(summary.targetLang, "de");
    assert.equal(summary.configWritten, true);
    const configPath = path.join(dir, ".yakudoc", "config.json");
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, "utf8")), {
      targetLang: "de",
    });

    // 言語未指定で再実行しても config.json の言語が有効なまま
    const second = initProject({ projectDir: dir });
    assert.equal(second.targetLang, "de");
    assert.equal(second.configWritten, false);
  });

  it("言語未指定なら config.json を作らず既定の ja になる", () => {
    const dir = makeProject(`{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n`);
    const summary = initProject({ projectDir: dir });
    assert.equal(summary.targetLang, "ja");
    assert.equal(summary.configWritten, false);
    assert.equal(
      fs.existsSync(path.join(dir, ".yakudoc", "config.json")),
      false
    );
  });

  it("未対応の言語コードは tsconfig を書き換える前にエラーにする", () => {
    const tsconfigText = `{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n`;
    const dir = makeProject(tsconfigText);
    assert.throws(
      () => initProject({ projectDir: dir, targetLang: "xx" }),
      /未対応の言語コード/
    );
    assert.equal(
      fs.readFileSync(path.join(dir, "tsconfig.json"), "utf8"),
      tsconfigText
    );
  });

  it("--out を指定しても config.json は .yakudoc/config.json に保存される", () => {
    const dir = makeProject(`{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n`);

    const summary = initProject({
      projectDir: dir,
      targetLang: "de",
      outPath: path.join("build", "translations.json"),
    });

    assert.equal(summary.configPath, path.join(dir, ".yakudoc", "config.json"));
    assert.ok(fs.existsSync(summary.configPath));
    // translations.json 側は --out に従う
    assert.equal(
      summary.extract.outPath,
      path.join(dir, "build", "translations.json")
    );
  });

  it("extends 先から plugins を継承している場合、継承分を含めて登録する", () => {
    const dir = makeProject(
      `{\n  "extends": "./tsconfig.base.json",\n  "compilerOptions": {\n    "target": "es2022"\n  }\n}\n`,
      {
        "tsconfig.base.json": `{\n  "compilerOptions": {\n    "strict": true,\n    "plugins": [{ "name": "other-plugin" }]\n  }\n}\n`,
      }
    );

    const summary = initProject({ projectDir: dir });

    assert.equal(summary.pluginRegistered, true);
    const tsconfig = JSON.parse(
      fs.readFileSync(path.join(dir, "tsconfig.json"), "utf8")
    ) as { compilerOptions: { plugins: Array<{ name: string }> } };
    // TS のマージはキー単位の置換のため、other-plugin を含めないと失効する
    assert.deepEqual(
      tsconfig.compilerOptions.plugins.map((plugin) => plugin.name),
      ["other-plugin", "yakudoc-ts-plugin"]
    );
  });

  it("extends 先で登録済みならローカル tsconfig を書き換えない", () => {
    const tsconfigText = `{\n  "extends": "./tsconfig.base.json"\n}\n`;
    const dir = makeProject(tsconfigText, {
      "tsconfig.base.json": `{\n  "compilerOptions": {\n    "plugins": [{ "name": "yakudoc-ts-plugin" }]\n  }\n}\n`,
    });

    const summary = initProject({ projectDir: dir });

    assert.equal(summary.pluginRegistered, false);
    assert.equal(
      fs.readFileSync(path.join(dir, "tsconfig.json"), "utf8"),
      tsconfigText
    );
  });
});
