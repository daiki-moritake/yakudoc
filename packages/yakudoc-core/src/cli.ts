#!/usr/bin/env node
import { parseArgs } from "node:util";
import { extractProject } from "./extract";

const USAGE = `使い方: yakudoc <command> [options]

コマンド:
  extract    プロジェクトの JSDoc を走査し、.yakudoc/translations.json に
             翻訳待ちの原文を書き出す(既存の訳文は保持される)

オプション:
  -p, --project <path>   tsconfig.json のパス(既定: カレントから探索)
      --out <path>       出力先(既定: .yakudoc/translations.json)
      --prune            ソースから消えた原文のエントリを削除する
  -h, --help             このヘルプを表示する
`;

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      project: { type: "string", short: "p" },
      out: { type: "string" },
      prune: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const command = positionals[0];
  if (values.help || command === undefined) {
    process.stdout.write(USAGE);
    process.exit(values.help ? 0 : 1);
  }

  if (command !== "extract") {
    process.stderr.write(`不明なコマンドです: ${command}\n\n${USAGE}`);
    process.exit(1);
  }

  const summary = extractProject({
    projectDir: process.cwd(),
    tsconfigPath: values.project,
    outPath: values.out,
    prune: values.prune,
  });

  console.log(`書き出し先: ${summary.outPath}`);
  console.log(
    `${summary.fileCount} ファイルから ${summary.extracted} 件の原文を抽出しました` +
      `(翻訳済み ${summary.translated} / 翻訳待ち ${summary.untranslated})`
  );
  if (summary.stale > 0) {
    console.log(
      summary.pruned
        ? `ソースに存在しない ${summary.stale} 件のエントリを削除しました`
        : `ソースに存在しない ${summary.stale} 件のエントリを残しています(--prune で削除できます)`
    );
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `yakudoc: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
}
