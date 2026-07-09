import * as fs from "node:fs";
import * as path from "node:path";

/**
 * extension.ts が使う範囲の vscode API をフェイクで再現する。
 * ファイル操作は実 fs を使い(Uri.fsPath 経由)、UI 応答とイベント配線は
 * テストから制御・観測できるようにする。
 *
 * 肝は config.update → onDidChangeConfiguration の配線を本物どおりに
 * 動かすこと。これによりトグルの反映経路
 * (update → 設定変更イベント → configurePlugin)を実際に実行できる。
 */

export interface FakeUri {
  fsPath: string;
  toString(): string;
}

function uri(fsPath: string): FakeUri {
  return { fsPath, toString: () => fsPath };
}

export interface ConfigurePluginCall {
  name: string;
  config: unknown;
}

export interface ShownMessage {
  kind: "info" | "warning";
  message: string;
  items: string[];
}

export interface FakeOptions {
  /** yakudoc.enabled の初期値 */
  enabled?: boolean;
  /** workspace フォルダ(実ディレクトリの絶対パス) */
  workspaceFolders?: string[];
  /** findFiles が返す tsconfig 群(絶対パス) */
  findFilesResult?: string[];
  /** typescript-language-features 拡張を存在させるか */
  hasTsExtension?: boolean;
  /** showInformationMessage が返す選択(メッセージ本文の部分一致 → 返す項目) */
  infoResponses?: Record<string, string>;
  /** showQuickPick が返す項目ラベル(部分一致で選択される) */
  quickPickPick?: string[];
}

export interface FakeVscode {
  api: Record<string, unknown>;
  /** 記録された configurePlugin 呼び出し */
  configurePluginCalls: ConfigurePluginCall[];
  /** 表示されたメッセージ */
  messages: ShownMessage[];
  /** 実行された executeCommand の id */
  executedCommands: string[];
  /** 登録されたコマンド */
  runCommand(id: string): Promise<unknown>;
  /** 現在のステータスバー状態 */
  statusBar: { text: string; tooltip: string; command?: string; visible: boolean };
  /** 現在の enabled 値 */
  getEnabled(): boolean;
  /** workspaceState のストア */
  workspaceState: Map<string, unknown>;
}

export function createFakeVscode(options: FakeOptions = {}): FakeVscode {
  const configStore = { "yakudoc.enabled": options.enabled ?? true };
  const configListeners: Array<(event: { affectsConfiguration(k: string): boolean }) => unknown> = [];
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  const configurePluginCalls: ConfigurePluginCall[] = [];
  const messages: ShownMessage[] = [];
  const executedCommands: string[] = [];
  const workspaceState = new Map<string, unknown>();

  const statusBar = {
    text: "",
    tooltip: "",
    command: undefined as string | undefined,
    visible: false,
    show() {
      this.visible = true;
    },
    hide() {
      this.visible = false;
    },
    dispose() {},
  };

  const api = {
    StatusBarAlignment: { Left: 1, Right: 2 },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },

    Uri: {
      file: (p: string) => uri(p),
      joinPath: (base: FakeUri, ...segments: string[]) =>
        uri(path.join(base.fsPath, ...segments)),
    },

    window: {
      createStatusBarItem: () => statusBar,
      showInformationMessage: (message: string, ...items: string[]) => {
        messages.push({ kind: "info", message, items });
        const matchKey = Object.keys(options.infoResponses ?? {}).find((k) =>
          message.includes(k)
        );
        return Promise.resolve(
          matchKey ? options.infoResponses![matchKey] : undefined
        );
      },
      showWarningMessage: (message: string, ...items: string[]) => {
        messages.push({ kind: "warning", message, items });
        return Promise.resolve(undefined);
      },
      showQuickPick: (
        items: Array<{ label: string; uri: FakeUri }>,
        _opts: unknown
      ) => {
        const picks = items.filter((item) =>
          (options.quickPickPick ?? []).some((label) => item.label.includes(label))
        );
        return Promise.resolve(picks);
      },
    },

    commands: {
      registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
        commands.set(id, handler);
        return { dispose() {} };
      },
      executeCommand: (id: string, ...args: unknown[]) => {
        executedCommands.push(id);
        const handler = commands.get(id);
        return Promise.resolve(handler ? handler(...args) : undefined);
      },
    },

    extensions: {
      getExtension: (id: string) => {
        if (id !== "vscode.typescript-language-features" || options.hasTsExtension === false) {
          return undefined;
        }
        return {
          activate: () => Promise.resolve(),
          exports: {
            getAPI: (_version: number) => ({
              configurePlugin: (name: string, config: unknown) => {
                configurePluginCalls.push({ name, config });
              },
            }),
          },
        };
      },
    },

    workspace: {
      workspaceFolders: (options.workspaceFolders ?? []).map((p) => ({
        uri: uri(p),
      })),
      getConfiguration: (section: string) => ({
        get: <T>(key: string, defaultValue: T): T => {
          const value = (configStore as Record<string, unknown>)[`${section}.${key}`];
          return (value === undefined ? defaultValue : value) as T;
        },
        update: (key: string, value: unknown, _target: unknown) => {
          (configStore as Record<string, unknown>)[`${section}.${key}`] = value;
          const event = {
            affectsConfiguration: (k: string) => k === `${section}.${key}`,
          };
          return Promise.all(configListeners.map((listener) => listener(event)));
        },
      }),
      onDidChangeConfiguration: (
        listener: (event: { affectsConfiguration(k: string): boolean }) => unknown
      ) => {
        configListeners.push(listener);
        return { dispose() {} };
      },
      findFiles: (_pattern: string, _exclude: string, _max: number) =>
        Promise.resolve((options.findFilesResult ?? []).map((p) => uri(p))),
      asRelativePath: (u: FakeUri) => u.fsPath,
      fs: {
        readFile: (u: FakeUri) => Promise.resolve(fs.readFileSync(u.fsPath)),
        writeFile: (u: FakeUri, content: Uint8Array) => {
          fs.writeFileSync(u.fsPath, content);
          return Promise.resolve();
        },
      },
    },
  };

  return {
    api: api as unknown as Record<string, unknown>,
    configurePluginCalls,
    messages,
    executedCommands,
    runCommand: (id: string) => {
      const handler = commands.get(id);
      if (!handler) {
        throw new Error(`command not registered: ${id}`);
      }
      return Promise.resolve(handler());
    },
    statusBar,
    getEnabled: () => configStore["yakudoc.enabled"],
    workspaceState,
  };
}

/** テスト用の最小 ExtensionContext */
export function createFakeContext(workspaceState: Map<string, unknown>) {
  return {
    subscriptions: [] as Array<{ dispose(): void }>,
    workspaceState: {
      get: <T>(key: string): T | undefined => workspaceState.get(key) as T | undefined,
      update: (key: string, value: unknown) => {
        workspaceState.set(key, value);
        return Promise.resolve();
      },
    },
  };
}
