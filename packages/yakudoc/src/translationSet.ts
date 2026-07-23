import * as fs from "node:fs";
import * as path from "node:path";
import { m } from "./i18n";
import {
  listPacks,
  packPathFor,
  parsePack,
  resolvePacksDir,
  writePack,
  type PackFile,
} from "./packs";
import {
  needsTranslation,
  readTranslations,
  resolveTranslationsPath,
  writeTranslations,
} from "./translationsFile";
import type { TranslationsFile } from "./types";

/**
 * 翻訳エントリを持つファイル 1 つ分(プロジェクトの translations.json、
 * または依存パッケージの翻訳パック)。translate / status はこの配列を
 * 横断して処理する。
 */
export interface TranslationSource {
  /** 表示用ラベル(project: "translations.json"、pack: パッケージ名) */
  label: string;
  kind: "project" | "pack";
  filePath: string;
  entries: TranslationsFile;
  /** kind === "pack" のときのメタデータ(書き戻しに使う) */
  pack?: PackFile;
  /** applyTranslation で書き換えられたか(writeSources が書き出す対象) */
  dirty?: boolean;
}

/**
 * プロジェクトの翻訳対象ファイル一式を読み込む。
 * translations.json(存在すれば)+ packs/ 以下の全パック。
 * packages を指定するとそのパックだけに絞る(プロジェクト分は含めない)。
 */
export function loadProjectSources(
  projectDir: string,
  options: { translationsPath?: string; packages?: string[] } = {}
): TranslationSource[] {
  if (options.packages && options.packages.length > 0) {
    const sources: TranslationSource[] = [];
    for (const name of options.packages) {
      const filePath = packPathFor(projectDir, name, options.translationsPath);
      const source = loadSourceAt(filePath);
      if (!source) {
        throw new Error(m().packNotFound(name, filePath));
      }
      sources.push(source);
    }
    return sources;
  }

  const sources: TranslationSource[] = [];
  const translationsPath = resolveTranslationsPath(
    projectDir,
    options.translationsPath
  );
  const entries = readTranslations(translationsPath);
  if (entries) {
    sources.push({
      label: path.basename(translationsPath),
      kind: "project",
      filePath: translationsPath,
      entries,
    });
  }
  for (const loaded of listPacks(
    resolvePacksDir(projectDir, options.translationsPath)
  )) {
    sources.push({
      label: loaded.pack.name,
      kind: "pack",
      filePath: loaded.filePath,
      entries: loaded.pack.entries,
      pack: loaded.pack,
    });
  }
  return sources;
}

/**
 * パスの一覧から翻訳対象ファイルを読み込む(翻訳エンジン用)。
 * 各ファイルはパック形式か素の translations.json 形式かを内容で判定する。
 * 存在しないファイルは読み飛ばす。
 */
export function loadSourcesAt(paths: string[]): TranslationSource[] {
  const sources: TranslationSource[] = [];
  for (const filePath of paths) {
    const source = loadSourceAt(filePath);
    if (source) {
      sources.push(source);
    }
  }
  return sources;
}

/** 1 ファイルを読み込んで形式判定する。存在しない・壊れている場合は undefined */
function loadSourceAt(filePath: string): TranslationSource | undefined {
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
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    (parsed as { entries?: unknown }).entries !== undefined
  ) {
    const fallbackName = path
      .basename(filePath)
      .replace(/\.json$/i, "")
      .replace(/__/g, "/");
    const pack = parsePack(parsed, fallbackName);
    if (!pack) {
      return undefined;
    }
    return {
      label: pack.name,
      kind: "pack",
      filePath,
      entries: pack.entries,
      pack,
    };
  }
  const entries = readTranslations(filePath);
  if (!entries) {
    return undefined;
  }
  return {
    label: path.basename(filePath),
    kind: "project",
    filePath,
    entries,
  };
}

/** 翻訳待ちの 1 件(横断集計用)。symbol は最初に見つかったものを使う */
export interface PendingItem {
  hash: string;
  original: string;
  symbol?: string;
}

/**
 * 全ソースの翻訳待ちエントリをハッシュで重複排除して集める。
 * 同じ原文がプロジェクトとパックの両方にある場合も翻訳は 1 回で済み、
 * applyTranslation が両方へ書き戻す。
 */
export function collectPending(
  sources: TranslationSource[],
  targetLang: string
): PendingItem[] {
  const items = new Map<string, PendingItem>();
  for (const source of sources) {
    for (const [hash, entry] of Object.entries(source.entries)) {
      if (!needsTranslation(entry, targetLang) || items.has(hash)) {
        continue;
      }
      items.set(hash, {
        hash,
        original: entry.original,
        ...(entry.symbol !== undefined ? { symbol: entry.symbol } : {}),
      });
    }
  }
  return [...items.values()];
}

/**
 * 訳文をハッシュの一致する全ソースへ書き込む(メモリ上)。
 * 書き込んだソース数を返す(0 ならどこにも該当が無い)。
 */
export function applyTranslation(
  sources: TranslationSource[],
  hash: string,
  translated: string,
  lang: string
): number {
  let applied = 0;
  for (const source of sources) {
    const entry = source.entries[hash];
    if (!entry) {
      continue;
    }
    entry.translated = translated;
    entry.lang = lang;
    source.dirty = true;
    applied += 1;
  }
  return applied;
}

/** applyTranslation で変更のあったソースだけをファイルへ書き出す */
export function writeSources(sources: TranslationSource[]): void {
  for (const source of sources) {
    if (!source.dirty) {
      continue;
    }
    if (source.kind === "pack" && source.pack) {
      writePack(source.filePath, { ...source.pack, entries: source.entries });
    } else {
      writeTranslations(source.filePath, source.entries);
    }
    source.dirty = false;
  }
}
