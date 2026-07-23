import * as path from "node:path";
import * as ts from "typescript";
import { configPathFor, readConfig, resolveTargetLang } from "./config";
import { m } from "./i18n";
import { effectivePluginsOf, PLUGIN_NAME } from "./init";
import { resolveInstalledPackage } from "./installed";
import { DEFAULT_TARGET_LANG } from "./languages";
import { listPacks, resolvePacksDir } from "./packs";
import { computeStatus } from "./status";
import { readTranslations, resolveTranslationsPath } from "./translationsFile";

export type DoctorLevel = "ok" | "warn" | "error";

export interface DoctorCheck {
  /** 検査項目名(表示用) */
  label: string;
  level: DoctorLevel;
  /** 現在の状態の説明 */
  detail: string;
  /** ok 以外のときの対処方法。複数行は \n 区切り */
  hint?: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
  /** error が 1 件でもあれば 1(スクリプトや CI 用) */
  exitCode: number;
}

export interface DoctorOptions {
  /** プロジェクトルート。tsconfig 探索と出力パスの基準 */
  projectDir: string;
  /** tsconfig.json のパス(既定: projectDir から探索) */
  tsconfigPath?: string;
  /** translations.json のパス(既定: .yakudoc/translations.json) */
  outPath?: string;
}

/** 翻訳エンジンとして探すパッケージ(cli.ts の ENGINE_PACKAGES と対応) */
const ENGINE_PACKAGE_NAMES = ["yakudoc-mt", "yakudoc-ai-prep"] as const;

/**
 * 導入状態を診断する。「init はしたのにホバーが変わらない」の原因を
 * ユーザー自身が特定できるよう、失敗しやすい箇所を順に検査する:
 *
 * 1. tsconfig.json にプラグインが登録されているか(extends 解決込み)
 * 2. yakudoc-ts-plugin が node_modules から解決できるか
 * 3. translations.json が存在するか(あれば進捗も表示)
 * 4. 翻訳先言語の設定が壊れていないか
 * 5. 翻訳エンジン(yakudoc-mt / yakudoc-ai-prep)が入っているか
 *
 * 検査はどれも読み取り専用で、ファイルを書き換えない。
 */
export function doctorProject(options: DoctorOptions): DoctorReport {
  const projectDir = path.resolve(options.projectDir);
  const checks: DoctorCheck[] = [];

  // 1. tsconfig.json の存在とプラグイン登録
  const tsconfigPath = options.tsconfigPath
    ? path.resolve(projectDir, options.tsconfigPath)
    : ts.findConfigFile(projectDir, ts.sys.fileExists, "tsconfig.json");
  if (!tsconfigPath || !ts.sys.fileExists(tsconfigPath)) {
    checks.push({
      label: m().doctorLabelPluginRegistration(),
      level: "error",
      detail: m().doctorTsconfigNotFound(),
      hint: m().doctorTsconfigNotFoundHint(),
    });
  } else {
    const tsconfigLabel = path.relative(projectDir, tsconfigPath) || tsconfigPath;
    const registered = (effectivePluginsOf(tsconfigPath) ?? []).some(
      (plugin) => plugin?.name === PLUGIN_NAME
    );
    checks.push(
      registered
        ? {
            label: m().doctorLabelPluginRegistration(),
            level: "ok",
            detail: m().doctorPluginRegisteredDetail(tsconfigLabel, PLUGIN_NAME),
          }
        : {
            label: m().doctorLabelPluginRegistration(),
            level: "error",
            detail: m().doctorPluginNotRegisteredDetail(
              tsconfigLabel,
              PLUGIN_NAME
            ),
            hint: m().doctorPluginNotRegisteredHint(),
          }
    );
  }

  // 2. プラグイン本体が node_modules から解決できるか
  const pluginDir = resolveInstalledPackage(projectDir, PLUGIN_NAME);
  checks.push(
    pluginDir
      ? {
          label: m().doctorLabelPluginBinary(),
          level: "ok",
          detail: path.relative(projectDir, pluginDir) || pluginDir,
        }
      : {
          label: m().doctorLabelPluginBinary(),
          level: "error",
          detail: m().doctorPluginBinaryMissingDetail(PLUGIN_NAME),
          hint: m().doctorPluginBinaryMissingHint(PLUGIN_NAME),
        }
  );

  // 4 の翻訳先言語を先に解決する(3 の進捗集計にも使うため)
  let targetLang: string | undefined;
  let langCheck: DoctorCheck;
  try {
    const yakudocConfigPath = configPathFor(projectDir);
    targetLang = resolveTargetLang(undefined, yakudocConfigPath);
    const fromConfig = readConfig(yakudocConfigPath).targetLang !== undefined;
    langCheck = {
      label: m().doctorLabelTargetLang(),
      level: "ok",
      detail: fromConfig
        ? m().doctorTargetLangFromConfig(targetLang)
        : m().doctorTargetLangDefault(targetLang),
    };
  } catch (error) {
    langCheck = {
      label: m().doctorLabelTargetLang(),
      level: "error",
      detail: error instanceof Error ? error.message : String(error),
      hint: m().doctorTargetLangErrorHint(DEFAULT_TARGET_LANG),
    };
  }

  // 3. translations.json とパックの存在・進捗
  const packs = listPacks(resolvePacksDir(projectDir, options.outPath));
  const outPath = resolveTranslationsPath(projectDir, options.outPath);
  const outLabel = path.relative(projectDir, outPath) || outPath;
  const translations = readTranslations(outPath);
  if (!translations) {
    checks.push(
      packs.length > 0
        ? {
            // 依存パッケージの翻訳だけを使う運用は正当なので警告にしない
            label: m().doctorLabelTranslations(),
            level: "ok",
            detail: m().doctorTranslationsNoneWithPacks(outLabel),
          }
        : {
            label: m().doctorLabelTranslations(),
            level: "warn",
            detail: m().doctorTranslationsMissingDetail(outLabel),
            hint: m().doctorTranslationsMissingHint(),
          }
    );
  } else {
    const counts = computeStatus(translations, targetLang ?? DEFAULT_TARGET_LANG);
    checks.push({
      label: m().doctorLabelTranslations(),
      level: "ok",
      detail: m().doctorTranslationsDetail(
        outLabel,
        counts.total,
        counts.translated,
        counts.untranslated
      ),
    });
  }

  // 3.5 依存パッケージの翻訳パック
  if (packs.length > 0) {
    const lang = targetLang ?? DEFAULT_TARGET_LANG;
    const parts = packs.map((loaded) => {
      const counts = computeStatus(loaded.pack.entries, lang);
      const version = loaded.pack.version ? `@${loaded.pack.version}` : "";
      return `${loaded.pack.name}${version} ${counts.translated}/${counts.total}`;
    });
    checks.push({
      label: m().doctorLabelPacks(),
      level: "ok",
      detail: m().doctorPacksDetail(packs.length, parts.join(", ")),
    });
  } else {
    checks.push({
      label: m().doctorLabelPacks(),
      level: "ok",
      detail: m().doctorPacksNoneDetail(),
    });
  }

  checks.push(langCheck);

  // 5. 翻訳エンジンの有無(手動編集でも運用できるため error にはしない)
  const engines = ENGINE_PACKAGE_NAMES.filter((name) =>
    resolveInstalledPackage(projectDir, name)
  );
  checks.push(
    engines.length > 0
      ? {
          label: m().doctorLabelEngine(),
          level: "ok",
          detail: engines.join(", "),
        }
      : {
          label: m().doctorLabelEngine(),
          level: "warn",
          detail: m().doctorEngineNoneDetail(),
          hint: m().doctorEngineNoneHint(),
        }
  );

  const hasError = checks.some((check) => check.level === "error");
  return { checks, exitCode: hasError ? 1 : 0 };
}
