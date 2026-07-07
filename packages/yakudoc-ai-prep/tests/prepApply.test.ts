import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { hashText, readTranslations, writeTranslations } from "yakudoc-core";
import { applyResponse } from "../src/apply";
import { prepare } from "../src/prep";

const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const PENDING = "Returns the `UserData` object. See {@link fetchUser}.";
const DONE = "Fetches user data from the API.";

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-ai-prep-test-"));
  tempDirs.push(dir);
  writeTranslations(path.join(dir, ".yakudoc", "translations.json"), {
    [hashText(PENDING)]: {
      original: PENDING,
      translated: "",
      symbol: "src/a.ts#getUserData",
    },
    [hashText(DONE)]: {
      original: DONE,
      translated: "APIからユーザーデータを取得します。",
      symbol: "src/a.ts#fetchUser",
    },
  });
  return dir;
}

describe("prepare", () => {
  it("翻訳待ちエントリだけを保護済みで request.json に書き出す", () => {
    const dir = makeProject();
    const summary = prepare({ projectDir: dir })!;
    assert.equal(summary.pending, 1);

    const request = JSON.parse(fs.readFileSync(summary.requestPath, "utf8"));
    const entry = request.entries[hashText(PENDING)];
    assert.equal(entry.source, "Returns the ⟦0⟧ object. See ⟦1⟧.");
    assert.deepEqual(entry.placeholders, ["`UserData`", "{@link fetchUser}"]);
    // 翻訳済みエントリは含まれない
    assert.equal(request.entries[hashText(DONE)], undefined);

    // prompt.md に保護済み原文と用語集の案内が含まれる
    const prompt = fs.readFileSync(summary.promptPath, "utf8");
    assert.ok(prompt.includes("Returns the ⟦0⟧ object."));
    assert.ok(prompt.includes("glossary.json"));

    // 空の用語集が作成される
    assert.deepEqual(
      JSON.parse(fs.readFileSync(summary.glossaryPath, "utf8")),
      {}
    );
  });

  it("用語集があれば prompt.md に反映される", () => {
    const dir = makeProject();
    fs.mkdirSync(path.join(dir, ".yakudoc"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".yakudoc", "glossary.json"),
      JSON.stringify({ user: "ユーザー" })
    );
    const summary = prepare({ projectDir: dir })!;
    assert.ok(
      fs.readFileSync(summary.promptPath, "utf8").includes("- user → ユーザー")
    );
  });

  it("翻訳待ちが無ければ undefined を返し、ファイルを生成しない", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-ai-empty-"));
    tempDirs.push(dir);
    writeTranslations(path.join(dir, ".yakudoc", "translations.json"), {
      [hashText(DONE)]: { original: DONE, translated: "訳済み。" },
    });
    assert.equal(prepare({ projectDir: dir }), undefined);
    assert.equal(fs.existsSync(path.join(dir, ".yakudoc", "ai")), false);
  });

  it("translations.json が無ければエラーになる", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-ai-none-"));
    tempDirs.push(dir);
    assert.throws(() => prepare({ projectDir: dir }), /extract/);
  });
});

describe("applyResponse", () => {
  it("訳文を書き戻し、プレースホルダーを復元する", () => {
    const dir = makeProject();
    prepare({ projectDir: dir });

    const responsePath = path.join(dir, ".yakudoc", "ai", "response.json");
    fs.writeFileSync(
      responsePath,
      JSON.stringify({
        [hashText(PENDING)]: "⟦0⟧ オブジェクトを返します。⟦1⟧ を参照してください。",
      })
    );

    const summary = applyResponse({ projectDir: dir, applyPath: responsePath });
    assert.equal(summary.applied, 1);
    assert.deepEqual(summary.skipped, []);

    const translations = readTranslations(
      path.join(dir, ".yakudoc", "translations.json")
    )!;
    assert.equal(
      translations[hashText(PENDING)].translated,
      "`UserData` オブジェクトを返します。{@link fetchUser} を参照してください。"
    );
    // 既存の訳は影響を受けない
    assert.equal(
      translations[hashText(DONE)].translated,
      "APIからユーザーデータを取得します。"
    );
  });

  it("トークンが欠けた訳文は採用せず理由を報告する", () => {
    const dir = makeProject();
    prepare({ projectDir: dir });

    const responsePath = path.join(dir, ".yakudoc", "ai", "response.json");
    fs.writeFileSync(
      responsePath,
      JSON.stringify({ [hashText(PENDING)]: "トークンを失った訳文。" })
    );

    const summary = applyResponse({ projectDir: dir, applyPath: responsePath });
    assert.equal(summary.applied, 0);
    assert.equal(summary.skipped.length, 1);
    assert.ok(summary.skipped[0].includes("⟦0⟧"));

    const translations = readTranslations(
      path.join(dir, ".yakudoc", "translations.json")
    )!;
    assert.equal(translations[hashText(PENDING)].translated, "");
  });

  it("```json フェンス付きの LLM 出力をそのまま保存しても解釈できる", () => {
    const dir = makeProject();
    prepare({ projectDir: dir });

    const responsePath = path.join(dir, ".yakudoc", "ai", "response.json");
    fs.writeFileSync(
      responsePath,
      "以下が翻訳結果です。\n```json\n" +
        JSON.stringify({
          [hashText(PENDING)]: "⟦0⟧ を返します。⟦1⟧ も参照。",
        }) +
        "\n```\n"
    );

    const summary = applyResponse({ projectDir: dir, applyPath: responsePath });
    assert.equal(summary.applied, 1);
  });

  it("不明なキーはスキップして報告する", () => {
    const dir = makeProject();
    prepare({ projectDir: dir });
    const responsePath = path.join(dir, ".yakudoc", "ai", "response.json");
    fs.writeFileSync(
      responsePath,
      JSON.stringify({ ffffffff: "存在しないキーの訳文。" })
    );
    const summary = applyResponse({ projectDir: dir, applyPath: responsePath });
    assert.equal(summary.applied, 0);
    assert.equal(summary.skipped.length, 1);
  });
});
