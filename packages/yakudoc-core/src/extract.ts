import * as path from "node:path";
import * as ts from "typescript";
import { hashText } from "./normalize";
import {
  mergeTranslations,
  readTranslations,
  resolveTranslationsPath,
  writeTranslations,
} from "./translationsFile";

export interface ExtractedComment {
  hash: string;
  original: string;
  symbol: string;
}

/**
 * コメントが翻訳対象にならないタグ。
 * コード片・参照・リテラル値であり、翻訳するとかえって壊れるもの。
 */
const SKIP_TAGS = new Set([
  "example",
  "see",
  "inheritdoc",
  "link",
  "linkcode",
  "linkplain",
  "default",
  "defaultvalue",
]);

/**
 * 1 ファイル分の JSDoc から翻訳対象テキストを抽出する。
 *
 * 抽出単位は「説明文」と「各タグの説明文」。tsserver がホバーで返す
 * documentation / tags の text 部分と対応しており、プラグイン側は
 * 同じ hashText で照合する。
 */
export function extractFromSourceFile(
  sourceFile: ts.SourceFile,
  relativePath: string
): ExtractedComment[] {
  const results: ExtractedComment[] = [];
  const seen = new Set<string>();

  const add = (text: string | undefined, symbol: string): void => {
    const original = text?.trim();
    if (!original) {
      return;
    }
    const hash = hashText(original);
    if (seen.has(hash)) {
      return;
    }
    seen.add(hash);
    results.push({ hash, original, symbol });
  };

  const visit = (node: ts.Node): void => {
    // jsDoc はパーサが宣言ノードに付与する内部プロパティ(公開 API には無い)
    const jsDocs = (node as { jsDoc?: ts.JSDoc[] }).jsDoc;
    if (jsDocs) {
      const name = symbolPathOf(node);
      const symbol = name ? `${relativePath}#${name}` : relativePath;
      for (const doc of jsDocs) {
        add(ts.getTextOfJSDocComment(doc.comment), symbol);
        for (const tag of doc.tags ?? []) {
          if (SKIP_TAGS.has(tag.tagName.text.toLowerCase())) {
            continue;
          }
          add(ts.getTextOfJSDocComment(tag.comment), symbol);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return results;
}

/** 宣言ノードから "Greeter.greet" のようなドット区切りの名前を組み立てる */
function symbolPathOf(node: ts.Node): string | undefined {
  const names: string[] = [];
  let current: ts.Node | undefined = ts.isVariableStatement(node)
    ? node.declarationList.declarations[0]
    : node;
  while (current && !ts.isSourceFile(current)) {
    // VariableStatement は内側の VariableDeclaration が名前を持つので飛ばす
    if (!ts.isVariableStatement(current)) {
      const name = ts.getNameOfDeclaration(current as ts.Declaration);
      if (name) {
        names.unshift(
          ts.isIdentifier(name) ||
            ts.isPrivateIdentifier(name) ||
            ts.isStringLiteral(name)
            ? name.text
            : name.getText()
        );
      }
    }
    current = current.parent;
  }
  return names.length > 0 ? names.join(".") : undefined;
}

export interface ExtractOptions {
  /** プロジェクトルート。tsconfig 探索と出力パスの基準 */
  projectDir: string;
  /** tsconfig.json のパス(既定: projectDir から探索) */
  tsconfigPath?: string;
  /** 出力先(既定: .yakudoc/translations.json) */
  outPath?: string;
  /** ソースから消えた原文のエントリを削除する(既定: 残す) */
  prune?: boolean;
}

export interface ExtractSummary {
  outPath: string;
  fileCount: number;
  extracted: number;
  translated: number;
  untranslated: number;
  stale: number;
  pruned: boolean;
}

/**
 * tsconfig.json のファイル一覧を走査して JSDoc を抽出し、
 * 既存の translations.json とマージして書き出す。
 *
 * 差分翻訳の要: 既存エントリの訳文はハッシュが一致する限り保持され、
 * 原文が変わったコメントは新しいハッシュの「翻訳待ち」エントリになる。
 */
export function extractProject(options: ExtractOptions): ExtractSummary {
  const projectDir = path.resolve(options.projectDir);
  const configPath = options.tsconfigPath
    ? path.resolve(projectDir, options.tsconfigPath)
    : ts.findConfigFile(projectDir, ts.sys.fileExists, "tsconfig.json");
  if (!configPath || !ts.sys.fileExists(configPath)) {
    throw new Error(
      "tsconfig.json が見つかりません。--project でパスを指定してください。"
    );
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n")
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath)
  );

  const extracted: ExtractedComment[] = [];
  const seen = new Set<string>();
  let fileCount = 0;
  for (const fileName of parsed.fileNames) {
    const text = ts.sys.readFile(fileName);
    if (text === undefined) {
      continue;
    }
    fileCount += 1;
    const sourceFile = ts.createSourceFile(
      fileName,
      text,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true
    );
    const relativePath = path
      .relative(projectDir, fileName)
      .split(path.sep)
      .join("/");
    for (const item of extractFromSourceFile(sourceFile, relativePath)) {
      if (seen.has(item.hash)) {
        continue;
      }
      seen.add(item.hash);
      extracted.push(item);
    }
  }

  const outPath = resolveTranslationsPath(projectDir, options.outPath);
  const existing = readTranslations(outPath) ?? {};
  const prune = options.prune ?? false;
  const { merged, stats } = mergeTranslations(existing, extracted, { prune });
  writeTranslations(outPath, merged);

  return {
    outPath,
    fileCount,
    extracted: extracted.length,
    translated: stats.translated,
    untranslated: stats.untranslated,
    stale: stats.stale,
    pruned: prune,
  };
}
