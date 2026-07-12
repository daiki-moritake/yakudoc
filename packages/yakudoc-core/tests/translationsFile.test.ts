import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import type { ExtractedComment } from "../src/extract";
import {
  mergeTranslations,
  needsTranslation,
  readTranslations,
  writeTranslations,
} from "../src/translationsFile";

const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function item(hash: string, original: string, symbol = "src/a.ts#x"): ExtractedComment {
  return { hash, original, symbol };
}

describe("needsTranslation", () => {
  it("訳文が空なら翻訳待ち", () => {
    assert.equal(needsTranslation({ original: "A.", translated: "" }, "ja"), true);
  });

  it("言語タグが翻訳先と一致すれば翻訳済み", () => {
    assert.equal(
      needsTranslation({ original: "A.", translated: "訳A", lang: "ja" }, "ja"),
      false
    );
  });

  it("言語タグが翻訳先と異なれば翻訳待ちに戻る", () => {
    assert.equal(
      needsTranslation({ original: "A.", translated: "訳A", lang: "ja" }, "de"),
      true
    );
  });

  it("言語タグが無い既存エントリは現在の翻訳先の訳とみなす", () => {
    assert.equal(
      needsTranslation({ original: "A.", translated: "訳A" }, "de"),
      false
    );
  });
});

describe("mergeTranslations", () => {
  it("新規原文は翻訳待ちとして追加される", () => {
    const { merged, stats } = mergeTranslations({}, [item("aaaa", "Hello.")], {
      prune: false,
    });
    assert.deepEqual(merged.aaaa, {
      original: "Hello.",
      translated: "",
      symbol: "src/a.ts#x",
    });
    assert.equal(stats.untranslated, 1);
  });

  it("ハッシュが一致する既存の訳文は保持し、symbol は最新に更新する", () => {
    const existing = {
      aaaa: { original: "Hello.", translated: "こんにちは。", symbol: "old.ts#y" },
    };
    const { merged, stats } = mergeTranslations(
      existing,
      [item("aaaa", "Hello.")],
      { prune: false }
    );
    assert.equal(merged.aaaa.translated, "こんにちは。");
    assert.equal(merged.aaaa.symbol, "src/a.ts#x");
    assert.equal(stats.translated, 1);
  });

  it("訳文を引き継ぐとき言語タグも引き継ぐ", () => {
    const existing = {
      aaaa: { original: "Hello.", translated: "こんにちは。", lang: "ja" },
    };
    const { merged } = mergeTranslations(existing, [item("aaaa", "Hello.")], {
      prune: false,
    });
    assert.equal(merged.aaaa.lang, "ja");
  });

  it("抽出に現れなかったエントリは既定で残し、prune で削除する", () => {
    const existing = {
      gone: { original: "Removed.", translated: "削除済み。" },
    };
    const kept = mergeTranslations(existing, [], { prune: false });
    assert.ok(kept.merged.gone);
    assert.equal(kept.stats.stale, 1);

    const pruned = mergeTranslations(existing, [], { prune: true });
    assert.equal(pruned.merged.gone, undefined);
    assert.equal(pruned.stats.stale, 1);
  });
});

describe("read / write", () => {
  it("symbol → original 順に整列して書き出し、読み戻せる", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-file-test-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, ".yakudoc", "translations.json");

    writeTranslations(filePath, {
      bbbb: { original: "B text.", translated: "", symbol: "src/b.ts#b" },
      aaaa: { original: "A text.", translated: "訳A", symbol: "src/a.ts#a" },
    });

    const raw = fs.readFileSync(filePath, "utf8");
    assert.ok(raw.indexOf('"aaaa"') < raw.indexOf('"bbbb"'));
    assert.ok(raw.endsWith("\n"));

    const roundTripped = readTranslations(filePath)!;
    assert.equal(roundTripped.aaaa.translated, "訳A");
  });

  it("存在しないファイルは undefined を返す", () => {
    assert.equal(readTranslations("/no/such/file.json"), undefined);
  });
});
