#!/usr/bin/env node
// ローカルから npm に公開する。
//
//   npm run publish:local                 # 公開する(確認あり)
//   npm run publish:local -- --dry-run    # 公開せず、公開される内容だけ確認する
//   npm run publish:local -- --yes        # 確認プロンプトを省略する
//   npm run publish:local -- --otp 123456 # 2FA のワンタイムパスワードを渡す
//   npm run publish:local 0.2.0           # version を明示(package.json と一致必須)
//
// 通常は `npm run release`(タグ push → GitHub Actions が provenance 付きで
// publish)を使う。こちらは手元から直接 publish するための代替コマンド。
//
// 2FA(二要素認証)を有効にしている場合は、publish に OTP が必要です。
// `--otp <code>` で渡すか、渡さなければ npm が対話的に尋ねます(stdin を
// 引き継ぐため)。4 パッケージを 1 つの OTP でまとめて公開できるよう、
// --otp 指定を推奨します。
//
// リリースタグとの一致を検証する:
//   タグ v<version> が存在し、HEAD がそのコミットと一致し、作業ツリーが
//   クリーンであること。= タグ付けした内容そのものを公開する保証。
//   (--dry-run のときは検証を省き、純粋なプレビューとして動く)
//
// 注意: provenance(公開物とソースの対応を示す署名)は GitHub Actions 上
// でしか付きません。provenance が必要なら `npm run release` を使ってください。

import {
  confirm,
  fail,
  PUBLISH_PACKAGES,
  readPackageVersion,
  resolveAlignedVersion,
  run,
  tryRun,
} from "./lib.mjs";

const INHERIT = { stdio: ["ignore", "inherit", "inherit"] };

/**
 * リリースタグ v<version> と現在の状態の一致を検証する。
 * タグが存在し、HEAD がそのコミットで、作業ツリーがクリーンであることを求める。
 */
function verifyTagMatch(tag) {
  if (!tryRun("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]).ok) {
    fail(
      `タグ ${tag} が見つかりません。\n` +
        `  先に \`npm run release\` でタグを作成してから公開してください。\n` +
        `  (内容だけ確認したいなら \`npm run publish:local -- --dry-run\`)`
    );
  }
  const tagCommit = run("git", ["rev-parse", `${tag}^{commit}`]);
  const head = run("git", ["rev-parse", "HEAD"]);
  if (tagCommit !== head) {
    fail(
      `HEAD がタグ ${tag} のコミットと一致しません(タグ付けした内容と別物を公開しかけています)。\n` +
        `  タグ ${tag}: ${tagCommit.slice(0, 12)}\n` +
        `  現在 HEAD : ${head.slice(0, 12)}\n` +
        `  \`git checkout ${tag}\` でタグのコミットに移動してから実行してください。`
    );
  }
  if (run("git", ["status", "--porcelain"])) {
    fail("作業ツリーに未コミットの変更があります。タグのコミットと同じ状態で公開してください。");
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const dryRun = rawArgs.includes("--dry-run");
  const skipConfirm = rawArgs.includes("--yes") || rawArgs.includes("-y");
  // --otp <code> / --otp=<code> を取り出す。値を positional と誤認しないよう、
  // ここで消費してから残りを positional 引数(version)として扱う。
  let otp;
  const positionals = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--otp") {
      otp = rawArgs[++i];
    } else if (arg.startsWith("--otp=")) {
      otp = arg.slice("--otp=".length);
    } else if (!arg.startsWith("-")) {
      positionals.push(arg);
    }
  }
  const versionArg = positionals[0];

  // 1. version の整合チェック
  const version = resolveAlignedVersion(versionArg);
  const tag = `v${version}`;

  // 2. リリースタグとの一致検証 + npm ログイン(dry-run 時は省略)
  if (!dryRun) {
    verifyTagMatch(tag);
    if (!tryRun("npm", ["whoami"]).ok) {
      fail("npm にログインしていません。`npm login` を実行してから再度お試しください。");
    }
  }

  // 3. ビルド(dist を最新化。dry-run でも pack 内容を正確にするため実行)
  console.log("ビルド中...");
  run("npm", ["run", "build"], INHERIT);
  if (!dryRun) {
    console.log("テスト中...");
    run("npm", ["test"], INHERIT);
  }

  // 4. 公開計画(公開済みの版はスキップ。dry-run では公開状況を問い合わせない)
  const plan = PUBLISH_PACKAGES.map((name) => {
    const v = readPackageVersion(name);
    const already = !dryRun && tryRun("npm", ["view", `${name}@${v}`, "version"]).ok;
    return { name, v, already };
  });

  console.log(`
${dryRun ? "[dry-run] " : ""}公開内容:
${plan
  .map(({ name, v, already }) => `  ${name}@${v}${already ? "  (公開済み → スキップ)" : ""}`)
  .join("\n")}
  レジストリ:   https://registry.npmjs.org
  provenance:   なし(付けるには GitHub Actions 経由の \`npm run release\` を使用)
`);

  if (plan.every((p) => p.already)) {
    console.log("すべて公開済みです。公開するものはありません。");
    return;
  }

  // 5. 確認(dry-run 以外)
  if (!dryRun && !skipConfirm) {
    const ok = await confirm("この内容で npm に公開しますか?(取り消せません)[y/N] ");
    if (!ok) {
      console.log("中止しました。");
      return;
    }
  }

  // 6. 依存順に publish(公開済みはスキップ)
  for (const { name, v, already } of plan) {
    if (already) {
      console.log(`${name}@${v} は公開済みのためスキップします`);
      continue;
    }
    const args = ["publish", "-w", name, "--access", "public"];
    if (otp) {
      args.push(`--otp=${otp}`);
    }
    if (dryRun) {
      args.push("--dry-run");
    }
    console.log(`\n${dryRun ? "[dry-run] " : ""}publish: ${name}@${v}`);
    // stdin も引き継ぐ: 2FA 有効時に npm が OTP を対話入力/ブラウザ認証できるようにする
    run("npm", args, { stdio: "inherit" });
  }

  console.log(
    dryRun
      ? "\n[dry-run] 実際には公開していません。問題なければ --dry-run を外して実行してください。"
      : `\n✔ 公開しました(${tag})。 https://www.npmjs.com/package/yakudoc`
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
