import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { hashText } from "yakudoc-core";
import { TranslationStore, TranslationsFile } from "../src/translationStore";

const tempDirs: string[] = [];

function makeProjectDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-store-test-"));
  tempDirs.push(dir);
  return dir;
}

function writeTranslations(root: string, data: TranslationsFile): string {
  const filePath = path.join(root, ".yakudoc", "translations.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

function makeStore(root: string): TranslationStore {
  // テストでは毎回リロード判定させたいのでスロットリングを無効化する
  return new TranslationStore(root, () => undefined, () => {}, 0);
}

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("TranslationStore", () => {
  const original = "Fetches user data from the API.";
  const translated = "APIからユーザーデータを取得します。";

  it("ハッシュキーで訳文を引ける", () => {
    const root = makeProjectDir();
    writeTranslations(root, {
      [hashText(original)]: { original, translated },
    });
    assert.equal(makeStore(root).translate(original), translated);
  });

  it("表記ゆれ(CRLF・インデント)のある原文でも一致する", () => {
    const root = makeProjectDir();
    writeTranslations(root, {
      [hashText(original)]: { original, translated },
    });
    assert.equal(
      makeStore(root).translate("  Fetches user data from the API.  "),
      translated
    );
  });

  it("キーのハッシュが実装と異なっていても original から引き直せる", () => {
    const root = makeProjectDir();
    writeTranslations(root, {
      deadbeef: { original, translated },
    });
    assert.equal(makeStore(root).translate(original), translated);
  });

  it("未訳(translated が空)のエントリは undefined を返す", () => {
    const root = makeProjectDir();
    writeTranslations(root, {
      [hashText(original)]: { original, translated: "" },
    });
    assert.equal(makeStore(root).translate(original), undefined);
  });

  it("translations.json が無い場合は undefined を返し、後から作成されれば拾う", () => {
    const root = makeProjectDir();
    const store = makeStore(root);
    assert.equal(store.translate(original), undefined);

    writeTranslations(root, {
      [hashText(original)]: { original, translated },
    });
    assert.equal(store.translate(original), translated);
  });

  it("親ディレクトリの .yakudoc も探索する(モノレポ対応)", () => {
    const root = makeProjectDir();
    writeTranslations(root, {
      [hashText(original)]: { original, translated },
    });
    const nested = path.join(root, "packages", "app");
    fs.mkdirSync(nested, { recursive: true });
    assert.equal(makeStore(nested).translate(original), translated);
  });

  it("ファイル更新を検知して再読み込みする", async () => {
    const root = makeProjectDir();
    const store = makeStore(root);
    writeTranslations(root, {
      [hashText(original)]: { original, translated },
    });
    assert.equal(store.translate(original), translated);

    await new Promise((resolve) => setTimeout(resolve, 10));
    const updated = "APIからユーザー情報を取得します。";
    writeTranslations(root, {
      [hashText(original)]: { original, translated: updated },
    });
    assert.equal(store.translate(original), updated);
  });

  it("壊れた JSON は読み飛ばして直前の状態を維持する", async () => {
    const root = makeProjectDir();
    const store = makeStore(root);
    const filePath = writeTranslations(root, {
      [hashText(original)]: { original, translated },
    });
    assert.equal(store.translate(original), translated);

    await new Promise((resolve) => setTimeout(resolve, 10));
    fs.writeFileSync(filePath, "{ broken json");
    assert.equal(store.translate(original), translated);
  });
});
