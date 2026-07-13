import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import * as ts from "typescript";
import { extractFromSourceFile, extractProject } from "../src/extract";
import { hashText } from "../src/normalize";
import { readTranslations, writeTranslations } from "../src/translationsFile";

function extract(source: string, relativePath = "src/user.ts") {
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true
  );
  return extractFromSourceFile(sourceFile, relativePath);
}

const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("extractFromSourceFile", () => {
  it("説明文・@param・@returns を抽出し、ハッシュキーを付ける", () => {
    const results = extract(`/**
 * Fetches user data from the API.
 * @param id The user id.
 * @returns The user's display name.
 */
export function fetchUser(id: string): string { return id; }
`);
    const originals = results.map((r) => r.original);
    assert.deepEqual(originals, [
      "Fetches user data from the API.",
      "The user id.",
      "The user's display name.",
    ]);
    assert.equal(results[0].hash, hashText("Fetches user data from the API."));
    assert.equal(results[0].symbol, "src/user.ts#fetchUser");
  });

  it("@example と @see のコメントは抽出しない", () => {
    const results = extract(`/**
 * Adds two numbers.
 * @example
 * add(1, 2);
 * @see https://example.com/docs
 */
export function add(a: number, b: number): number { return a + b; }
`);
    assert.deepEqual(
      results.map((r) => r.original),
      ["Adds two numbers."]
    );
  });

  it("クラスメンバー・インターフェースのプロパティはドット区切りの symbol になる", () => {
    const results = extract(`
export class Greeter {
  /** Greets the user. */
  greet(): void {}
}

export interface Session {
  /** The unique token issued at login. */
  token: string;
}
`);
    assert.deepEqual(
      results.map((r) => [r.original, r.symbol]),
      [
        ["Greets the user.", "src/user.ts#Greeter.greet"],
        ["The unique token issued at login.", "src/user.ts#Session.token"],
      ]
    );
  });

  it("変数宣言に付いた JSDoc は変数名を symbol にする", () => {
    const results = extract(`/** Handles a click. */
export const onClick = () => {};
`);
    assert.deepEqual(
      results.map((r) => [r.original, r.symbol]),
      [["Handles a click.", "src/user.ts#onClick"]]
    );
  });

  it("同一原文はファイル内で 1 件にまとめる", () => {
    const results = extract(`/** Same text. */
export const a = 1;
/** Same text. */
export const b = 2;
`);
    assert.equal(results.length, 1);
    assert.equal(results[0].symbol, "src/user.ts#a");
  });
});

describe("extractProject", () => {
  function makeProject(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-extract-test-"));
    tempDirs.push(dir);
    fs.writeFileSync(
      path.join(dir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true }, include: ["src"] })
    );
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(
      path.join(dir, "src", "user.ts"),
      `/**
 * Fetches user data from the API.
 * @param id The user id.
 */
export function fetchUser(id: string): string { return id; }
`
    );
    return dir;
  }

  it("翻訳待ちファイルを生成する", () => {
    const dir = makeProject();
    const summary = extractProject({ projectDir: dir });
    assert.equal(summary.extracted, 2);
    assert.equal(summary.untranslated, 2);

    const data = readTranslations(summary.outPath)!;
    const entry = data[hashText("Fetches user data from the API.")];
    assert.equal(entry.original, "Fetches user data from the API.");
    assert.equal(entry.translated, "");
    assert.equal(entry.symbol, "src/user.ts#fetchUser");
  });

  it("再抽出しても既存の訳文は保持される(差分翻訳)", () => {
    const dir = makeProject();
    const first = extractProject({ projectDir: dir });

    const data = readTranslations(first.outPath)!;
    data[hashText("Fetches user data from the API.")].translated =
      "APIからユーザーデータを取得します。";
    writeTranslations(first.outPath, data);

    const second = extractProject({ projectDir: dir });
    assert.equal(second.translated, 1);
    assert.equal(second.untranslated, 1);
    assert.equal(
      readTranslations(second.outPath)![
        hashText("Fetches user data from the API.")
      ].translated,
      "APIからユーザーデータを取得します。"
    );
  });

  it("原文が変わるとそのエントリだけ翻訳待ちに戻り、旧エントリは --prune で消える", () => {
    const dir = makeProject();
    const first = extractProject({ projectDir: dir });
    const data = readTranslations(first.outPath)!;
    for (const entry of Object.values(data)) {
      entry.translated = "訳";
    }
    writeTranslations(first.outPath, data);

    fs.writeFileSync(
      path.join(dir, "src", "user.ts"),
      `/**
 * Fetches user data from the API. (v2)
 * @param id The user id.
 */
export function fetchUser(id: string): string { return id; }
`
    );

    const kept = extractProject({ projectDir: dir });
    assert.equal(kept.untranslated, 1);
    assert.equal(kept.translated, 1);
    assert.equal(kept.stale, 1);
    // 既定では旧エントリを残す
    assert.ok(
      readTranslations(kept.outPath)![
        hashText("Fetches user data from the API.")
      ]
    );

    const pruned = extractProject({ projectDir: dir, prune: true });
    assert.equal(pruned.stale, 1);
    assert.equal(
      readTranslations(pruned.outPath)![
        hashText("Fetches user data from the API.")
      ],
      undefined
    );
  });

  it("tsconfig.json が無い場合はエラーになる", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-noconfig-"));
    tempDirs.push(dir);
    assert.throws(() => extractProject({ projectDir: dir }), /tsconfig/);
  });
});
