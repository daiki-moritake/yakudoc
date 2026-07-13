import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { writeConfig } from "../src/config";
import { packPathFor, writePack } from "../src/packs";
import { computeStatus, statusExitCode, statusProject } from "../src/status";
import { writeTranslations } from "../src/translationsFile";
import type { TranslationsFile } from "../src/types";

const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("computeStatus", () => {
  it("翻訳済み・翻訳待ちを集計する", () => {
    const translations: TranslationsFile = {
      a: { original: "A.", translated: "訳A", symbol: "src/a.ts#a" },
      b: { original: "B.", translated: "", symbol: "src/b.ts#b" },
      c: { original: "C.", translated: "訳C", symbol: "src/c.ts#c" },
    };
    const status = computeStatus(translations);
    assert.equal(status.total, 3);
    assert.equal(status.translated, 2);
    assert.equal(status.untranslated, 1);
    assert.equal(status.pending.length, 1);
    assert.equal(status.pending[0].symbol, "src/b.ts#b");
    assert.equal(status.pending[0].original, "B.");
  });

  it("翻訳待ちを symbol → original 順に並べる", () => {
    const translations: TranslationsFile = {
      z: { original: "Zeta.", translated: "", symbol: "src/z.ts#z" },
      a: { original: "Alpha.", translated: "", symbol: "src/a.ts#a" },
      m1: { original: "Second.", translated: "", symbol: "src/m.ts#m" },
      m0: { original: "First.", translated: "", symbol: "src/m.ts#m" },
    };
    const { pending } = computeStatus(translations);
    assert.deepEqual(
      pending.map((entry) => entry.original),
      ["Alpha.", "First.", "Second.", "Zeta."]
    );
  });

  it("symbol が無いエントリは空文字列で扱う", () => {
    const translations: TranslationsFile = {
      a: { original: "No symbol.", translated: "" },
    };
    const { pending } = computeStatus(translations);
    assert.equal(pending[0].symbol, "");
  });

  it("空のファイルは total 0 になる", () => {
    const status = computeStatus({});
    assert.deepEqual(status, {
      total: 0,
      translated: 0,
      untranslated: 0,
      pending: [],
    });
  });

  it("訳文の言語が翻訳先と異なるエントリは翻訳待ちに数える", () => {
    const translations: TranslationsFile = {
      a: { original: "A.", translated: "訳A", lang: "ja", symbol: "src/a.ts#a" },
      b: {
        original: "B.",
        translated: "Übersetzung B",
        lang: "de",
        symbol: "src/b.ts#b",
      },
      // lang 無しの既存エントリは現在の翻訳先の訳とみなす
      c: { original: "C.", translated: "訳C", symbol: "src/c.ts#c" },
    };
    const status = computeStatus(translations, "de");
    assert.equal(status.translated, 2);
    assert.equal(status.untranslated, 1);
    assert.equal(status.pending[0].symbol, "src/a.ts#a");
  });
});

describe("statusExitCode", () => {
  it("--fail-on-pending 指定時、翻訳待ちがあれば 1", () => {
    assert.equal(statusExitCode({ untranslated: 3 }, { failOnPending: true }), 1);
  });

  it("--fail-on-pending 指定でも翻訳待ちが無ければ 0", () => {
    assert.equal(statusExitCode({ untranslated: 0 }, { failOnPending: true }), 0);
  });

  it("フラグ未指定なら翻訳待ちがあっても 0", () => {
    assert.equal(statusExitCode({ untranslated: 3 }, { failOnPending: false }), 0);
  });
});

describe("statusProject", () => {
  it("translations.json を読んで進捗を返す", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-status-"));
    tempDirs.push(dir);
    const outPath = path.join(dir, ".yakudoc", "translations.json");
    writeTranslations(outPath, {
      a: { original: "A.", translated: "訳A", symbol: "src/a.ts#a" },
      b: { original: "B.", translated: "", symbol: "src/b.ts#b" },
    });

    const summary = statusProject({ projectDir: dir })!;
    assert.equal(summary.outPath, outPath);
    assert.equal(summary.total, 2);
    assert.equal(summary.translated, 1);
    assert.equal(summary.untranslated, 1);
  });

  it("ファイルが無ければ undefined を返す", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-status-"));
    tempDirs.push(dir);
    assert.equal(statusProject({ projectDir: dir }), undefined);
  });

  it("config.json の翻訳先言語で集計する(言語切替後の旧訳は翻訳待ち)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-status-"));
    tempDirs.push(dir);
    writeTranslations(path.join(dir, ".yakudoc", "translations.json"), {
      a: { original: "A.", translated: "訳A", lang: "ja", symbol: "src/a.ts#a" },
    });
    writeConfig(path.join(dir, ".yakudoc", "config.json"), { targetLang: "de" });

    const summary = statusProject({ projectDir: dir })!;
    assert.equal(summary.targetLang, "de");
    assert.equal(summary.untranslated, 1);
    assert.equal(summary.translated, 0);
  });
});

describe("statusProject(翻訳パック)", () => {
  it("translations.json とパックを合算し、内訳を返す", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-status-"));
    tempDirs.push(dir);
    writeTranslations(path.join(dir, ".yakudoc", "translations.json"), {
      p1: { original: "Project doc.", translated: "訳。", symbol: "src/a.ts#a" },
      p2: { original: "Pending doc.", translated: "", symbol: "src/b.ts#b" },
    });
    writePack(packPathFor(dir, "zod"), {
      name: "zod",
      version: "3.0.0",
      lang: "ja",
      entries: {
        z1: { original: "Parses.", translated: "解析。", lang: "ja" },
        z2: { original: "Validates.", translated: "" },
      },
    });

    const summary = statusProject({ projectDir: dir })!;
    assert.equal(summary.total, 4);
    assert.equal(summary.translated, 2);
    assert.equal(summary.untranslated, 2);
    assert.equal(summary.project?.total, 2);
    assert.deepEqual(
      summary.packs.map((pack) => [pack.name, pack.version, pack.translated]),
      [["zod", "3.0.0", 1]]
    );
  });

  it("同じ原文が複数ファイルにあっても翻訳待ちは 1 件に数える", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-status-"));
    tempDirs.push(dir);
    writeTranslations(path.join(dir, ".yakudoc", "translations.json"), {
      shared: { original: "Shared doc.", translated: "" },
    });
    writePack(packPathFor(dir, "zod"), {
      name: "zod",
      version: "3.0.0",
      lang: "ja",
      entries: { shared: { original: "Shared doc.", translated: "" } },
    });

    const summary = statusProject({ projectDir: dir })!;
    assert.equal(summary.total, 1);
    assert.equal(summary.untranslated, 1);
  });

  it("translations.json が無くパックだけでも集計できる", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-status-"));
    tempDirs.push(dir);
    writePack(packPathFor(dir, "zod"), {
      name: "zod",
      version: "3.0.0",
      lang: "ja",
      entries: { z1: { original: "Parses.", translated: "" } },
    });

    const summary = statusProject({ projectDir: dir })!;
    assert.equal(summary.project, undefined);
    assert.equal(summary.total, 1);
    assert.equal(summary.packs.length, 1);
  });
});
