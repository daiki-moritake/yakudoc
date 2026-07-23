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
    let result: { text: string; changed: boolean };
    try {
      result = addYakudocPlugin(raw);
    } catch (error) {
      // 編集できないファイル(plugins が配列以外など)は飛ばして知らせる
      void vscode.window.showWarningMessage(
        vscode.l10n.t(
          "yakudoc: Cannot edit {0}: {1}",
          vscode.workspace.asRelativePath(uri),
          error instanceof Error ? error.message : String(error)
        )
      );
      continue;
    }
    if (result.changed) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(result.text, "utf8"));
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
  const restart = vscode.l10n.t("Restart");
  const answer = await vscode.window.showInformationMessage(
    vscode.l10n.t(
      "yakudoc: Registered the plugin. Restart the TS Server to apply it."
    ),
    restart
  );
  if (answer === restart) {
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
      vscode.l10n.t("yakudoc: No tsconfig.json was found in the workspace.")
    );
    return;
  }

  let targets = files;
  if (files.length > 1) {
    const picked = await vscode.window.showQuickPick(
      files.map((uri) => ({ label: vscode.workspace.asRelativePath(uri), uri })),
      {
        canPickMany: true,
        placeHolder: vscode.l10n.t(
          "Select the tsconfig.json to register the plugin in"
        ),
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
      vscode.l10n.t(
        "yakudoc: The selected tsconfig.json files are all already registered."
      )
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
    if (raw === undefined) {
      continue;
    }
    try {
      if (addYakudocPlugin(raw).changed) {
        missing.push(uri);
      }
    } catch {
      // 編集できない tsconfig は起動時の自動提案では扱わない
    }
  }
  if (missing.length === 0) {
    return;
  }
  await context.workspaceState.update("yakudoc.registrationPrompted", true);
  const register = vscode.l10n.t("Register");
  const answer = await vscode.window.showInformationMessage(
    vscode.l10n.t(
      "yakudoc: yakudoc-ts-plugin is not registered in tsconfig.json. Register it?"
    ),
    register,
    vscode.l10n.t("Later")
  );
  if (answer === register && (await registerInto(missing)) > 0) {
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
      statusBar.text = vscode.l10n.t("$(globe) Translated");
      statusBar.tooltip = vscode.l10n.t(
        "yakudoc: Showing JSDoc translated (click to show the original)"
      );
    } else {
      statusBar.text = vscode.l10n.t("$(globe) Original");
      statusBar.tooltip = vscode.l10n.t(
        "yakudoc: Showing JSDoc as the original (click to show translations)"
      );
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
    vscode.commands.registerCommand("yakudoc.init", async () => {
      runInTerminal("npx yakudoc init");
      // ターミナル実行の完了は検知できないため、再起動の導線だけ先に出しておく
      const restart = vscode.l10n.t("Restart");
      const answer = await vscode.window.showInformationMessage(
        vscode.l10n.t(
          "yakudoc: Running init in the terminal. If the plugin was newly registered, restart the TS Server after it finishes."
        ),
        restart
      );
      if (answer === restart) {
        await vscode.commands.executeCommand("typescript.restartTsServer");
      }
    }),
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
