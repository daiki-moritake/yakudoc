import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { hashText, readTranslations, writeTranslations } from "yakudoc";
import { translatePending, type TranslateFn } from "../src/engine";

const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const PENDING_PLAIN = "Adds two numbers.";
const PENDING_PROTECTED = "Returns the `UserData` object.";
const DONE = "Fetches user data from the API.";

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-mt-test-"));
  tempDirs.push(dir);
  writeTranslations(path.join(dir, ".yakudoc", "translations.json"), {
    [hashText(PENDING_PLAIN)]: { original: PENDING_PLAIN, translated: "" },
    [hashText(PENDING_PROTECTED)]: { original: PENDING_PROTECTED, translated: "" },
    [hashText(DONE)]: {
      original: DONE,
      translated: "APIからユーザーデータを取得します。",
    },
  });
  return path.join(dir, ".yakudoc", "translations.json");
}

/** 決め打ちの辞書で応答するフェイク翻訳関数 */
const fakeTranslate: TranslateFn = async (texts) =>
  texts.map((text) =>
    text
      .replace("Adds two numbers.", "2つの数を加算します。")
      .replace("Returns the <ph0> object.", "<ph0> オブジェクトを返します。")
  );

describe("translatePending", () => {
  it("翻訳待ちだけを翻訳し、プレースホルダーを復元して書き込む", async () => {
    const translationsPath = makeProject();
    const summary = await translatePending(translationsPath, fakeTranslate);

    assert.equal(summary.pending, 2);
    assert.equal(summary.applied, 2);
    assert.deepEqual(summary.skipped, []);

    const translations = readTranslations(translationsPath)!;
    assert.equal(
      translations[hashText(PENDING_PLAIN)].translated,
      "2つの数を加算します。"
    );
    assert.equal(
      translations[hashText(PENDING_PROTECTED)].translated,
      "`UserData` オブジェクトを返します。"
    );
    // 翻訳済みエントリには触れない
    assert.equal(
      translations[hashText(DONE)].translated,
      "APIからユーザーデータを取得します。"
    );
  });

  it("保護トークンを失った訳文は採用せず翻訳待ちのまま残す", async () => {
    const translationsPath = makeProject();
    const broken: TranslateFn = async (texts) =>
      texts.map(() => "トークンを含まない訳文。");

    const summary = await translatePending(translationsPath, broken);
    assert.equal(summary.applied, 1); // 保護なしの原文だけ採用される
    assert.equal(summary.skipped.length, 1);

    const translations = readTranslations(translationsPath)!;
    assert.equal(translations[hashText(PENDING_PROTECTED)].translated, "");
  });

  it("バッチサイズごとに分割して翻訳関数を呼ぶ", async () => {
    const translationsPath = makeProject();
    const batchSizes: number[] = [];
    const recording: TranslateFn = async (texts) => {
      batchSizes.push(texts.length);
      return fakeTranslate(texts);
    };

    await translatePending(translationsPath, recording, () => {}, 1);
    assert.deepEqual(batchSizes, [1, 1]);
  });

  it("翻訳結果の件数が合わない場合はエラーにする", async () => {
    const translationsPath = makeProject();
    const short: TranslateFn = async () => [];
    await assert.rejects(
      translatePending(translationsPath, short),
      /件数が一致しません/
    );
  });

  it("書き込んだ訳文には言語タグが付く", async () => {
    const translationsPath = makeProject();
    await translatePending(translationsPath, fakeTranslate);

    const translations = readTranslations(translationsPath)!;
    assert.equal(translations[hashText(PENDING_PLAIN)].lang, "ja");
    // 触れていない翻訳済みエントリにはタグを付けない
    assert.equal(translations[hashText(DONE)].lang, undefined);
  });

  it("翻訳先言語と異なる言語タグの訳は翻訳し直す", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-mt-lang-"));
    tempDirs.push(dir);
    const translationsPath = path.join(dir, ".yakudoc", "translations.json");
    writeTranslations(translationsPath, {
      [hashText(PENDING_PLAIN)]: {
        original: PENDING_PLAIN,
        translated: "2つの数を加算します。",
        lang: "ja",
      },
    });

    const german: TranslateFn = async (texts) =>
      texts.map(() => "Addiert zwei Zahlen.");
    const summary = await translatePending(
      translationsPath,
      german,
      () => {},
      4,
      "de"
    );

    assert.equal(summary.pending, 1);
    const translations = readTranslations(translationsPath)!;
    assert.equal(
      translations[hashText(PENDING_PLAIN)].translated,
      "Addiert zwei Zahlen."
    );
    assert.equal(translations[hashText(PENDING_PLAIN)].lang, "de");
  });

  it("翻訳待ちが無ければ翻訳関数を呼ばない", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-mt-empty-"));
    tempDirs.push(dir);
    const translationsPath = path.join(dir, ".yakudoc", "translations.json");
    writeTranslations(translationsPath, {
      [hashText(DONE)]: { original: DONE, translated: "訳済み。" },
    });

    let called = false;
    const summary = await translatePending(translationsPath, async (texts) => {
      called = true;
      return texts;
    });
    assert.equal(summary.pending, 0);
    assert.equal(called, false);
  });
});
