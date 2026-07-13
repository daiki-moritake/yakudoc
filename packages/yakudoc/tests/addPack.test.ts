import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { addPackage, overlayCommunityPack } from "../src/addPack";
import { hashText } from "../src/normalize";
import { packPathFor, readPack, type PackFile } from "../src/packs";
import type { FetchLike } from "../src/registry";

const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const DOC_PARSE = "Parses the given input.";
const DOC_FORMAT = "Formats a value.";

/** node_modules/foo を持つプロジェクトを作る */
function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-add-test-"));
  tempDirs.push(dir);
  const write = (relative: string, content: string): void => {
    const filePath = path.join(dir, relative);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  };
  write(
    "node_modules/foo/package.json",
    JSON.stringify({ name: "foo", version: "1.2.3" })
  );
  write(
    "node_modules/foo/index.d.ts",
    `/** ${DOC_PARSE} */\nexport declare function parse(input: string): unknown;\n` +
      `/** ${DOC_FORMAT} */\nexport declare function format(value: unknown): string;\n`
  );
  return dir;
}

function communityFetch(entries: PackFile["entries"]): FetchLike {
  return async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({ name: "foo", version: "1.0.0", lang: "ja", entries }),
  });
}

const notFoundFetch: FetchLike = async () => ({
  ok: false,
  status: 404,
  text: async () => "Not Found",
});

describe("overlayCommunityPack", () => {
  it("翻訳待ちにだけ訳文を重ね、ローカルの訳は上書きしない", () => {
    const entries: PackFile["entries"] = {
      a: { original: "A.", translated: "" },
      b: { original: "B.", translated: "ローカルの訳。", lang: "ja" },
    };
    const community: PackFile = {
      name: "foo",
      version: "1.0.0",
      lang: "ja",
      entries: {
        a: { original: "A.", translated: "コミュニティの訳A。", lang: "ja" },
        b: { original: "B.", translated: "コミュニティの訳B。", lang: "ja" },
      },
    };
    const adopted = overlayCommunityPack(entries, community, "ja");
    assert.equal(adopted, 1);
    assert.equal(entries.a.translated, "コミュニティの訳A。");
    assert.equal(entries.b.translated, "ローカルの訳。");
  });

  it("言語の合わない訳文は採用しない", () => {
    const entries: PackFile["entries"] = {
      a: { original: "A.", translated: "" },
    };
    const community: PackFile = {
      name: "foo",
      version: "1.0.0",
      lang: "ko",
      entries: { a: { original: "A.", translated: "한국어 번역", lang: "ko" } },
    };
    assert.equal(overlayCommunityPack(entries, community, "ja"), 0);
    assert.equal(entries.a.translated, "");
  });
});

describe("addPackage", () => {
  it("抽出 + コミュニティ訳の適用 + パック書き出しまで行う", async () => {
    const dir = makeProject();
    const summary = await addPackage({
      projectDir: dir,
      packageName: "foo",
      targetLang: "ja",
      generator: "yakudoc@test",
      fetchImpl: communityFetch({
        [hashText(DOC_PARSE)]: {
          original: DOC_PARSE,
          translated: "入力を解析します。",
          lang: "ja",
        },
      }),
    });

    assert.equal(summary.version, "1.2.3");
    assert.equal(summary.total, 2);
    assert.equal(summary.fromCommunity, 1);
    assert.equal(summary.translated, 1);
    assert.equal(summary.untranslated, 1);

    const pack = readPack(packPathFor(dir, "foo"));
    assert.equal(pack?.name, "foo");
    assert.equal(pack?.version, "1.2.3");
    assert.equal(pack?.lang, "ja");
    assert.equal(pack?.generator, "yakudoc@test");
    assert.equal(
      pack?.entries[hashText(DOC_PARSE)].translated,
      "入力を解析します。"
    );
    assert.equal(pack?.entries[hashText(DOC_FORMAT)].translated, "");
  });

  it("再実行してもローカルで付けた訳文を保持する(差分翻訳)", async () => {
    const dir = makeProject();
    await addPackage({
      projectDir: dir,
      packageName: "foo",
      targetLang: "ja",
      noFetch: true,
    });

    // 手動で訳を付ける
    const packPath = packPathFor(dir, "foo");
    const pack = readPack(packPath)!;
    pack.entries[hashText(DOC_PARSE)].translated = "手動の訳。";
    pack.entries[hashText(DOC_PARSE)].lang = "ja";
    fs.writeFileSync(packPath, JSON.stringify(pack, null, 2));

    // コミュニティ側にも同じエントリの訳があるが、ローカル優先
    const summary = await addPackage({
      projectDir: dir,
      packageName: "foo",
      targetLang: "ja",
      fetchImpl: communityFetch({
        [hashText(DOC_PARSE)]: {
          original: DOC_PARSE,
          translated: "コミュニティの訳。",
          lang: "ja",
        },
      }),
    });

    assert.equal(summary.fromCommunity, 0);
    assert.equal(
      readPack(packPath)?.entries[hashText(DOC_PARSE)].translated,
      "手動の訳。"
    );
  });

  it("noFetch ならネットワークに触れない", async () => {
    const dir = makeProject();
    const summary = await addPackage({
      projectDir: dir,
      packageName: "foo",
      targetLang: "ja",
      noFetch: true,
      fetchImpl: async () => {
        throw new Error("ネットワークに触れてはいけない");
      },
    });
    assert.equal(summary.fetchResult, undefined);
    assert.equal(summary.fromCommunity, 0);
  });

  it("コミュニティパック未公開(404)でもパック作成は成功する", async () => {
    const dir = makeProject();
    const summary = await addPackage({
      projectDir: dir,
      packageName: "foo",
      targetLang: "ja",
      fetchImpl: notFoundFetch,
    });
    assert.equal(summary.fetchResult?.status, "not-found");
    assert.equal(summary.total, 2);
    assert.equal(fs.existsSync(packPathFor(dir, "foo")), true);
  });

  it("ネットワークエラーでもパック作成は成功する(結果に error を含む)", async () => {
    const dir = makeProject();
    const summary = await addPackage({
      projectDir: dir,
      packageName: "foo",
      targetLang: "ja",
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });
    assert.equal(summary.fetchResult?.status, "error");
    assert.equal(fs.existsSync(packPathFor(dir, "foo")), true);
  });
});
