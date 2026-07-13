import { extractInstalledPackage } from "./depExtract";
import { packPathFor, readPack, writePack, type PackFile } from "./packs";
import {
  fetchCommunityPack,
  resolveRegistryUrl,
  type FetchLike,
  type RegistryFetchResult,
} from "./registry";
import { mergeTranslations, needsTranslation } from "./translationsFile";

export interface AddPackageOptions {
  projectDir: string;
  packageName: string;
  /** 翻訳先言語(解決済みコード) */
  targetLang: string;
  /** translations.json のパス(packs/ の場所を導出するために使う) */
  translationsPath?: string;
  /** ソースから消えた原文のエントリを削除する(既定: 残す) */
  prune?: boolean;
  /** コミュニティパックを取得しない(オフライン運用) */
  noFetch?: boolean;
  /** レジストリのベース URL(--registry。未指定なら env / config / 既定) */
  registryUrl?: string;
  /** config.json に保存されたレジストリ URL */
  configRegistryUrl?: string;
  /** パックの generator に記録する文字列(例: "yakudoc@0.2.0") */
  generator?: string;
  /** テスト用: fetch の差し替え */
  fetchImpl?: FetchLike;
}

export interface AddPackageSummary {
  name: string;
  version: string;
  filePath: string;
  /** 走査した型定義ファイル数 */
  fileCount: number;
  /** パックの総エントリ数(stale 含む) */
  total: number;
  /** 翻訳済みエントリ数 */
  translated: number;
  /** 翻訳待ちエントリ数 */
  untranslated: number;
  /** 今回コミュニティパックから採用した訳文の数 */
  fromCommunity: number;
  /** コミュニティパック取得の結果(スキップした場合は undefined) */
  fetchResult?: RegistryFetchResult;
}

/**
 * コミュニティパックの訳文を、翻訳待ちのエントリへだけ重ねる。
 * ローカルで付けた訳(手動編集や自前の翻訳)は上書きしない。
 * 採用した件数を返す。
 */
export function overlayCommunityPack(
  entries: PackFile["entries"],
  community: PackFile,
  targetLang: string
): number {
  let adopted = 0;
  for (const [hash, entry] of Object.entries(entries)) {
    if (!needsTranslation(entry, targetLang)) {
      continue;
    }
    const candidate = community.entries[hash];
    if (!candidate || !candidate.translated) {
      continue;
    }
    // 訳文の言語: エントリの lang > パック全体の lang > 取得時の言語(URL に
    // 言語が含まれるため、無指定は要求した言語のパックとみなす)
    const candidateLang = candidate.lang ?? (community.lang || targetLang);
    if (candidateLang !== targetLang) {
      continue;
    }
    entry.translated = candidate.translated;
    entry.lang = targetLang;
    adopted += 1;
  }
  return adopted;
}

/**
 * 依存パッケージの翻訳パックを作成・更新する(`yakudoc add` の本体)。
 *
 * 1. インストール済みパッケージの型定義から JSDoc を抽出する
 * 2. 既存パックとマージする(訳文はハッシュが一致する限り保持される)
 * 3. コミュニティパックを取得し、翻訳待ちのエントリにだけ訳文を重ねる
 *    (取得失敗は警告相当。オフラインでも 1〜2 は成立する)
 * 4. `.yakudoc/packs/<パッケージ名>.json` に書き出す
 */
export async function addPackage(
  options: AddPackageOptions
): Promise<AddPackageSummary> {
  const { info, fileCount, comments } = extractInstalledPackage(
    options.projectDir,
    options.packageName
  );

  const filePath = packPathFor(
    options.projectDir,
    options.packageName,
    options.translationsPath
  );
  const existing = readPack(filePath);
  const { merged } = mergeTranslations(existing?.entries ?? {}, comments, {
    prune: options.prune ?? false,
  });

  let fetchResult: RegistryFetchResult | undefined;
  let fromCommunity = 0;
  if (!options.noFetch) {
    fetchResult = await fetchCommunityPack({
      registryUrl: resolveRegistryUrl(
        options.registryUrl,
        options.configRegistryUrl
      ),
      lang: options.targetLang,
      packageName: options.packageName,
      fetchImpl: options.fetchImpl,
    });
    if (fetchResult.status === "found") {
      fromCommunity = overlayCommunityPack(
        merged,
        fetchResult.pack,
        options.targetLang
      );
    }
  }

  const pack: PackFile = {
    name: options.packageName,
    version: info.version,
    lang: options.targetLang,
    ...(options.generator !== undefined
      ? { generator: options.generator }
      : {}),
    entries: merged,
  };
  writePack(filePath, pack);

  let translated = 0;
  for (const entry of Object.values(merged)) {
    if (!needsTranslation(entry, options.targetLang)) {
      translated += 1;
    }
  }
  const total = Object.keys(merged).length;
  return {
    name: options.packageName,
    version: info.version,
    filePath,
    fileCount,
    total,
    translated,
    untranslated: total - translated,
    fromCommunity,
    fetchResult,
  };
}
