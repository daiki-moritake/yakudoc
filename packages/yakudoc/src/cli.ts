#!/usr/bin/env node
import * as path from "node:path";
import { parseArgs } from "node:util";
import { configPathFor, resolveTargetLang } from "./config";
import { extractProject, type ExtractSummary } from "./extract";
import { initProject } from "./init";
import { DEFAULT_TARGET_LANG } from "./languages";
import { statusExitCode, statusProject, type PendingEntry } from "./status";
import type { EngineRunOptions } from "./types";

const USAGE = `使い方: yakudoc <command> [options]

コマンド:
  init         導入を一括で行う(tsconfig.json へのプラグイン登録 + 初回 extract)
  extract      プロジェクトの JSDoc を走査し、.yakudoc/translations.json に
               翻訳待ちの原文を書き出す(既存の訳文は保持される)
  status       translations.json を書き換えずに翻訳の進捗を表示する
  translate    翻訳エンジンを実行する(--engine が必須)

オプション:
  -p, --project <path>   tsconfig.json のパス(既定: カレントから探索)
      --out <path>       translations.json のパス(既定: .yakudoc/translations.json)
      --prune            [extract] ソースから消えた原文のエントリを削除する
      --json             [status] 進捗を機械可読な JSON で出力する
      --fail-on-pending  [status] 翻訳待ちが残っていれば終了コード 1(CI 用)
      --lang <code>      [init/translate] 翻訳先の言語コード(既定: ja)。
                         init で指定すると .yakudoc/config.json に保存され、
                         以後の translate はそれを使う
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
  lang?: string;
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

  // エンジンの読み込み前に言語コードを検証する(--lang > config.json > ja)
  const targetLang = resolveTargetLang(
    values.lang,
    configPathFor(process.cwd())
  );

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
    targetLang,
  });
}

/** extract の結果を extract / init 共通の書式で表示する */
function printExtractSummary(summary: ExtractSummary): void {
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

function runInit(values: {
  project?: string;
  out?: string;
  lang?: string;
}): void {
  const summary = initProject({
    projectDir: process.cwd(),
    tsconfigPath: values.project,
    outPath: values.out,
    targetLang: values.lang,
  });

  const tsconfigLabel = path.relative(process.cwd(), summary.tsconfigPath);
  console.log(
    summary.pluginRegistered
      ? `${tsconfigLabel} に yakudoc-ts-plugin を登録しました`
      : `${tsconfigLabel} には yakudoc-ts-plugin が登録済みです`
  );
  printExtractSummary(summary.extract);
  if (summary.configWritten) {
    const configLabel = path.relative(process.cwd(), summary.configPath);
    console.log(
      `翻訳先言語: ${summary.targetLang}(${configLabel} に保存しました)`
    );
  }

  console.log(`
次にやること:
  1. 翻訳を実行する
       npx yakudoc translate --engine local   (内蔵モデル。要 yakudoc-mt)
       npx yakudoc translate --engine prep    (任意の AI に依頼。要 yakudoc-ai-prep)
     または translations.json の "translated" を直接編集する
  2. VSCode でコマンドパレットから「TypeScript: Restart TS Server」を実行する
     (プラグイン登録を反映するため。以降の翻訳更新は自動で反映されます)`);
}

/** 翻訳待ち一覧を「symbol  原文(長ければ省略)」の行に整形する */
function formatPending(pending: PendingEntry[], limit = 20): string[] {
  const lines = pending.slice(0, limit).map((entry) => {
    const where = entry.symbol || "(シンボル不明)";
    const text =
      entry.original.length > 60
        ? entry.original.slice(0, 57) + "…"
        : entry.original;
    return `  ${where}  ${text.replace(/\s+/g, " ")}`;
  });
  const rest = pending.length - lines.length;
  if (rest > 0) {
    lines.push(`  … 他 ${rest} 件`);
  }
  return lines;
}

function runStatus(values: {
  out?: string;
  json?: boolean;
  "fail-on-pending"?: boolean;
}): void {
  const summary = statusProject({
    projectDir: process.cwd(),
    outPath: values.out,
  });
  if (!summary) {
    throw new Error(
      "translations.json が見つかりません。先に `yakudoc extract` を実行してください。"
    );
  }

  process.exitCode = statusExitCode(summary, {
    failOnPending: values["fail-on-pending"] ?? false,
  });

  if (values.json) {
    const { total, translated, untranslated, pending, targetLang } = summary;
    console.log(
      JSON.stringify(
        { total, translated, untranslated, pending, targetLang },
        null,
        2
      )
    );
    return;
  }

  console.log(`翻訳ファイル: ${summary.outPath}`);
  if (summary.targetLang !== DEFAULT_TARGET_LANG) {
    console.log(`翻訳先言語: ${summary.targetLang}`);
  }
  if (summary.total === 0) {
    console.log("翻訳対象がありません。");
    return;
  }
  const percent = Math.round((summary.translated / summary.total) * 100);
  console.log(
    `進捗: ${summary.translated} / ${summary.total} 件 翻訳済み (${percent}%) / 翻訳待ち ${summary.untranslated} 件`
  );
  if (summary.pending.length > 0) {
    console.log("\n翻訳待ち:");
    for (const line of formatPending(summary.pending)) {
      console.log(line);
    }
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      project: { type: "string", short: "p" },
      out: { type: "string" },
      prune: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      "fail-on-pending": { type: "boolean", default: false },
      engine: { type: "string" },
      apply: { type: "string" },
      model: { type: "string" },
      "model-size": { type: "string" },
      lang: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const command = positionals[0];
  if (values.help || command === undefined) {
    process.stdout.write(USAGE);
    process.exit(values.help ? 0 : 1);
  }

  if (command === "init") {
    runInit(values);
    return;
  }

  if (command === "extract") {
    const summary = extractProject({
      projectDir: process.cwd(),
      tsconfigPath: values.project,
      outPath: values.out,
      prune: values.prune,
    });
    printExtractSummary(summary);
    return;
  }

  if (command === "status") {
    runStatus(values);
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
