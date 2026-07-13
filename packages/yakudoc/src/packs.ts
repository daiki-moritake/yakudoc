import * as fs from "node:fs";
import * as path from "node:path";
import { resolveTranslationsPath } from "./translationsFile";
import type { TranslationEntry, TranslationsFile } from "./types";

/** .yakudoc/ 直下のパック置き場のディレクトリ名 */
export const PACKS_DIR_NAME = "packs";

/**
 * 依存パッケージ 1 つ分の翻訳パック。
 *
 * `.yakudoc/packs/<パッケージ名>.json` に保存されるファイルの形式そのものが
 * 共有可能なパックの形式でもある(ローカルのパック = 配布物)。entries の
 * キーは translations.json と同じ「正規化した原文のハッシュ」なので、
 * パッケージのバージョンが変わっても原文が同じエントリはそのまま生きる。
 */
export interface PackFile {
  /** npm パッケージ名(例: "zod"、"@types/node") */
  name: string;
  /** 抽出元にしたインストール済みバージョン */
  version: string;
  /** このパックの翻訳先言語コード(例: "ja") */
  lang: string;
  /** 生成元ツールとバージョン(例: "yakudoc@0.2.0")。無くてもよい */
  generator?: string;
  /** 翻訳エントリ。translations.json と同じ形式 */
  entries: TranslationsFile;
}

/** 読み込んだパックとその場所 */
export interface LoadedPack {
  filePath: string;
  pack: PackFile;
}

/**
 * パックのファイル名。スコープ区切りの "/" はファイル名に使えないため
 * "__" に置き換える(例: "@types/node" → "@types__node.json")。
 */
export function packFileNameFor(packageName: string): string {
  return `${packageName.replace(/\//g, "__")}.json`;
}

/** packFileNameFor の逆変換(一覧表示でファイル名からパッケージ名を推定する) */
export function packageNameFromFileName(fileName: string): string {
  return fileName.replace(/\.json$/i, "").replace(/__/g, "/");
}

/**
 * パック置き場のディレクトリを解決する。translations.json と同じ
 * `.yakudoc/` ディレクトリの下に置く(--out で translations.json を
 * 動かした場合はそれに追従する)。
 */
export function resolvePacksDir(
  projectDir: string,
  translationsPath?: string
): string {
  return path.join(
    path.dirname(resolveTranslationsPath(projectDir, translationsPath)),
    PACKS_DIR_NAME
  );
}

/** 特定パッケージのパックファイルのパス */
export function packPathFor(
  projectDir: string,
  packageName: string,
  translationsPath?: string
): string {
  return path.join(
    resolvePacksDir(projectDir, translationsPath),
    packFileNameFor(packageName)
  );
}

/** entries を translations.json と同じ検証規則で読み取る */
function sanitizeEntries(raw: unknown): TranslationsFile {
  const entries: TranslationsFile = {};
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return entries;
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = value as Partial<TranslationEntry> | null;
    if (!entry || typeof entry.original !== "string") {
      continue;
    }
    entries[key] = {
      original: entry.original,
      translated: typeof entry.translated === "string" ? entry.translated : "",
      ...(typeof entry.symbol === "string" ? { symbol: entry.symbol } : {}),
      ...(typeof entry.lang === "string" ? { lang: entry.lang } : {}),
    };
  }
  return entries;
}

/**
 * JSON 文字列(またはパース済みの値)をパックとして解釈する。
 *
 * 正規の形式は { name, version, lang, entries } だが、entries を持たない
 * 素の translations.json 形式(ハッシュ → エントリ)も受け付ける。
 * コミュニティ配布のファイルを手で packs/ に置いた場合や、レジストリの
 * 形式差異に対して寛容にするため。解釈できなければ undefined。
 */
export function parsePack(
  raw: unknown,
  fallbackName: string
): PackFile | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const data = raw as Record<string, unknown>;
  if (data.entries !== undefined) {
    const entries = sanitizeEntries(data.entries);
    return {
      name: typeof data.name === "string" ? data.name : fallbackName,
      version: typeof data.version === "string" ? data.version : "",
      lang: typeof data.lang === "string" ? data.lang : "",
      ...(typeof data.generator === "string"
        ? { generator: data.generator }
        : {}),
      entries,
    };
  }
  // 素の translations.json 形式(トップレベルがハッシュ → エントリ)
  const entries = sanitizeEntries(data);
  if (Object.keys(entries).length === 0) {
    return undefined;
  }
  return { name: fallbackName, version: "", lang: "", entries };
}

/** パックファイルを読み込む。存在しない・解釈できない場合は undefined */
export function readPack(filePath: string): PackFile | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return parsePack(parsed, packageNameFromFileName(path.basename(filePath)));
}

/** symbol → original 順に entries を整列して書き出す(diff を安定させるため) */
export function writePack(filePath: string, pack: PackFile): void {
  const sortedKeys = Object.keys(pack.entries).sort((a, b) => {
    const left = pack.entries[a];
    const right = pack.entries[b];
    return (
      (left.symbol ?? "").localeCompare(right.symbol ?? "") ||
      left.original.localeCompare(right.original)
    );
  });
  const entries: TranslationsFile = {};
  for (const key of sortedKeys) {
    entries[key] = pack.entries[key];
  }
  const data: PackFile = {
    name: pack.name,
    version: pack.version,
    lang: pack.lang,
    ...(pack.generator !== undefined ? { generator: pack.generator } : {}),
    entries,
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

/**
 * packs/ ディレクトリのパックを name 順で一覧する。
 * ディレクトリが無ければ空配列。壊れたファイルは読み飛ばす。
 */
export function listPacks(packsDir: string): LoadedPack[] {
  let fileNames: string[];
  try {
    fileNames = fs.readdirSync(packsDir);
  } catch {
    return [];
  }
  const packs: LoadedPack[] = [];
  for (const fileName of fileNames) {
    if (!fileName.toLowerCase().endsWith(".json")) {
      continue;
    }
    const filePath = path.join(packsDir, fileName);
    const pack = readPack(filePath);
    if (pack) {
      packs.push({ filePath, pack });
    }
  }
  packs.sort((a, b) => a.pack.name.localeCompare(b.pack.name));
  return packs;
}

/**
 * パックファイルを削除する。削除したら true、元々存在しなければ false。
 */
export function removePack(
  projectDir: string,
  packageName: string,
  translationsPath?: string
): { removed: boolean; filePath: string } {
  const filePath = packPathFor(projectDir, packageName, translationsPath);
  try {
    fs.rmSync(filePath);
    return { removed: true, filePath };
  } catch {
    return { removed: false, filePath };
  }
}
