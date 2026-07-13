import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { packPathFor, readPack, writePack } from "../src/packs";
import {
  applyTranslation,
  collectPending,
  loadProjectSources,
  loadSourcesAt,
  writeSources,
} from "../src/translationSet";
import {
  readTranslations,
  resolveTranslationsPath,
  writeTranslations,
} from "../src/translationsFile";

const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const SHARED = "Returns a promise.";

/** translations.json + パック 2 つを持つプロジェクトを作る */
function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-set-test-"));
  tempDirs.push(dir);
  writeTranslations(resolveTranslationsPath(dir), {
    proj1: { original: "Project doc.", translated: "" },
    shared: { original: SHARED, translated: "" },
  });
  writePack(packPathFor(dir, "zod"), {
    name: "zod",
    version: "3.0.0",
    lang: "ja",
    entries: {
      zod1: { original: "Parses input.", translated: "解析します。", lang: "ja" },
      shared: { original: SHARED, translated: "" },
    },
  });
  writePack(packPathFor(dir, "axios"), {
    name: "axios",
    version: "1.7.0",
    lang: "ja",
    entries: {
      ax1: { original: "Sends a request.", translated: "" },
    },
  });
  return dir;
}

describe("loadProjectSources", () => {
  it("translations.json とパックを project → パック(name 順)で読み込む", () => {
    const dir = makeProject();
    const sources = loadProjectSources(dir);
    assert.deepEqual(
      sources.map((source) => [source.kind, source.label]),
      [
        ["project", "translations.json"],
        ["pack", "axios"],
        ["pack", "zod"],
      ]
    );
  });

  it("packages 指定でそのパックだけに絞れる。無ければ add を案内する", () => {
    const dir = makeProject();
    const sources = loadProjectSources(dir, { packages: ["zod"] });
    assert.deepEqual(sources.map((source) => source.label), ["zod"]);
    assert.throws(
      () => loadProjectSources(dir, { packages: ["missing"] }),
      /yakudoc add missing/
    );
  });

  it("translations.json が無くパックだけでも動く", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-set-test-"));
    tempDirs.push(dir);
    writePack(packPathFor(dir, "zod"), {
      name: "zod",
      version: "3.0.0",
      lang: "ja",
      entries: { a: { original: "A.", translated: "" } },
    });
    const sources = loadProjectSources(dir);
    assert.deepEqual(sources.map((source) => source.kind), ["pack"]);
  });
});

describe("loadSourcesAt", () => {
  it("パック形式と素の translations.json 形式を内容で判別する", () => {
    const dir = makeProject();
    const sources = loadSourcesAt([
      resolveTranslationsPath(dir),
      packPathFor(dir, "zod"),
      path.join(dir, "does-not-exist.json"),
    ]);
    assert.deepEqual(
      sources.map((source) => source.kind),
      ["project", "pack"]
    );
    assert.equal(sources[1].pack?.version, "3.0.0");
  });
});

describe("collectPending / applyTranslation / writeSources", () => {
  it("翻訳待ちをハッシュで重複排除して集める", () => {
    const dir = makeProject();
    const sources = loadProjectSources(dir);
    const pending = collectPending(sources, "ja");
    // proj1 + shared(2 ファイルにあるが 1 件)+ ax1。zod1 は翻訳済み
    assert.deepEqual(
      pending.map((item) => item.hash).sort(),
      ["ax1", "proj1", "shared"]
    );
  });

  it("訳文はハッシュの一致する全ファイルへ書き戻される", () => {
    const dir = makeProject();
    const sources = loadProjectSources(dir);
    const applied = applyTranslation(
      sources,
      "shared",
      "Promise を返します。",
      "ja"
    );
    assert.equal(applied, 2);
    writeSources(sources);

    const translations = readTranslations(resolveTranslationsPath(dir))!;
    assert.equal(translations.shared.translated, "Promise を返します。");
    assert.equal(translations.shared.lang, "ja");

    const pack = readPack(packPathFor(dir, "zod"))!;
    assert.equal(pack.entries.shared.translated, "Promise を返します。");
    // パックのメタデータは保持される
    assert.equal(pack.version, "3.0.0");

    // 触っていない axios のパックは書き換えない(mtime 比較の代わりに
    // dirty フラグの挙動を entries で確認する)
    const axios = readPack(packPathFor(dir, "axios"))!;
    assert.equal(axios.entries.ax1.translated, "");
  });

  it("どのファイルにも無いハッシュは 0 を返す", () => {
    const dir = makeProject();
    const sources = loadProjectSources(dir);
    assert.equal(applyTranslation(sources, "nope", "訳。", "ja"), 0);
  });
});
