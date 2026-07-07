import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import * as ts from "typescript";
import type * as tsserver from "typescript/lib/tsserverlibrary";
import { hashText } from "yakudoc-core";
import init from "../src/index";

const DESCRIPTION = "Fetches user data from the API.";
const PARAM_DOC = "The user id.";
const RETURNS_DOC = "The user's display name.";

const SOURCE = `/**
 * ${DESCRIPTION}
 * @param id ${PARAM_DOC}
 * @returns ${RETURNS_DOC}
 */
export function fetchUser(id: string): string {
  return id;
}

export const name = fetchUser("42");
`;

let projectRoot: string;
let mainFile: string;
let proxy: tsserver.LanguageService;
let plugin: ReturnType<typeof init>;

function createLanguageService(files: Map<string, string>): ts.LanguageService {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    strict: true,
  };
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: () => "1",
    getScriptSnapshot: (fileName) => {
      const content = files.get(fileName) ?? ts.sys.readFile(fileName);
      return content === undefined
        ? undefined
        : ts.ScriptSnapshot.fromString(content);
    },
    getCurrentDirectory: () => projectRoot,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
    fileExists: (fileName) => files.has(fileName) || ts.sys.fileExists(fileName),
    readFile: (fileName) => files.get(fileName) ?? ts.sys.readFile(fileName),
  };
  return ts.createLanguageService(host);
}

before(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-plugin-test-"));
  mainFile = path.join(projectRoot, "main.ts");

  fs.mkdirSync(path.join(projectRoot, ".yakudoc"));
  fs.writeFileSync(
    path.join(projectRoot, ".yakudoc", "translations.json"),
    JSON.stringify(
      {
        [hashText(DESCRIPTION)]: {
          original: DESCRIPTION,
          translated: "APIからユーザーデータを取得します。",
          symbol: "main.ts#fetchUser",
        },
        [hashText(PARAM_DOC)]: {
          original: PARAM_DOC,
          translated: "ユーザーID。",
          symbol: "main.ts#fetchUser",
        },
        [hashText(RETURNS_DOC)]: {
          original: RETURNS_DOC,
          translated: "ユーザーの表示名。",
          symbol: "main.ts#fetchUser",
        },
      },
      null,
      2
    )
  );

  const languageService = createLanguageService(
    new Map([[mainFile, SOURCE]])
  );

  plugin = init({ typescript: ts as unknown as typeof tsserver });
  const info = {
    config: {},
    languageService,
    languageServiceHost: {},
    project: {
      getCurrentDirectory: () => projectRoot,
      projectService: { logger: { info: () => {} } },
    },
  } as unknown as tsserver.server.PluginCreateInfo;
  proxy = plugin.create(info);
});

after(() => {
  fs.rmSync(projectRoot, { recursive: true, force: true });
});

/** 呼び出し箇所 fetchUser("42") の識別子の位置 */
function callSitePosition(): number {
  return SOURCE.lastIndexOf("fetchUser") + 1;
}

describe("yakudoc-ts-plugin (LanguageService 統合)", () => {
  it("ホバー: documentation が日本語に差し替わる", () => {
    const quickInfo = proxy.getQuickInfoAtPosition(mainFile, callSitePosition());
    assert.ok(quickInfo);
    assert.equal(
      ts.displayPartsToString(quickInfo.documentation),
      "APIからユーザーデータを取得します。"
    );
  });

  it("ホバー: @param / @returns タグの説明も差し替わる", () => {
    const quickInfo = proxy.getQuickInfoAtPosition(mainFile, callSitePosition());
    assert.ok(quickInfo?.tags);
    const param = quickInfo.tags.find((tag) => tag.name === "param");
    const returns = quickInfo.tags.find((tag) => tag.name === "returns");
    assert.ok(ts.displayPartsToString(param?.text).includes("ユーザーID。"));
    assert.equal(ts.displayPartsToString(returns?.text), "ユーザーの表示名。");
  });

  it("ホバー: シグネチャ表示(displayParts)は書き換えない", () => {
    const quickInfo = proxy.getQuickInfoAtPosition(mainFile, callSitePosition());
    assert.ok(quickInfo);
    const signature = ts.displayPartsToString(quickInfo.displayParts);
    assert.ok(signature.includes("fetchUser"));
    assert.ok(signature.includes("id: string"));
  });

  it("補完詳細: getCompletionEntryDetails の documentation も差し替わる", () => {
    const details = proxy.getCompletionEntryDetails(
      mainFile,
      callSitePosition(),
      "fetchUser",
      undefined,
      undefined,
      undefined,
      undefined
    );
    assert.ok(details);
    assert.equal(
      ts.displayPartsToString(details.documentation),
      "APIからユーザーデータを取得します。"
    );
  });

  it("シグネチャヘルプ: 引数ヒントの documentation も差し替わる", () => {
    const insideCall = SOURCE.lastIndexOf('"42"') + 1;
    const help = proxy.getSignatureHelpItems(mainFile, insideCall, undefined);
    assert.ok(help);
    assert.equal(
      ts.displayPartsToString(help.items[0].documentation),
      "APIからユーザーデータを取得します。"
    );
    assert.equal(
      ts.displayPartsToString(help.items[0].parameters[0].documentation),
      "ユーザーID。"
    );
  });

  it("configurePlugin で enabled: false を送ると原文表示に戻る", () => {
    plugin.onConfigurationChanged({ enabled: false });
    try {
      const quickInfo = proxy.getQuickInfoAtPosition(
        mainFile,
        callSitePosition()
      );
      assert.equal(
        ts.displayPartsToString(quickInfo?.documentation),
        DESCRIPTION
      );
    } finally {
      plugin.onConfigurationChanged({ enabled: true });
    }
    const quickInfo = proxy.getQuickInfoAtPosition(mainFile, callSitePosition());
    assert.equal(
      ts.displayPartsToString(quickInfo?.documentation),
      "APIからユーザーデータを取得します。"
    );
  });

  it("翻訳が無いシンボルは原文のまま表示される", () => {
    const untranslatedSource = `/** Not translated yet. */
export function untouched(): void {}
export const u = untouched;
`;
    const file = path.join(projectRoot, "untouched.ts");
    const languageService = createLanguageService(
      new Map([[file, untranslatedSource]])
    );
    const info = {
      config: {},
      languageService,
      languageServiceHost: {},
      project: {
        getCurrentDirectory: () => projectRoot,
        projectService: { logger: { info: () => {} } },
      },
    } as unknown as tsserver.server.PluginCreateInfo;
    const localProxy = plugin.create(info);
    const quickInfo = localProxy.getQuickInfoAtPosition(
      file,
      untranslatedSource.lastIndexOf("untouched") + 1
    );
    assert.equal(
      ts.displayPartsToString(quickInfo?.documentation),
      "Not translated yet."
    );
  });
});
