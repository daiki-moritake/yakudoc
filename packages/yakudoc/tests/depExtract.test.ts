import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import {
  collectDeclarationFiles,
  extractInstalledPackage,
  resolveInstalledPackageInfo,
} from "../src/depExtract";
import { hashText } from "../src/normalize";

const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** node_modules にフェイクのパッケージを持つプロジェクトを作る */
function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-dep-test-"));
  tempDirs.push(dir);

  const write = (relative: string, content: string): void => {
    const filePath = path.join(dir, relative);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  };

  write(
    "node_modules/foo/package.json",
    JSON.stringify({ name: "foo", version: "1.2.3", types: "index.d.ts" })
  );
  write(
    "node_modules/foo/index.d.ts",
    `/** Parses the given input. */\nexport declare function parse(input: string): unknown;\n`
  );
  write(
    "node_modules/foo/lib/extra.d.ts",
    `/** Formats a value. */\nexport declare function format(value: unknown): string;\n`
  );
  // 対象外: 入れ子の node_modules・型定義でないファイル
  write(
    "node_modules/foo/node_modules/nested/nested.d.ts",
    `/** Should be ignored. */\nexport declare const nested: number;\n`
  );
  write("node_modules/foo/src/impl.ts", `/** Not a declaration. */\nexport const x = 1;\n`);

  write(
    "node_modules/@scope/bar/package.json",
    JSON.stringify({ name: "@scope/bar", version: "0.9.0" })
  );
  write(
    "node_modules/@scope/bar/index.d.mts",
    `/** Scoped helper. */\nexport declare function help(): void;\n`
  );

  // 型定義を持たないパッケージ
  write(
    "node_modules/no-types/package.json",
    JSON.stringify({ name: "no-types", version: "2.0.0", main: "index.js" })
  );
  write("node_modules/no-types/index.js", "module.exports = {};\n");

  return dir;
}

describe("resolveInstalledPackageInfo", () => {
  it("パッケージの場所とバージョンを返す", () => {
    const dir = makeProject();
    const info = resolveInstalledPackageInfo(dir, "foo");
    assert.equal(info.version, "1.2.3");
    // require.resolve は realpath を返す(macOS では /var → /private/var)
    assert.equal(
      info.dir,
      fs.realpathSync(path.join(dir, "node_modules", "foo"))
    );
  });

  it("未インストールならインストール手順付きのエラー", () => {
    const dir = makeProject();
    assert.throws(
      () => resolveInstalledPackageInfo(dir, "missing-pkg"),
      /npm install missing-pkg/
    );
  });
});

describe("collectDeclarationFiles", () => {
  it(".d.ts / .d.mts を集め、入れ子の node_modules と非型定義は除外する", () => {
    const dir = makeProject();
    const files = collectDeclarationFiles(path.join(dir, "node_modules", "foo"));
    assert.deepEqual(
      files.map((file) => path.relative(path.join(dir, "node_modules", "foo"), file)),
      ["index.d.ts", path.join("lib", "extra.d.ts")]
    );
  });
});

describe("extractInstalledPackage", () => {
  it("型定義の JSDoc を抽出し、symbol にパッケージ名からのパスを付ける", () => {
    const dir = makeProject();
    const { info, fileCount, comments } = extractInstalledPackage(dir, "foo");
    assert.equal(info.version, "1.2.3");
    assert.equal(fileCount, 2);

    const byOriginal = new Map(comments.map((c) => [c.original, c]));
    assert.equal(
      byOriginal.get("Parses the given input.")?.symbol,
      "foo/index.d.ts#parse"
    );
    assert.equal(
      byOriginal.get("Formats a value.")?.symbol,
      "foo/lib/extra.d.ts#format"
    );
    assert.equal(byOriginal.has("Should be ignored."), false);
    assert.equal(
      byOriginal.get("Parses the given input.")?.hash,
      hashText("Parses the given input.")
    );
  });

  it("スコープ付きパッケージも抽出できる", () => {
    const dir = makeProject();
    const { comments } = extractInstalledPackage(dir, "@scope/bar");
    assert.equal(comments[0].symbol, "@scope/bar/index.d.mts#help");
  });

  it("型定義が無いパッケージは案内付きのエラー", () => {
    const dir = makeProject();
    assert.throws(
      () => extractInstalledPackage(dir, "no-types"),
      /型定義ファイル(.|\n)*@types/
    );
  });
});
