import * as fs from "node:fs";
import * as path from "node:path";
import { DEFAULT_TARGET_LANG, resolveLanguage } from "./languages";

/** .yakudoc/config.json の形式 */
export interface YakudocConfig {
  /** 翻訳先の言語コード(省略時: ja) */
  targetLang?: string;
}

/** translations.json と同じディレクトリにある config.json のパス */
export function configPathBeside(translationsPath: string): string {
  return path.join(path.dirname(translationsPath), "config.json");
}

/** config.json を読み込む。存在しなければ空の設定を返す */
export function readConfig(configPath: string): YakudocConfig {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch {
    return {};
  }
  const parsed = JSON.parse(raw) as YakudocConfig;
  return {
    ...(typeof parsed.targetLang === "string"
      ? { targetLang: parsed.targetLang }
      : {}),
  };
}

/** config.json を書き出す(ディレクトリが無ければ作る) */
export function writeConfig(configPath: string, config: YakudocConfig): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

/**
 * 翻訳先言語を決める。優先順位: CLI の --lang > config.json > 既定(ja)。
 * どこから来たコードでも検証し、未対応ならエラーにする。
 */
export function resolveTargetLang(
  cliLang: string | undefined,
  configPath: string
): string {
  const code =
    cliLang ?? readConfig(configPath).targetLang ?? DEFAULT_TARGET_LANG;
  return resolveLanguage(code).code;
}
