import { packFileNameFor, parsePack, type PackFile } from "./packs";

/** コミュニティ翻訳パックのリポジトリ(export コマンドが PR 先として案内する) */
export const PACKS_REPO_URL = "https://github.com/daiki-moritake/yakudoc-packs";

/**
 * コミュニティ翻訳パックの既定の取得元。
 * GitHub リポジトリの raw URL で、`packs/<言語コード>/<パッケージ名>.json` を
 * 直接取りに行く(専用サーバー不要)。
 */
export const DEFAULT_REGISTRY_URL =
  "https://raw.githubusercontent.com/daiki-moritake/yakudoc-packs/main";

/** レジストリ URL を上書きする環境変数名 */
export const REGISTRY_ENV_VAR = "YAKUDOC_REGISTRY";

/**
 * レジストリのベース URL を決める。
 * 優先順位: CLI の --registry > 環境変数 > config.json の registry > 既定。
 */
export function resolveRegistryUrl(
  cliValue: string | undefined,
  configValue: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): string {
  return (
    cliValue ?? env[REGISTRY_ENV_VAR] ?? configValue ?? DEFAULT_REGISTRY_URL
  );
}

/** パッケージのパックを取りに行く URL を組み立てる */
export function packUrlFor(
  registryUrl: string,
  lang: string,
  packageName: string
): string {
  const base = registryUrl.replace(/\/+$/, "");
  return `${base}/packs/${encodeURIComponent(lang)}/${encodeURIComponent(
    packFileNameFor(packageName)
  )}`;
}

/** fetch の差し替え用の最小インターフェース(テストで注入する) */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type RegistryFetchResult =
  | { status: "found"; pack: PackFile; url: string }
  | { status: "not-found"; url: string }
  | { status: "error"; message: string; url: string };

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * コミュニティ翻訳パックを取得する。
 *
 * ネットワークは失敗して当たり前の前提で、例外は投げず結果を status で
 * 返す(add はオフラインでも成立する操作なので、呼び出し側は error を
 * 警告表示に留めて処理を続行する)。
 */
export async function fetchCommunityPack(options: {
  registryUrl: string;
  lang: string;
  packageName: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<RegistryFetchResult> {
  const url = packUrlFor(options.registryUrl, options.lang, options.packageName);
  const fetchImpl: FetchLike =
    options.fetchImpl ?? (fetch as unknown as FetchLike);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (response.status === 404) {
      return { status: "not-found", url };
    }
    if (!response.ok) {
      return {
        status: "error",
        message: `レジストリが HTTP ${response.status} を返しました`,
        url,
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await response.text());
    } catch {
      return {
        status: "error",
        message: "レジストリの応答を JSON として解釈できませんでした",
        url,
      };
    }
    const pack = parsePack(parsed, options.packageName);
    if (!pack) {
      return {
        status: "error",
        message: "レジストリの応答がパック形式ではありませんでした",
        url,
      };
    }
    return { status: "found", pack, url };
  } catch (error) {
    return {
      status: "error",
      message:
        controller.signal.aborted
          ? "タイムアウトしました"
          : error instanceof Error
            ? error.message
            : String(error),
      url,
    };
  } finally {
    clearTimeout(timer);
  }
}
