#!/usr/bin/env node
// リリースを 1 コマンドで行う。
//
//   npm run release            # packages/yakudoc の version を対象にする
//   npm run release 0.2.0      # version を明示(package.json と一致必須)
//   npm run release -- --yes   # 確認プロンプトを省略(CI 用)
//
// やること:
//   1. 公開 4 パッケージの version が揃っているか確認する
//   2. リリースノート release-notes/v<version>.md の存在を確認する
//      → 無ければ用意を促して終了する(タグは作らない)
//   3. main ブランチ・作業ツリーがクリーンか・origin と同期しているか確認する
//   4. タグ v<version> を作成して push する(Release ワークフローが npm publish を行う)
//   5. gh release でリリースノートを GitHub に公開する
//
// タグ push と GitHub Release は取り消しの効きにくい公開操作のため、
// 既定では実行前に内容を表示して確認を求める(--yes で省略)。

import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
  confirm,
  fail,
  resolveAlignedVersion,
  ROOT,
  run,
  tryRun,
} from "./lib.mjs";

const NOTES_DIR = "release-notes";

function printMissingNotesHelp(version, notesRelPath) {
  const tag = `v${version}`;
  console.error(`
✖ リリースノートがありません: ${notesRelPath}

リリース前に、この版のノートを用意してください:

  1. テンプレートをコピーする
       cp ${NOTES_DIR}/TEMPLATE.md ${notesRelPath}
  2. 変更点・破壊的変更・謝辞などを書く
  3. もう一度 \`npm run release\` を実行する

前回タグからの変更をもとに草案を作りたい場合:
       gh release create ${tag} --generate-notes --draft
  で下書きを作り、本文を ${notesRelPath} に貼り付けても構いません。
  (--draft なので、この時点では公開されません)
`);
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const skipConfirm = rawArgs.includes("--yes") || rawArgs.includes("-y");
  const versionArg = rawArgs.find((arg) => !arg.startsWith("-"));

  // 1. version の決定と整合チェック
  const version = resolveAlignedVersion(versionArg);
  const tag = `v${version}`;

  // 2. リリースノートの存在チェック(要望の中心機能。無ければ用意を促して終了)
  //    どのブランチでも早く気づけるよう、git の状態チェックより前に行う。
  const notesRelPath = path.join(NOTES_DIR, `${tag}.md`);
  const notesPath = path.join(ROOT, notesRelPath);
  if (!existsSync(notesPath)) {
    printMissingNotesHelp(version, notesRelPath);
    process.exit(1);
  }
  const notesBody = readFileSync(notesPath, "utf8").trim();
  if (!notesBody) {
    fail(`${notesRelPath} が空です。リリースノートを記入してください。`);
  }

  // 3. git の状態(main・クリーン・origin と同期)
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main") {
    fail(`リリースは main ブランチで行ってください(現在: ${branch})。`);
  }
  if (run("git", ["status", "--porcelain"])) {
    fail("作業ツリーに未コミットの変更があります。コミットしてから実行してください。");
  }
  run("git", ["fetch", "origin", "main", "--tags", "--quiet"]);
  const local = run("git", ["rev-parse", "HEAD"]);
  const remote = run("git", ["rev-parse", "origin/main"]);
  if (local !== remote) {
    fail(
      "ローカルの main が origin/main と一致していません。\n" +
        "  `git pull` / `git push` で同期してから実行してください。"
    );
  }

  // 4. タグの重複チェック(ローカル・リモート双方)
  if (tryRun("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]).ok) {
    fail(`タグ ${tag} は既に存在します。version を上げてから実行してください。`);
  }
  if (run("git", ["ls-remote", "--tags", "origin", tag])) {
    fail(`タグ ${tag} は origin に既に存在します。version を上げてから実行してください。`);
  }

  // gh の準備(GitHub Release に必要)
  if (!tryRun("gh", ["auth", "status"]).ok) {
    fail("GitHub CLI(gh)にログインしていません。`gh auth login` を実行してください。");
  }

  // 5. 確認
  console.log(`
リリース内容:
  タグ:         ${tag}
  コミット:     ${local.slice(0, 12)}(origin/main)
  パッケージ:   ${["yakudoc", "yakudoc-ts-plugin", "yakudoc-ai-prep", "yakudoc-mt"]
    .map((n) => `${n}@${version}`)
    .join(", ")}
  ノート:       ${notesRelPath}(${notesBody.split("\n").length} 行)

このあと行うこと:
  - タグ ${tag} を作成して push(Release ワークフローが npm publish を実行)
  - GitHub にリリースノートを公開
`);
  if (!skipConfirm) {
    const ok = await confirm("この内容でリリースしますか? [y/N] ");
    if (!ok) {
      console.log("中止しました。タグは作成していません。");
      process.exit(0);
    }
  }

  // 6. タグ作成 + push → Release ワークフロー(npm publish)を起動
  console.log(`\nタグ ${tag} を作成して push します...`);
  run("git", ["tag", "-a", tag, "-m", `Release ${tag}`]);
  try {
    run("git", ["push", "origin", tag], { stdio: ["ignore", "inherit", "inherit"] });
  } catch (error) {
    // push に失敗したらローカルタグを消して元に戻す
    tryRun("git", ["tag", "-d", tag]);
    fail(`タグの push に失敗しました。ローカルタグを削除しました。\n  ${error.message}`);
  }

  // 7. GitHub Release を公開(既存タグを使う)
  console.log("GitHub にリリースノートを公開します...");
  const releaseResult = tryRun("gh", [
    "release",
    "create",
    tag,
    "--verify-tag",
    "--title",
    tag,
    "--notes-file",
    notesPath,
  ]);
  if (!releaseResult.ok) {
    console.error(
      `\n⚠ タグの push は完了しましたが、GitHub Release の作成に失敗しました:\n  ${releaseResult.out}\n` +
        `  手動で作成できます:\n` +
        `    gh release create ${tag} --title ${tag} --notes-file ${notesRelPath}`
    );
    process.exit(1);
  }

  console.log(`
✔ リリースしました: ${tag}
  Release ページ:   ${releaseResult.out}
  npm publish の進捗: https://github.com/daiki-moritake/yakudoc/actions/workflows/release.yml
`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
