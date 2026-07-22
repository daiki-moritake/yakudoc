import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";
import { extractFromSourceFile, type ExtractedComment } from "./extract";
import { m } from "./i18n";
import { resolveInstalledPackage } from "./installed";

/** インストール済みパッケージの所在とバージョン */
export interface InstalledPackageInfo {
  name: string;
  version: string;
  dir: string;
}

/**
 * projectDir から Node の解決規則でパッケージを見つけ、package.json の
 * バージョンを読む。見つからなければ案内付きのエラー。
 */
export function resolveInstalledPackageInfo(
  projectDir: string,
  packageName: string
): InstalledPackageInfo {
  const dir = resolveInstalledPackage(projectDir, packageName);
  if (!dir) {
    throw new Error(m().packageNotInstalled(packageName));
  }
  let version = "";
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8")
    ) as { version?: string };
    version = typeof pkg.version === "string" ? pkg.version : "";
  } catch {
    // package.json が読めなくても抽出自体は続行できる
  }
  return { name: packageName, version, dir };
}

const DECLARATION_SUFFIXES = [".d.ts", ".d.mts", ".d.cts"];

/**
 * パッケージディレクトリ内の型定義ファイル(.d.ts / .d.mts / .d.cts)を
 * 再帰的に集める。入れ子の node_modules は対象外。パス順に整列して返す
 * (抽出結果の順序を安定させるため)。
 */
export function collectDeclarationFiles(packageDir: string): string[] {
  const results: string[] = [];
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) {
          continue;
        }
        walk(fullPath);
      } else if (
        entry.isFile() &&
        DECLARATION_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))
      ) {
        results.push(fullPath);
      }
    }
  };
  walk(packageDir);
  return results.sort();
}

export interface PackageExtractResult {
  info: InstalledPackageInfo;
  /** 走査した型定義ファイル数 */
  fileCount: number;
  comments: ExtractedComment[];
}

/**
 * インストール済みパッケージの型定義から JSDoc を抽出する。
 *
 * symbol は "zod/lib/types.d.ts#ZodType.parse" のように
 * パッケージ名からの相対パスで記録する(status の一覧や共有パックを
 * 見たときに、どのパッケージのどの API か分かるようにするため)。
 */
export function extractInstalledPackage(
  projectDir: string,
  packageName: string
): PackageExtractResult {
  const info = resolveInstalledPackageInfo(projectDir, packageName);
  const files = collectDeclarationFiles(info.dir);
  if (files.length === 0) {
    const typesHint = `@types/${packageName.replace(/^@.*?\//, "")}`;
    throw new Error(m().noTypeDefinitions(packageName, typesHint));
  }

  const comments: ExtractedComment[] = [];
  const seen = new Set<string>();
  for (const fileName of files) {
    const text = ts.sys.readFile(fileName);
    if (text === undefined) {
      continue;
    }
    const sourceFile = ts.createSourceFile(
      fileName,
      text,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true
    );
    const relativePath =
      `${packageName}/` +
      path.relative(info.dir, fileName).split(path.sep).join("/");
    for (const item of extractFromSourceFile(sourceFile, relativePath)) {
      if (seen.has(item.hash)) {
        continue;
      }
      seen.add(item.hash);
      comments.push(item);
    }
  }

  return { info, fileCount: files.length, comments };
}
