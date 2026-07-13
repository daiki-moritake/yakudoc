#!/usr/bin/env node
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { parseArgs } from "node:util";
import { addPackage, type AddPackageSummary } from "./addPack";
import { configPathFor, readConfig, resolveTargetLang } from "./config";
import { doctorProject, type DoctorLevel } from "./doctor";
import { selectEngine } from "./engineSelect";
import { extractProject, type ExtractSummary } from "./extract";
import { initProject, PLUGIN_NAME } from "./init";
import { resolveInstalledPackage } from "./installed";
import { DEFAULT_TARGET_LANG } from "./languages";
import {
  listPacks,
  packFileNameFor,
  packPathFor,
  readPack,
  removePack,
  resolvePacksDir,
  writePack,
} from "./packs";
import { PACKS_REPO_URL } from "./registry";
import { statusExitCode, statusProject, type PendingEntry } from "./status";
import { resolveTranslationsPath } from "./translationsFile";
import type { EngineRunOptions } from "./types";

const USAGE = `使い方: yakudoc <command> [options]

コマンド:
  add <pkg...>     依存ライブラリの翻訳パックを作成・更新する。
                   node_modules の型定義から JSDoc を抽出し、公開済みの
                   コミュニティ翻訳パックがあれば訳文を自動適用する
  remove <pkg...>  依存ライブラリの翻訳パックを削除する
  init             導入を一括で行う(tsconfig.json へのプラグイン登録 + 初回 extract)
  extract          自分のコードの JSDoc を .yakudoc/translations.json に書き出す
                   (既存の訳文は保持される)
  status           翻訳の進捗を表示する(translations.json + 全パック)
  translate        翻訳エンジンを実行する(translations.json + 全パック)
  export <pkg>     翻訳パックを共有用にカレントディレクトリへ書き出す
  doctor           導入状態を診断する(プラグイン登録・インストール・翻訳ファイル)

オプション:
  -p, --project <path>   tsconfig.json のパス(既定: カレントから探索)
      --out <path>       translations.json のパス(既定: .yakudoc/translations.json)
      --prune            [extract/add] ソースから消えた原文のエントリを削除する
      --json             [status] 進捗を機械可読な JSON で出力する
      --fail-on-pending  [status] 翻訳待ちが残っていれば終了コード 1(CI 用)
      --lang <code>      [init/add/translate] 翻訳先の言語コード(既定: ja)。
                         init で指定すると .yakudoc/config.json に保存され、
                         以後の add / translate はそれを使う
      --engine <name>    [translate] prep(AI 用下準備)/ local(内蔵モデル)。
                         省略時はインストール済みのエンジンを自動選択する
                         (1 つだけの場合)
      --apply <path>     [translate] 翻訳結果 JSON を書き戻す
      --pkg <name>       [translate] 対象を指定パッケージのパックだけに絞る
                         (複数指定可)
      --no-fetch         [add] コミュニティ翻訳パックを取得しない(オフライン)
      --registry <url>   [add] コミュニティ翻訳パックの取得元 URL を上書きする
      --to <path>        [export] 書き出し先(既定: ./<パッケージ名>.json)
      --model-size <s>   [translate --engine local] small | large | auto
                         (既定: auto。搭載メモリからモデルを自動選択)
      --model <hf-id>    [translate --engine local] 使用モデルを明示指定
  -v, --version          バージョンを表示する
  -h, --help             このヘルプを表示する
`;

interface TranslateEngineModule {
  run(options: EngineRunOptions): Promise<void> | void;
}

/**
 * エンジンのパッケージを読み込む。npx 実行などで CLI がプロジェクトの
 * node_modules 外に居ても、プロジェクトに入れたエンジンを見つけられるよう
 * カレントディレクトリからの解決を優先し、CLI 自身の依存(モノレポ開発時
 * など)にフォールバックする。
 */
function loadEngine(packageName: string): TranslateEngineModule {
  const projectRequire = createRequire(
    path.join(process.cwd(), "__yakudoc__.js")
  );
  try {
    return projectRequire(packageName) as TranslateEngineModule;
  } catch {
    return require(packageName) as TranslateEngineModule;
  }
}

/**
 * translate の対象ファイル一覧を解決する。
 * --pkg 指定時はそのパックだけ、未指定なら translations.json(あれば)+
 * packs/ 以下の全パック。1 つも無ければ導入手順を案内するエラー。
 */
function resolveTranslateTargets(
  projectDir: string,
  outPath: string | undefined,
  packages: string[] | undefined
): string[] {
  if (packages && packages.length > 0) {
    return packages.map((name) => {
      const packPath = packPathFor(projectDir, name, outPath);
      if (!fs.existsSync(packPath)) {
        throw new Error(
          `${name} の翻訳パックが見つかりません(${packPath})。` +
            `\n  先に \`yakudoc add ${name}\` を実行してください。`
        );
      }
      return packPath;
    });
  }

  const paths: string[] = [];
  const translationsPath = resolveTranslationsPath(projectDir, outPath);
  if (fs.existsSync(translationsPath)) {
    paths.push(translationsPath);
  }
  for (const loaded of listPacks(resolvePacksDir(projectDir, outPath))) {
    paths.push(loaded.filePath);
  }
  if (paths.length === 0) {
    throw new Error(
      "翻訳対象がありません。先にどちらかを実行してください:\n" +
        "  npx yakudoc init              (自分のコードの JSDoc を対象にする)\n" +
        "  npx yakudoc add <パッケージ名>  (依存ライブラリの docs を対象にする)"
    );
  }
  return paths;
}

async function runTranslate(values: {
  engine?: string;
  out?: string;
  apply?: string;
  model?: string;
  "model-size"?: string;
  lang?: string;
  pkg?: string[];
}): Promise<void> {
  const selection = selectEngine(values.engine, values.apply, (packageName) =>
    resolveInstalledPackage(process.cwd(), packageName) !== undefined
  );
  if (selection.note) {
    console.log(selection.note);
  }

  // エンジンの読み込み前に言語コードと対象ファイルを検証する
  const targetLang = resolveTargetLang(
    values.lang,
    configPathFor(process.cwd())
  );
  const translationsPaths = resolveTranslateTargets(
    process.cwd(),
    values.out,
    values.pkg
  );

  let engine: TranslateEngineModule;
  try {
    engine = loadEngine(selection.packageName);
  } catch {
    throw new Error(
      `${selection.packageName} がインストールされていません。` +
        `\n  npm install --save-dev ${selection.packageName}`
    );
  }

  await engine.run({
    projectDir: process.cwd(),
    translationsPath: values.out,
    translationsPaths,
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
  if (!summary.pluginInstalled) {
    // tsserver は解決できないプラグインを黙って無視するため、
    // このまま使い始めると「表示が変わらない」だけでエラーも出ない
    console.log(`
警告: ${PLUGIN_NAME} が node_modules に見つかりません。
  tsconfig.json への登録は完了しましたが、インストールされるまで表示は変わりません:
    npm install --save-dev ${PLUGIN_NAME}`);
  }

  const deps = readProjectDependencies(process.cwd());
  const addExample =
    deps.length > 0
      ? `npx yakudoc add ${deps.slice(0, 3).join(" ")}${deps.length > 3 ? " …" : ""}`
      : "npx yakudoc add <パッケージ名>";
  console.log(`
次にやること:
  1. 依存ライブラリの翻訳パックを追加する(ホバーに出る docs の大半はここ)
       ${addExample}
     公開済みのコミュニティ翻訳パックがあれば、訳文まで自動で入ります
  2. 残りを翻訳する
       npx yakudoc translate --engine local   (内蔵モデル。要 yakudoc-mt)
       npx yakudoc translate --engine prep    (任意の AI に依頼。要 yakudoc-ai-prep)
     または translations.json / packs 内の "translated" を直接編集する
  3. VSCode でコマンドパレットから「TypeScript: Restart TS Server」を実行する
     (プラグイン登録を反映するため。以降の翻訳更新は自動で反映されます)`);
}

/**
 * package.json の dependencies / devDependencies のパッケージ名一覧
 * (yakudoc 自身のパッケージは除く)。add の候補表示に使う。
 */
function readProjectDependencies(projectDir: string): string[] {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectDir, "package.json"), "utf8")
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = new Set<string>([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);
    return [...names].filter((name) => !name.startsWith("yakudoc")).sort();
  } catch {
    return [];
  }
}

/** add の 1 パッケージ分の結果を表示する */
function printAddSummary(summary: AddPackageSummary): void {
  const version = summary.version ? `@${summary.version}` : "";
  console.log(
    `${summary.name}${version}: 型定義 ${summary.fileCount} ファイルから ${summary.total} 件`
  );
  if (summary.fetchResult) {
    if (summary.fetchResult.status === "found") {
      console.log(
        `  コミュニティ翻訳パック: ${summary.fromCommunity} 件の訳文を適用しました`
      );
    } else if (summary.fetchResult.status === "not-found") {
      console.log(
        "  コミュニティ翻訳パック: 未公開でした(翻訳できたら `yakudoc export` で共有できます)"
      );
    } else {
      console.log(
        `  コミュニティ翻訳パック: 取得できませんでした(${summary.fetchResult.message})`
      );
    }
  }
  const percent =
    summary.total === 0
      ? 0
      : Math.round((summary.translated / summary.total) * 100);
  console.log(
    `  進捗: ${summary.translated} / ${summary.total} 件 翻訳済み (${percent}%) / 翻訳待ち ${summary.untranslated} 件`
  );
  console.log(`  書き出し先: ${path.relative(process.cwd(), summary.filePath)}`);
}

async function runAdd(
  values: {
    out?: string;
    lang?: string;
    prune?: boolean;
    "no-fetch"?: boolean;
    registry?: string;
  },
  names: string[]
): Promise<void> {
  if (names.length === 0) {
    const deps = readProjectDependencies(process.cwd());
    const candidates =
      deps.length > 0
        ? `\n\nこのプロジェクトの依存パッケージ:\n  ${deps.join("  ")}`
        : "";
    throw new Error(
      `追加するパッケージ名を指定してください。例: npx yakudoc add zod${candidates}`
    );
  }

  const configPath = configPathFor(process.cwd());
  const targetLang = resolveTargetLang(values.lang, configPath);
  const config = readConfig(configPath);

  const summaries: AddPackageSummary[] = [];
  for (const name of names) {
    const summary = await addPackage({
      projectDir: process.cwd(),
      packageName: name,
      targetLang,
      translationsPath: values.out,
      prune: values.prune,
      noFetch: values["no-fetch"],
      registryUrl: values.registry,
      configRegistryUrl: config.registry,
      generator: `yakudoc@${cliVersion()}`,
    });
    printAddSummary(summary);
    summaries.push(summary);
  }

  if (summaries.some((summary) => summary.untranslated > 0)) {
    console.log(
      "\n翻訳待ちが残っています。`npx yakudoc translate` で翻訳できます。"
    );
  }
}

function runRemove(values: { out?: string }, names: string[]): void {
  if (names.length === 0) {
    throw new Error(
      "削除するパッケージ名を指定してください。例: npx yakudoc remove zod"
    );
  }
  for (const name of names) {
    const { removed, filePath } = removePack(process.cwd(), name, values.out);
    console.log(
      removed
        ? `${name} の翻訳パックを削除しました(${path.relative(process.cwd(), filePath)})`
        : `${name} の翻訳パックはありません(${path.relative(process.cwd(), filePath)})`
    );
  }
}

function runExport(values: { out?: string; to?: string }, names: string[]): void {
  const name = names[0];
  if (!name || names.length !== 1) {
    throw new Error(
      "書き出すパッケージ名を 1 つ指定してください。例: npx yakudoc export zod"
    );
  }
  const packPath = packPathFor(process.cwd(), name, values.out);
  const pack = readPack(packPath);
  if (!pack) {
    throw new Error(
      `${name} の翻訳パックが見つかりません(${packPath})。` +
        `\n  先に \`yakudoc add ${name}\` を実行してください。`
    );
  }
  const targetPath = path.resolve(
    process.cwd(),
    values.to ?? packFileNameFor(name)
  );
  writePack(targetPath, pack);

  const total = Object.keys(pack.entries).length;
  const translated = Object.values(pack.entries).filter(
    (entry) => entry.translated
  ).length;
  console.log(`${targetPath} に書き出しました(翻訳済み ${translated} / ${total} 件)`);
  console.log(`
このパックをコミュニティに共有するには:
  1. ${PACKS_REPO_URL} をフォークする
  2. packs/${pack.lang || "<言語コード>"}/${packFileNameFor(name)} として追加する
  3. プルリクエストを送る
共有されたパックは、全ユーザーの \`yakudoc add ${name}\` で自動適用されます。`);
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
      "翻訳ファイルが見つかりません。先にどちらかを実行してください:\n" +
        "  npx yakudoc init              (自分のコードの JSDoc を対象にする)\n" +
        "  npx yakudoc add <パッケージ名>  (依存ライブラリの docs を対象にする)"
    );
  }

  process.exitCode = statusExitCode(summary, {
    failOnPending: values["fail-on-pending"] ?? false,
  });

  if (values.json) {
    const { total, translated, untranslated, pending, targetLang } = summary;
    console.log(
      JSON.stringify(
        {
          total,
          translated,
          untranslated,
          pending,
          targetLang,
          project: summary.project
            ? {
                total: summary.project.total,
                translated: summary.project.translated,
                untranslated: summary.project.untranslated,
              }
            : null,
          packages: summary.packs.map((pack) => ({
            name: pack.name,
            version: pack.version,
            total: pack.total,
            translated: pack.translated,
            untranslated: pack.untranslated,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  if (summary.packs.length === 0) {
    console.log(`翻訳ファイル: ${summary.outPath}`);
  }
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

  if (summary.packs.length > 0) {
    console.log("\n内訳:");
    if (summary.project) {
      const label = path.relative(process.cwd(), summary.outPath);
      console.log(
        `  プロジェクト  ${summary.project.translated}/${summary.project.total}(${label})`
      );
    }
    for (const pack of summary.packs) {
      const version = pack.version ? `@${pack.version}` : "";
      console.log(
        `  ${pack.name}${version}  ${pack.translated}/${pack.total}`
      );
    }
  }

  if (summary.pending.length > 0) {
    console.log("\n翻訳待ち:");
    for (const line of formatPending(summary.pending)) {
      console.log(line);
    }
  }
}

const CLI_OPTIONS = {
  project: { type: "string", short: "p" },
  out: { type: "string" },
  prune: { type: "boolean", default: false },
  json: { type: "boolean", default: false },
  "fail-on-pending": { type: "boolean", default: false },
  engine: { type: "string" },
  apply: { type: "string" },
  pkg: { type: "string", multiple: true },
  "no-fetch": { type: "boolean", default: false },
  registry: { type: "string" },
  to: { type: "string" },
  model: { type: "string" },
  "model-size": { type: "string" },
  lang: { type: "string" },
  version: { type: "boolean", short: "v", default: false },
  help: { type: "boolean", short: "h", default: false },
} as const;

const DOCTOR_MARKS: Record<DoctorLevel, string> = {
  ok: "✔",
  warn: "⚠",
  error: "✖",
};

function runDoctor(values: { project?: string; out?: string }): void {
  const report = doctorProject({
    projectDir: process.cwd(),
    tsconfigPath: values.project,
    outPath: values.out,
  });

  for (const check of report.checks) {
    console.log(`${DOCTOR_MARKS[check.level]} ${check.label}: ${check.detail}`);
    if (check.hint) {
      for (const line of check.hint.split("\n")) {
        console.log(`    ${line}`);
      }
    }
  }

  const errors = report.checks.filter((check) => check.level === "error").length;
  const warns = report.checks.filter((check) => check.level === "warn").length;
  console.log("");
  if (errors > 0) {
    console.log(`${errors} 件の問題が見つかりました。上の対処に従って解消してください。`);
  } else if (warns > 0) {
    console.log(`致命的な問題はありません(警告 ${warns} 件)。`);
  } else {
    console.log(
      "すべての検査を通過しました。ホバーが変わらない場合は VSCode で" +
        "「TypeScript: Restart TS Server」を実行してください。"
    );
  }
  process.exitCode = report.exitCode;
}

/** 自身の package.json からバージョンを読む(dist/cli.js からの相対) */
function cliVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function parseCliArgs() {
  return parseArgs({ allowPositionals: true, options: CLI_OPTIONS });
}

async function main(): Promise<void> {
  let parsed: ReturnType<typeof parseCliArgs>;
  try {
    parsed = parseCliArgs();
  } catch (error) {
    // 未知のオプションなど。Node の例外をそのまま投げず、使い方を添える
    process.stderr.write(
      `yakudoc: ${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`
    );
    process.exit(1);
  }
  const { values, positionals } = parsed;

  if (values.version) {
    console.log(cliVersion());
    return;
  }

  const command = positionals[0];
  if (values.help || command === undefined) {
    process.stdout.write(USAGE);
    process.exit(values.help ? 0 : 1);
  }

  if (command === "init") {
    runInit(values);
    return;
  }

  if (command === "add") {
    await runAdd(values, positionals.slice(1));
    return;
  }

  if (command === "remove") {
    runRemove(values, positionals.slice(1));
    return;
  }

  if (command === "export") {
    runExport(values, positionals.slice(1));
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

  if (command === "doctor") {
    runDoctor(values);
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
