import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import {
  listPacks,
  packFileNameFor,
  packPathFor,
  packageNameFromFileName,
  parsePack,
  readPack,
  removePack,
  resolvePacksDir,
  writePack,
  type PackFile,
} from "../src/packs";

const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-packs-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("packFileNameFor / packageNameFromFileName", () => {
  it("通常のパッケージ名はそのまま .json を付ける", () => {
    assert.equal(packFileNameFor("zod"), "zod.json");
    assert.equal(packageNameFromFileName("zod.json"), "zod");
  });

  it("スコープ付きパッケージの / は __ に置き換える(往復可能)", () => {
    assert.equal(packFileNameFor("@types/node"), "@types__node.json");
    assert.equal(packageNameFromFileName("@types__node.json"), "@types/node");
  });
});

describe("resolvePacksDir / packPathFor", () => {
  it("translations.json と同じ .yakudoc の下の packs を指す", () => {
    assert.equal(
      resolvePacksDir("/proj"),
      path.join("/proj", ".yakudoc", "packs")
    );
    assert.equal(
      packPathFor("/proj", "@types/node"),
      path.join("/proj", ".yakudoc", "packs", "@types__node.json")
    );
  });

  it("--out で translations.json を動かした場合はそれに追従する", () => {
    assert.equal(
      resolvePacksDir("/proj", "custom/t.json"),
      path.join("/proj", "custom", "packs")
    );
  });
});

describe("parsePack", () => {
  it("パック形式({ name, version, lang, entries })を読める", () => {
    const pack = parsePack(
      {
        name: "zod",
        version: "3.23.8",
        lang: "ja",
        entries: {
          abc: { original: "Parses input.", translated: "入力を解析します。" },
        },
      },
      "fallback"
    );
    assert.equal(pack?.name, "zod");
    assert.equal(pack?.version, "3.23.8");
    assert.equal(pack?.lang, "ja");
    assert.equal(pack?.entries.abc.translated, "入力を解析します。");
  });

  it("素の translations.json 形式も受け付け、名前はフォールバックを使う", () => {
    const pack = parsePack(
      { abc: { original: "Parses input.", translated: "" } },
      "zod"
    );
    assert.equal(pack?.name, "zod");
    assert.equal(pack?.entries.abc.original, "Parses input.");
  });

  it("original の無いエントリは読み飛ばす", () => {
    const pack = parsePack(
      {
        name: "zod",
        entries: { good: { original: "A." }, bad: { translated: "訳のみ" } },
      },
      "zod"
    );
    assert.deepEqual(Object.keys(pack?.entries ?? {}), ["good"]);
    assert.equal(pack?.entries.good.translated, "");
  });

  it("解釈できない値は undefined", () => {
    assert.equal(parsePack(null, "x"), undefined);
    assert.equal(parsePack([], "x"), undefined);
    assert.equal(parsePack({ notEntries: true }, "x"), undefined);
  });
});

describe("writePack / readPack / listPacks / removePack", () => {
  const pack: PackFile = {
    name: "@types/node",
    version: "22.1.0",
    lang: "ja",
    generator: "yakudoc@0.2.0",
    entries: {
      b: { original: "B doc.", translated: "", symbol: "@types/node/b.d.ts#b" },
      a: {
        original: "A doc.",
        translated: "Aの説明。",
        symbol: "@types/node/a.d.ts#a",
        lang: "ja",
      },
    },
  };

  it("書き出したパックを読み戻せる(メタデータ保持・symbol 順に整列)", () => {
    const dir = makeTempDir();
    const filePath = packPathFor(dir, "@types/node");
    writePack(filePath, pack);

    const loaded = readPack(filePath);
    assert.equal(loaded?.name, "@types/node");
    assert.equal(loaded?.version, "22.1.0");
    assert.equal(loaded?.lang, "ja");
    assert.equal(loaded?.generator, "yakudoc@0.2.0");
    // symbol 順(a.d.ts → b.d.ts)に整列される
    assert.deepEqual(Object.keys(loaded?.entries ?? {}), ["a", "b"]);
  });

  it("listPacks は packs ディレクトリの全パックを name 順で返す", () => {
    const dir = makeTempDir();
    writePack(packPathFor(dir, "zod"), { ...pack, name: "zod" });
    writePack(packPathFor(dir, "axios"), { ...pack, name: "axios" });
    fs.writeFileSync(
      path.join(resolvePacksDir(dir), "broken.json"),
      "{ not json"
    );
    fs.writeFileSync(path.join(resolvePacksDir(dir), "note.txt"), "ignore me");

    const packs = listPacks(resolvePacksDir(dir));
    assert.deepEqual(
      packs.map((loaded) => loaded.pack.name),
      ["axios", "zod"]
    );
  });

  it("listPacks はディレクトリが無ければ空配列", () => {
    assert.deepEqual(listPacks(path.join(makeTempDir(), "nope")), []);
  });

  it("removePack はファイルを削除し、無ければ false を返す", () => {
    const dir = makeTempDir();
    writePack(packPathFor(dir, "zod"), { ...pack, name: "zod" });
    assert.equal(removePack(dir, "zod").removed, true);
    assert.equal(fs.existsSync(packPathFor(dir, "zod")), false);
    assert.equal(removePack(dir, "zod").removed, false);
  });
});
