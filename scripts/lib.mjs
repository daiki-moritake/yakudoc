// リリース系スクリプト(release.mjs / publish-local.mjs)の共通処理。

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** npm に公開する 4 パッケージ(依存される側から順に並べる) */
export const PUBLISH_PACKAGES = [
  "yakudoc",
  "yakudoc-ts-plugin",
  "yakudoc-ai-prep",
  "yakudoc-mt",
];

/** コマンドを実行して stdout(trim 済み)を返す。失敗時は例外。
 *  stdout を inherit した場合 execFileSync は null を返すため空文字に丸める。 */
export function run(cmd, args, options = {}) {
  const out = execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  return (out ?? "").trim();
}

/** 失敗しても例外にせず { ok, out } を返す(存在チェック用) */
export function tryRun(cmd, args) {
  try {
    return { ok: true, out: run(cmd, args) };
  } catch (error) {
    return { ok: false, out: (error.stderr || error.stdout || "").toString().trim() };
  }
}

export function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

export function readPackageVersion(name) {
  const file = path.join(ROOT, "packages", name, "package.json");
  return JSON.parse(readFileSync(file, "utf8")).version;
}

/**
 * 公開 4 パッケージの version が揃っているか確認し、基準 version を返す。
 * versionArg を渡した場合は packages/yakudoc の version と一致必須。
 * 揃っていなければ揃え方を案内して終了する。
 */
export function resolveAlignedVersion(versionArg) {
  const version = readPackageVersion("yakudoc");
  const alignHint = `npm version ${version} -w ${PUBLISH_PACKAGES.join(" -w ")} --no-git-tag-version`;
  if (versionArg && versionArg !== version) {
    fail(
      `指定した version(${versionArg})が packages/yakudoc の version(${version})と一致しません。\n` +
        `  先に \`npm version ${versionArg} -w ${PUBLISH_PACKAGES.join(" -w ")} --no-git-tag-version\` で揃えてください。`
    );
  }
  const mismatched = PUBLISH_PACKAGES.map((name) => [name, readPackageVersion(name)]).filter(
    ([, v]) => v !== version
  );
  if (mismatched.length > 0) {
    fail(
      `公開パッケージの version が揃っていません(基準: yakudoc@${version}):\n` +
        mismatched.map(([name, v]) => `  ${name}@${v}`).join("\n") +
        `\n\n  \`${alignHint}\` で揃えてください。`
    );
  }
  return version;
}

export async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}
