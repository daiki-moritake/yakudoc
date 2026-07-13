import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import {
  hashText,
  packPathFor,
  readPack,
  readTranslations,
  writePack,
  writeTranslations,
} from "yakudoc";
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
    assert.equal(entry.source, "Returns the <ph0> object. See <ph1>.");
    assert.deepEqual(entry.placeholders, ["`UserData`", "{@link fetchUser}"]);
    // 翻訳済みエントリは含まれない
    assert.equal(request.entries[hashText(DONE)], undefined);

    // prompt.md に保護済み原文と用語集の案内が含まれる
    const prompt = fs.readFileSync(summary.promptPath, "utf8");
    assert.ok(prompt.includes("Returns the <ph0> object."));
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

  it("既定では日本語向けの依頼文と targetLanguage: ja になる", () => {
    const dir = makeProject();
    const summary = prepare({ projectDir: dir })!;

    const request = JSON.parse(fs.readFileSync(summary.requestPath, "utf8"));
    assert.equal(request.targetLanguage, "ja");
    const prompt = fs.readFileSync(summary.promptPath, "utf8");
    assert.ok(prompt.includes("yakudoc 翻訳依頼"));
    assert.ok(prompt.includes("日本語に翻訳し"));
  });

  it("targetLang が ja 以外なら英語の依頼文になる", () => {
    const dir = makeProject();
    const summary = prepare({ projectDir: dir, targetLang: "de" })!;

    const request = JSON.parse(fs.readFileSync(summary.requestPath, "utf8"));
    assert.equal(request.targetLanguage, "de");

    const prompt = fs.readFileSync(summary.promptPath, "utf8");
    assert.ok(prompt.includes("yakudoc translation request"));
    assert.ok(prompt.includes("Translate each value into **German**"));
    assert.ok(prompt.includes("Returns the <ph0> object."));
    // 依頼文の反映コマンドは言語によらず同じ
    assert.ok(prompt.includes("--apply .yakudoc/ai/response.json"));
  });

  it("ja 以外は言語別の glossary.<code>.json を使う", () => {
    const dir = makeProject();
    fs.mkdirSync(path.join(dir, ".yakudoc"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".yakudoc", "glossary.de.json"),
      JSON.stringify({ user: "Benutzer" })
    );
    const summary = prepare({ projectDir: dir, targetLang: "de" })!;
    assert.ok(summary.glossaryPath.endsWith("glossary.de.json"));
    assert.ok(
      fs.readFileSync(summary.promptPath, "utf8").includes("- user → Benutzer")
    );
  });

  it("日本語向けの glossary.json は他言語の依頼文に混入しない", () => {
    const dir = makeProject();
    fs.mkdirSync(path.join(dir, ".yakudoc"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".yakudoc", "glossary.json"),
      JSON.stringify({ callback: "コールバック" })
    );

    const summary = prepare({ projectDir: dir, targetLang: "de" })!;

    const prompt = fs.readFileSync(summary.promptPath, "utf8");
    assert.ok(!prompt.includes("コールバック"));
    // 空の言語別用語集が新設され、依頼文はそのファイル名を案内する
    assert.ok(prompt.includes("glossary.de.json"));
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(dir, ".yakudoc", "glossary.de.json"), "utf8")),
      {}
    );
  });

  it("訳文の言語が翻訳先と異なるエントリは再度書き出す", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-ai-lang-"));
    tempDirs.push(dir);
    writeTranslations(path.join(dir, ".yakudoc", "translations.json"), {
      [hashText(DONE)]: {
        original: DONE,
        translated: "APIからユーザーデータを取得します。",
        lang: "ja",
      },
    });

    const summary = prepare({ projectDir: dir, targetLang: "de" })!;
    assert.equal(summary.pending, 1);
  });

  it("未対応の targetLang はエラーにする", () => {
    const dir = makeProject();
    assert.throws(
      () => prepare({ projectDir: dir, targetLang: "xx" }),
      /未対応の言語コード/
    );
  });

  it("翻訳待ちが 0 件でも不正な言語コードはエラーにする", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-ai-lang0-"));
    tempDirs.push(dir);
    writeTranslations(path.join(dir, ".yakudoc", "translations.json"), {
      [hashText(DONE)]: { original: DONE, translated: "訳済み。" },
    });
    assert.throws(
      () => prepare({ projectDir: dir, targetLang: "xx" }),
      /未対応の言語コード/
    );
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
        [hashText(PENDING)]: "<ph0> オブジェクトを返します。<ph1> を参照してください。",
      })
    );

    const summary = applyResponse({ projectDir: dir, applyPath: responsePath });
    assert.equal(summary.applied, 1);
    assert.deepEqual(summary.skipped, []);

    const translations = readTranslations(
      path.join(dir, ".yakudoc", "translations.json")
    )!;
    // request.json の targetLanguage が言語タグとして付く
    assert.equal(translations[hashText(PENDING)].lang, "ja");
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
    assert.ok(summary.skipped[0].includes("<ph0>"));

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
          [hashText(PENDING)]: "<ph0> を返します。<ph1> も参照。",
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

describe("prepare / applyResponse(翻訳パック横断)", () => {
  const SHARED = "Shared between project and pack.";
  const PACK_ONLY = "Validates the schema.";

  /** translations.json とパックの両方に翻訳待ちを持つプロジェクト */
  function makeProjectWithPack(): { dir: string; paths: string[] } {
    const dir = makeProject();
    const translationsPath = path.join(dir, ".yakudoc", "translations.json");
    const translations = readTranslations(translationsPath)!;
    translations[hashText(SHARED)] = { original: SHARED, translated: "" };
    writeTranslations(translationsPath, translations);

    const packPath = packPathFor(dir, "zod");
    writePack(packPath, {
      name: "zod",
      version: "3.0.0",
      lang: "ja",
      entries: {
        [hashText(SHARED)]: { original: SHARED, translated: "" },
        [hashText(PACK_ONLY)]: {
          original: PACK_ONLY,
          translated: "",
          symbol: "zod/index.d.ts#validate",
        },
      },
    });
    return { dir, paths: [translationsPath, packPath] };
  }

  it("パックの翻訳待ちも 1 つの依頼にまとめ、重複は 1 件にする", () => {
    const { dir, paths } = makeProjectWithPack();
    const summary = prepare({ projectDir: dir, translationsPaths: paths })!;
    // PENDING + SHARED(2 ファイルにあるが 1 件)+ PACK_ONLY
    assert.equal(summary.pending, 3);

    const request = JSON.parse(fs.readFileSync(summary.requestPath, "utf8"));
    assert.ok(request.entries[hashText(SHARED)]);
    assert.ok(request.entries[hashText(PACK_ONLY)]);
  });

  it("書き戻しはハッシュの一致する全ファイルに反映される", () => {
    const { dir, paths } = makeProjectWithPack();
    prepare({ projectDir: dir, translationsPaths: paths });

    const responsePath = path.join(dir, ".yakudoc", "ai", "response.json");
    fs.writeFileSync(
      responsePath,
      JSON.stringify({
        [hashText(SHARED)]: "プロジェクトとパックで共有。",
        [hashText(PACK_ONLY)]: "スキーマを検証します。",
      })
    );

    const summary = applyResponse({
      projectDir: dir,
      translationsPaths: paths,
      applyPath: responsePath,
    });
    assert.equal(summary.applied, 2);

    const translations = readTranslations(paths[0])!;
    assert.equal(
      translations[hashText(SHARED)].translated,
      "プロジェクトとパックで共有。"
    );

    const pack = readPack(paths[1])!;
    assert.equal(
      pack.entries[hashText(SHARED)].translated,
      "プロジェクトとパックで共有。"
    );
    assert.equal(
      pack.entries[hashText(PACK_ONLY)].translated,
      "スキーマを検証します。"
    );
    // パックのメタデータは保持される
    assert.equal(pack.version, "3.0.0");
    assert.equal(pack.lang, "ja");
  });
});
