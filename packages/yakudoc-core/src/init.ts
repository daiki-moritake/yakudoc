import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import { applyEdits, modify, parse } from "jsonc-parser";
import { configPathBeside, readConfig, resolveTargetLang, writeConfig } from "./config";
import { extractProject, type ExtractSummary } from "./extract";
import { resolveLanguage } from "./languages";

export const PLUGIN_NAME = "yakudoc-ts-plugin";

interface TsconfigLike {
  compilerOptions?: {
    plugins?: Array<{ name?: string }>;
  };
}

/**
 * tsconfig.json(JSONC)のテキストに compilerOptions.plugins エントリを追加する。
 * コメントや既存のフォーマットは保持する。登録済みなら何もしない。
 */
export function addPluginToTsconfig(
  tsconfigText: string,
  pluginName: string = PLUGIN_NAME
): { text: string; changed: boolean } {
  const root = (parse(tsconfigText) ?? {}) as TsconfigLike;
  const plugins = root.compilerOptions?.plugins ?? [];
  if (plugins.some((plugin) => plugin?.name === pluginName)) {
    return { text: tsconfigText, changed: false };
  }
  const edits = modify(
    tsconfigText,
    ["compilerOptions", "plugins", plugins.length],
    { name: pluginName },
    {
      isArrayInsertion: true,
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    }
  );
  return { text: applyEdits(tsconfigText, edits), changed: true };
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
  // tsconfig を書き換える前に言語コードを検証する
  const explicitLang = options.targetLang
    ? resolveLanguage(options.targetLang).code
    : undefined;
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
  const { text, changed } = addPluginToTsconfig(tsconfigText);
  if (changed) {
    fs.writeFileSync(configPath, text);
  }

  const extract = extractProject({
    projectDir,
    tsconfigPath: configPath,
    outPath: options.outPath,
  });

  const yakudocConfigPath = configPathBeside(extract.outPath);
  if (explicitLang) {
    writeConfig(yakudocConfigPath, {
      ...readConfig(yakudocConfigPath),
      targetLang: explicitLang,
    });
  }

  return {
    tsconfigPath: configPath,
    pluginRegistered: changed,
    extract,
    targetLang:
      explicitLang ?? resolveTargetLang(undefined, yakudocConfigPath),
    configWritten: explicitLang !== undefined,
  };
}
