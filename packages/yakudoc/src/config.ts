import * as fs from "node:fs";
import * as path from "node:path";
import { m } from "./i18n";
import { DEFAULT_TARGET_LANG, resolveLanguage } from "./languages";

/** .yakudoc/config.json の形式 */
export interface YakudocConfig {
  /** 翻訳先の言語コード(省略時: ja) */
  targetLang?: string;
  /** コミュニティ翻訳パックの取得元 URL(省略時: 既定のレジストリ) */
  registry?: string;
}

/**
 * プロジェクトの config.json のパス。
 * translations.json の --out には追従しない固定の場所(projectDir/.yakudoc/config.json)。
 * --out に追従させると、後で --out 無しで実行したときに設定が見つからず
 * 黙って既定言語に戻ってしまうため。
 */
export function configPathFor(projectDir: string): string {
  return path.join(projectDir, ".yakudoc", "config.json");
}

/**
 * config.json を読み込む。存在しなければ空の設定を返す。
 * 存在するのに読めない・解釈できない場合は黙って無視せず、案内付きのエラーにする
 * (保存済みの --lang が黙って無効になるのを防ぐため)。
 */
export function readConfig(configPath: string): YakudocConfig {
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw new Error(
      m().configReadFailed(
        configPath,
        error instanceof Error ? error.message : String(error)
      )
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(m().configNotJson(configPath));
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(m().configNotObject(configPath));
  }

  const { targetLang, registry } = parsed as YakudocConfig;
  return {
    ...(typeof targetLang === "string" ? { targetLang } : {}),
    ...(typeof registry === "string" ? { registry } : {}),
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
