import * as vscode from "vscode";
import { addYakudocPlugin, PLUGIN_NAME } from "./tsconfigRegistration";

function isEnabled(): boolean {
  return vscode.workspace.getConfiguration("yakudoc").get<boolean>("enabled", true);
}

/**
 * typescript-language-features 拡張の configurePlugin API に現在の設定を送る。
 * tsserver を再起動せずにプラグインの onConfigurationChanged へ届く。
 */
async function pushConfigToTsServer(): Promise<void> {
  const tsExtension = vscode.extensions.getExtension(
    "vscode.typescript-language-features"
  );
  if (!tsExtension) {
    return;
  }
  await tsExtension.activate();
  const api = (
    tsExtension.exports as
      | { getAPI?: (version: number) => { configurePlugin(name: string, config: unknown): void } | undefined }
      | undefined
  )?.getAPI?.(0);
  api?.configurePlugin(PLUGIN_NAME, { enabled: isEnabled() });
}

async function readTextFile(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
  } catch {
    return undefined;
  }
}

/** 指定した tsconfig 群にプラグインを登録し、変更件数を返す */
async function registerInto(uris: vscode.Uri[]): Promise<number> {
  let changedCount = 0;
  for (const uri of uris) {
    const raw = await readTextFile(uri);
    if (raw === undefined) {
      continue;
    }
    const { text, changed } = addYakudocPlugin(raw);
    if (changed) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(text, "utf8"));
      changedCount += 1;
    }
  }
  return changedCount;
}

const TERMINAL_NAME = "yakudoc";

/**
 * yakudoc CLI を統合ターミナルで実行する。
 * 出力(抽出件数や進捗一覧)をそのままユーザーに見せ、再実行もできるよう
 * 専用ターミナルを 1 つだけ使い回す。
 */
function runInTerminal(command: string): void {
  const terminal =
    vscode.window.terminals.find((t) => t.name === TERMINAL_NAME) ??
    vscode.window.createTerminal(TERMINAL_NAME);
  terminal.show();
  terminal.sendText(command);
}

async function offerTsServerRestart(): Promise<void> {
  const answer = await vscode.window.showInformationMessage(
    "yakudoc: プラグインを登録しました。反映には TS Server の再起動が必要です。",
    "再起動"
  );
  if (answer === "再起動") {
    await vscode.commands.executeCommand("typescript.restartTsServer");
  }
}

async function registerPluginCommand(): Promise<void> {
  const files = await vscode.workspace.findFiles(
    "**/tsconfig.json",
    "**/node_modules/**",
    50
  );
  if (files.length === 0) {
    void vscode.window.showWarningMessage(
      "yakudoc: ワークスペースに tsconfig.json が見つかりませんでした。"
    );
    return;
  }

  let targets = files;
  if (files.length > 1) {
    const picked = await vscode.window.showQuickPick(
      files.map((uri) => ({ label: vscode.workspace.asRelativePath(uri), uri })),
      {
        canPickMany: true,
        placeHolder: "プラグインを登録する tsconfig.json を選択してください",
      }
    );
    if (!picked || picked.length === 0) {
      return;
    }
    targets = picked.map((item) => item.uri);
  }

  const changedCount = await registerInto(targets);
  if (changedCount > 0) {
    await offerTsServerRestart();
  } else {
    void vscode.window.showInformationMessage(
      "yakudoc: 選択した tsconfig.json にはすべて登録済みです。"
    );
  }
}

/**
 * 起動時に一度だけ、ワークスペース直下の tsconfig.json が未登録なら登録を提案する。
 */
async function offerRegistrationIfNeeded(
  context: vscode.ExtensionContext
): Promise<void> {
  if (context.workspaceState.get<boolean>("yakudoc.registrationPrompted")) {
    return;
  }
  const missing: vscode.Uri[] = [];
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const uri = vscode.Uri.joinPath(folder.uri, "tsconfig.json");
    const raw = await readTextFile(uri);
    if (raw !== undefined && addYakudocPlugin(raw).changed) {
      missing.push(uri);
    }
  }
  if (missing.length === 0) {
    return;
  }
  await context.workspaceState.update("yakudoc.registrationPrompted", true);
  const answer = await vscode.window.showInformationMessage(
    "yakudoc: tsconfig.json に yakudoc-ts-plugin が登録されていません。登録しますか?",
    "登録する",
    "後で"
  );
  if (answer === "登録する" && (await registerInto(missing)) > 0) {
    await offerTsServerRestart();
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBar.command = "yakudoc.toggle";
  context.subscriptions.push(statusBar);

  const updateStatusBar = (): void => {
    if (isEnabled()) {
      statusBar.text = "$(globe) 訳 JP";
      statusBar.tooltip =
        "yakudoc: JSDoc を日本語訳で表示中(クリックで原文に戻す)";
    } else {
      statusBar.text = "$(globe) 訳 EN";
      statusBar.tooltip =
        "yakudoc: JSDoc を原文で表示中(クリックで日本語訳に切り替え)";
    }
    statusBar.show();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("yakudoc.toggle", async () => {
      const config = vscode.workspace.getConfiguration("yakudoc");
      const target = vscode.workspace.workspaceFolders
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
      // 反映は onDidChangeConfiguration 経由で行う
      await config.update("enabled", !isEnabled(), target);
    }),
    vscode.commands.registerCommand("yakudoc.registerPlugin", registerPluginCommand),
    vscode.commands.registerCommand("yakudoc.init", () =>
      runInTerminal("npx yakudoc init")
    ),
    vscode.commands.registerCommand("yakudoc.extract", () =>
      runInTerminal("npx yakudoc extract")
    ),
    vscode.commands.registerCommand("yakudoc.showStatus", () =>
      runInTerminal("npx yakudoc status")
    ),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("yakudoc.enabled")) {
        updateStatusBar();
        await pushConfigToTsServer();
      }
    })
  );

  updateStatusBar();
  await pushConfigToTsServer();
  void offerRegistrationIfNeeded(context);
}

export function deactivate(): void {}
