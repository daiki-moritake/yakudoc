#!/usr/bin/env node
import { parseArgs } from "node:util";
import { extractProject } from "./extract";
import type { EngineRunOptions } from "./types";

const USAGE = `使い方: yakudoc <command> [options]

コマンド:
  extract      プロジェクトの JSDoc を走査し、.yakudoc/translations.json に
               翻訳待ちの原文を書き出す(既存の訳文は保持される)
  translate    翻訳エンジンを実行する(--engine が必須)

オプション:
  -p, --project <path>   tsconfig.json のパス(既定: カレントから探索)
      --out <path>       translations.json のパス(既定: .yakudoc/translations.json)
      --prune            [extract] ソースから消えた原文のエントリを削除する
      --engine <name>    [translate] prep(AI 用下準備)/ local(内蔵モデル)
      --apply <path>     [translate] 翻訳結果 JSON を translations.json に書き戻す
      --model-size <s>   [translate --engine local] small | large | auto
                         (既定: auto。搭載メモリからモデルを自動選択)
      --model <hf-id>    [translate --engine local] 使用モデルを明示指定
  -h, --help             このヘルプを表示する
`;

const ENGINE_PACKAGES: Record<string, string> = {
  prep: "yakudoc-ai-prep",
  local: "yakudoc-mt",
};

interface TranslateEngineModule {
  run(options: EngineRunOptions): Promise<void> | void;
}

async function runTranslate(values: {
  engine?: string;
  out?: string;
  apply?: string;
  model?: string;
  "model-size"?: string;
}): Promise<void> {
  if (!values.engine) {
    throw new Error(
      "--engine を指定してください(prep または local)。"
    );
  }
  const packageName = ENGINE_PACKAGES[values.engine];
  if (!packageName) {
    throw new Error(
      `不明なエンジンです: ${values.engine}(prep または local が使えます)`
    );
  }

  let engine: TranslateEngineModule;
  try {
    engine = (await import(packageName)) as TranslateEngineModule;
  } catch {
    throw new Error(
      `${packageName} がインストールされていません。` +
        `\n  npm install --save-dev ${packageName}`
    );
  }

  await engine.run({
    projectDir: process.cwd(),
    translationsPath: values.out,
    applyPath: values.apply,
    model: values.model,
    modelSize: values["model-size"],
  });
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      project: { type: "string", short: "p" },
      out: { type: "string" },
      prune: { type: "boolean", default: false },
      engine: { type: "string" },
      apply: { type: "string" },
      model: { type: "string" },
      "model-size": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const command = positionals[0];
  if (values.help || command === undefined) {
    process.stdout.write(USAGE);
    process.exit(values.help ? 0 : 1);
  }

  if (command === "extract") {
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
    return;
  }

  if (command === "translate") {
    await runTranslate(values);
    return;
  }

  process.stderr.write(`不明なコマンドです: ${command}\n\n${USAGE}`);
  process.exit(1);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `yakudoc: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
});
