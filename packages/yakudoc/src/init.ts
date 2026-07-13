import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import { applyEdits, modify, parse } from "jsonc-parser";
import { configPathFor, readConfig, resolveTargetLang, writeConfig } from "./config";
import { extractProject, type ExtractSummary } from "./extract";

export const PLUGIN_NAME = "yakudoc-ts-plugin";

interface PluginEntry {
  name?: string;
}

interface TsconfigLike {
  compilerOptions?: {
    plugins?: unknown;
  };
}

/**
 * tsconfig.json(JSONC)のテキストに compilerOptions.plugins エントリを追加する。
 * コメントや既存のフォーマットは保持する。登録済みなら何もしない。
 *
 * effectivePlugins には extends 解決後の実効 plugins を渡す。tsconfig が
 * extends 先から plugins を継承している場合、ローカルに plugins を新設すると
 * TypeScript のマージ規則(キー単位の置換)で継承分が丸ごと消えるため、
 * 実効 plugins を種にしてローカル配列を組み立てる。
 *
 * 注意: この実装は packages/yakudoc-vscode/src/tsconfigRegistration.ts の
 * addYakudocPlugin と対で保守する(拡張側は typescript 非依存のため共有していない)。
 */
export function addPluginToTsconfig(
  tsconfigText: string,
  pluginName: string = PLUGIN_NAME,
  effectivePlugins?: PluginEntry[]
): { text: string; changed: boolean } {
  const root = (parse(tsconfigText) ?? {}) as TsconfigLike;
  const localPlugins = root.compilerOptions?.plugins;
  if (localPlugins !== undefined && !Array.isArray(localPlugins)) {
    throw new Error(
      "tsconfig.json の compilerOptions.plugins が配列ではありません。" +
        "配列に修正してから再実行してください。"
    );
  }

  const known = (effectivePlugins ?? localPlugins ?? []) as PluginEntry[];
  if (known.some((plugin) => plugin?.name === pluginName)) {
    return { text: tsconfigText, changed: false };
  }

  const formattingOptions = { insertSpaces: true, tabSize: 2 };
  const edits = Array.isArray(localPlugins)
    ? // ローカルに plugins 配列があるなら末尾に追記する
      modify(
        tsconfigText,
        ["compilerOptions", "plugins", localPlugins.length],
        { name: pluginName },
        { isArrayInsertion: true, formattingOptions }
      )
    : // ローカルに無いなら、extends からの継承分を含めた配列を新設する
      // (継承分を含めないと、この新設によって継承側の plugins が失効する)
      modify(
        tsconfigText,
        ["compilerOptions", "plugins"],
        [...(effectivePlugins ?? []), { name: pluginName }],
        { formattingOptions }
      );
  return { text: applyEdits(tsconfigText, edits), changed: true };
}

/**
 * extends を解決した後の実効 compilerOptions.plugins を返す。
 * 解決できない場合(tsconfig が壊れている等)は undefined。
 */
function effectivePluginsOf(configPath: string): PluginEntry[] | undefined {
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    return undefined;
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath)
  );
  const plugins = (parsed.options as { plugins?: unknown }).plugins;
  return Array.isArray(plugins) ? (plugins as PluginEntry[]) : undefined;
}

export interface InitOptions {
  /** プロジェクトルート。tsconfig 探索と出力パスの基準 */
  projectDir: string;
  /** tsconfig.json のパス(既定: projectDir から探索) */
  tsconfigPath?: string;
  /** translations.json の出力先(既定: .yakudoc/translations.json) */
  outPath?: string;
  /** 翻訳先の言語コード。指定すると .yakudoc/config.json に保存される */
  targetLang?: string;
}

export interface InitSummary {
  /** 登録対象になった tsconfig.json の絶対パス */
  tsconfigPath: string;
  /** 今回プラグインを追記したか(既に登録済みなら false) */
  pluginRegistered: boolean;
  /** 初回 extract の結果 */
  extract: ExtractSummary;
  /** 有効な翻訳先言語コード(--lang > config.json > 既定 ja) */
  targetLang: string;
  /** config.json の絶対パス(表示用) */
  configPath: string;
  /** 今回 config.json に翻訳先言語を保存したか */
  configWritten: boolean;
}

/**
 * yakudoc の導入を一括で行う。
 *
 * 1. tsconfig.json に yakudoc-ts-plugin を登録する(登録済みなら何もしない)
 * 2. extract を実行して .yakudoc/translations.json を生成する
 * 3. targetLang 指定時は .yakudoc/config.json に翻訳先言語を保存する
 *
 * いずれの手順も冪等で、既存の訳文や tsconfig のコメントは保持される。
 */
export function initProject(options: InitOptions): InitSummary {
  const projectDir = path.resolve(options.projectDir);
  // tsconfig を書き換える前に言語コード(--lang と config.json 双方)を検証する
  const yakudocConfigPath = configPathFor(projectDir);
  const targetLang = resolveTargetLang(options.targetLang, yakudocConfigPath);

  const configPath = options.tsconfigPath
    ? path.resolve(projectDir, options.tsconfigPath)
    : ts.findConfigFile(projectDir, ts.sys.fileExists, "tsconfig.json");
  if (!configPath || !ts.sys.fileExists(configPath)) {
    throw new Error(
      "tsconfig.json が見つかりません。--project でパスを指定するか、" +
        "`npx tsc --init` で作成してください。"
    );
  }

  const tsconfigText = fs.readFileSync(configPath, "utf8");
  const { text, changed } = addPluginToTsconfig(
    tsconfigText,
    PLUGIN_NAME,
    effectivePluginsOf(configPath)
  );
  if (changed) {
    fs.writeFileSync(configPath, text);
  }

  const extract = extractProject({
    projectDir,
    tsconfigPath: configPath,
    outPath: options.outPath,
  });

  if (options.targetLang) {
    writeConfig(yakudocConfigPath, {
      ...readConfig(yakudocConfigPath),
      targetLang,
    });
  }

  return {
    tsconfigPath: configPath,
    pluginRegistered: changed,
    extract,
    targetLang,
    configPath: yakudocConfigPath,
    configWritten: options.targetLang !== undefined,
  };
}
