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
import { m, setUiLocale, uiLocaleForTargetLang, type UiLocale } from "./i18n";
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
        throw new Error(m().packNotFound(name, packPath));
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
    throw new Error(m().noTranslateTargets());
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
    throw new Error(m().engineNotInstalled(selection.packageName));
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
  console.log(m().extractOutDest(summary.outPath));
  console.log(
    m().extractCounts(
      summary.fileCount,
      summary.extracted,
      summary.translated,
      summary.untranslated
    )
  );
  if (summary.stale > 0) {
    console.log(
      summary.pruned
        ? m().stalePruned(summary.stale)
        : m().staleKept(summary.stale)
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
      ? m().pluginRegistered(tsconfigLabel)
      : m().pluginAlreadyRegistered(tsconfigLabel)
  );
  printExtractSummary(summary.extract);
  if (summary.configWritten) {
    const configLabel = path.relative(process.cwd(), summary.configPath);
    console.log(m().langSaved(summary.targetLang, configLabel));
  }
  if (!summary.pluginInstalled) {
    // tsserver は解決できないプラグインを黙って無視するため、
    // このまま使い始めると「表示が変わらない」だけでエラーも出ない
    console.log(m().pluginNotInstalledWarning(PLUGIN_NAME));
  }

  const deps = readProjectDependencies(process.cwd());
  const addExample =
    deps.length > 0
      ? `npx yakudoc add ${deps.slice(0, 3).join(" ")}${deps.length > 3 ? " …" : ""}`
      : `npx yakudoc add ${m().packagePlaceholder()}`;
  console.log(m().initNextSteps(addExample));
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
    m().addExtracted(summary.name, version, summary.fileCount, summary.total)
  );
  if (summary.fetchResult) {
    if (summary.fetchResult.status === "found") {
      console.log(m().communityApplied(summary.fromCommunity));
    } else if (summary.fetchResult.status === "not-found") {
      console.log(m().communityNotFound());
    } else {
      console.log(m().communityFetchError(summary.fetchResult.message));
    }
  }
  const percent =
    summary.total === 0
      ? 0
      : Math.round((summary.translated / summary.total) * 100);
  console.log(
    "  " +
      m().progressLine(
        summary.translated,
        summary.total,
        percent,
        summary.untranslated
      )
  );
  console.log(m().addOutDest(path.relative(process.cwd(), summary.filePath)));
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
      deps.length > 0 ? m().projectDependenciesList(deps.join("  ")) : "";
    throw new Error(m().addNeedPackage() + candidates);
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
    console.log(m().addPendingRemains());
  }
}

function runRemove(values: { out?: string }, names: string[]): void {
  if (names.length === 0) {
    throw new Error(m().removeNeedPackage());
  }
  for (const name of names) {
    const { removed, filePath } = removePack(process.cwd(), name, values.out);
    const rel = path.relative(process.cwd(), filePath);
    console.log(
      removed ? m().packRemoved(name, rel) : m().packRemoveNotFound(name, rel)
    );
  }
}

function runExport(values: { out?: string; to?: string }, names: string[]): void {
  const name = names[0];
  if (!name || names.length !== 1) {
    throw new Error(m().exportNeedPackage());
  }
  const packPath = packPathFor(process.cwd(), name, values.out);
  const pack = readPack(packPath);
  if (!pack) {
    throw new Error(m().packNotFound(name, packPath));
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
  console.log(m().exportWritten(targetPath, translated, total));
  console.log(
    m().exportShareGuide(
      PACKS_REPO_URL,
      pack.lang || m().langPlaceholder(),
      packFileNameFor(name),
      name
    )
  );
}

/** 翻訳待ち一覧を「symbol  原文(長ければ省略)」の行に整形する */
function formatPending(pending: PendingEntry[], limit = 20): string[] {
  const lines = pending.slice(0, limit).map((entry) => {
    const where = entry.symbol || m().symbolUnknown();
    const text =
      entry.original.length > 60
        ? entry.original.slice(0, 57) + "…"
        : entry.original;
    return `  ${where}  ${text.replace(/\s+/g, " ")}`;
  });
  const rest = pending.length - lines.length;
  if (rest > 0) {
    lines.push(m().pendingMore(rest));
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
    throw new Error(m().noTranslationFile());
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
    console.log(m().statusFileLabel(summary.outPath));
  }
  if (summary.targetLang !== DEFAULT_TARGET_LANG) {
    console.log(m().statusTargetLang(summary.targetLang));
  }
  if (summary.total === 0) {
    console.log(m().statusNoTargets());
    return;
  }
  const percent = Math.round((summary.translated / summary.total) * 100);
  console.log(
    m().progressLine(
      summary.translated,
      summary.total,
      percent,
      summary.untranslated
    )
  );

  if (summary.packs.length > 0) {
    console.log(m().statusBreakdownHeader());
    if (summary.project) {
      const label = path.relative(process.cwd(), summary.outPath);
      console.log(
        m().statusBreakdownProject(
          summary.project.translated,
          summary.project.total,
          label
        )
      );
    }
    for (const pack of summary.packs) {
      const version = pack.version ? `@${pack.version}` : "";
      console.log(
        m().statusBreakdownPack(
          pack.name,
          version,
          pack.translated,
          pack.total
        )
      );
    }
  }

  if (summary.pending.length > 0) {
    console.log(m().statusPendingHeader());
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
    console.log(m().doctorSummaryErrors(errors));
  } else if (warns > 0) {
    console.log(m().doctorSummaryWarns(warns));
  } else {
    console.log(m().doctorSummaryOk());
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

/**
 * CLI の表示ロケールを決める。翻訳先が ja(既定)なら日本語、それ以外は英語。
 * --lang があればそれを優先し、無ければ config.json の targetLang を見る。
 * 表示言語を決めるだけの処理なので、未対応コードや壊れた config でも
 * 例外を投げず既定(ja)に倒す(本来のエラーは各コマンドが後で報告する)。
 */
function resolveCliUiLocale(cliLang: string | undefined): UiLocale {
  try {
    const targetLang = resolveTargetLang(cliLang, configPathFor(process.cwd()));
    return uiLocaleForTargetLang(targetLang);
  } catch {
    return "ja";
  }
}

async function main(): Promise<void> {
  // 引数解析より前に、config.json の翻訳先から表示言語を仮決めする
  // (未知のオプションや --help もこのロケールで案内するため)
  setUiLocale(resolveCliUiLocale(undefined));

  let parsed: ReturnType<typeof parseCliArgs>;
  try {
    parsed = parseCliArgs();
  } catch (error) {
    // 未知のオプションなど。Node の例外をそのまま投げず、使い方を添える
    process.stderr.write(
      `${m().errorPrefix(
        error instanceof Error ? error.message : String(error)
      )}\n\n${m().usage()}`
    );
    process.exit(1);
  }
  const { values, positionals } = parsed;

  // --lang 指定があればそれを優先して表示言語を確定する
  setUiLocale(resolveCliUiLocale(values.lang));

  if (values.version) {
    console.log(cliVersion());
    return;
  }

  const command = positionals[0];
  if (values.help || command === undefined) {
    process.stdout.write(m().usage());
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

  process.stderr.write(`${m().unknownCommand(command)}\n\n${m().usage()}`);
  process.exit(1);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${m().errorPrefix(
      error instanceof Error ? error.message : String(error)
    )}\n`
  );
  process.exit(1);
});
