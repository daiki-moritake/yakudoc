import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * CLI の表示言語切り替えをビルド済み dist/cli.js の実起動で検証する。
 * 「翻訳先が ja(既定)なら日本語 UI、それ以外は英語 UI」という配線が
 * config.json / --lang の双方で効くことを確かめる。
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(here, "..", "dist", "cli.js");

const tempDirs: string[] = [];

function makeProject(config?: { targetLang?: string }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-cli-"));
  tempDirs.push(dir);
  if (config) {
    fs.mkdirSync(path.join(dir, ".yakudoc"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".yakudoc", "config.json"),
      JSON.stringify(config, null, 2) + "\n"
    );
  }
  return dir;
}

/** dist/cli.js を cwd=dir で実行し、stdout+stderr を返す(終了コードは無視) */
function runCli(dir: string, args: string[]): string {
  try {
    return execFileSync("node", [cliPath, ...args], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    return `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
}

describe("CLI の表示言語切り替え(dist/cli.js)", () => {
  before(() => {
    assert.ok(
      fs.existsSync(cliPath),
      `dist/cli.js が見つかりません(先に npm run build):${cliPath}`
    );
  });

  after(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("config も --lang も無ければ日本語ヘルプ", () => {
    const dir = makeProject();
    const out = runCli(dir, ["--help"]);
    assert.match(out, /使い方: yakudoc/);
  });

  it("config.targetLang が ja 以外なら英語ヘルプ", () => {
    const dir = makeProject({ targetLang: "ko" });
    const out = runCli(dir, ["--help"]);
    assert.match(out, /Usage: yakudoc/);
  });

  it("config.targetLang=ja なら日本語ヘルプ", () => {
    const dir = makeProject({ targetLang: "ja" });
    const out = runCli(dir, ["--help"]);
    assert.match(out, /使い方: yakudoc/);
  });

  it("--lang で表示言語を上書きできる(エラーメッセージも英語化)", () => {
    const dir = makeProject();
    const out = runCli(dir, ["status", "--lang", "en"]);
    assert.match(out, /No translation file found/);
  });

  it("--lang 未指定なら既定の日本語でエラーを出す", () => {
    const dir = makeProject();
    const out = runCli(dir, ["status"]);
    assert.match(out, /翻訳ファイルが見つかりません/);
  });
});
