import * as fs from "node:fs";
import * as path from "node:path";

/**
 * extension.ts が使う範囲の vscode API をフェイクで再現する。
 *
 * 設計上の制約: node:test の mock.module は登録時に namedExports の「値」を
 * スナップショットする(ゲッターは効かない)。そこで名前空間メンバー
 * (window / commands / workspace ...)は 1 度きりの安定した参照とし、
 * その中のメソッド・ゲッターが可変状態 `active` を読む形にする。
 * これにより「モック登録 1 回・extension import 1 回・状態だけ差し替え」で
 * テストごとの挙動を切り替えられ、Node のバージョン差にも依存しない。
 *
 * 肝は config.update → onDidChangeConfiguration の配線を本物どおりに
 * 動かすこと。トグルの反映経路(update → 設定変更イベント →
 * configurePlugin)を実際に実行できる。
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

export interface FakeTerminal {
  name: string;
  shown: boolean;
  sentText: string[];
  show(): void;
  sendText(text: string): void;
  dispose(): void;
}

export interface FakeOptions {
  enabled?: boolean;
  workspaceFolders?: string[];
  findFilesResult?: string[];
  hasTsExtension?: boolean;
  /** showInformationMessage: メッセージ本文の部分一致 → 返す項目 */
  infoResponses?: Record<string, string>;
  /** showQuickPick: 部分一致で選択されるラベル */
  quickPickPick?: string[];
}

type ConfigListener = (event: { affectsConfiguration(k: string): boolean }) => unknown;

/** 1 テスト分の可変状態と観測用レコーダ */
export interface FakeState {
  options: FakeOptions;
  configStore: Record<string, unknown>;
  configListeners: ConfigListener[];
  commands: Map<string, (...args: unknown[]) => unknown>;
  configurePluginCalls: ConfigurePluginCall[];
  messages: ShownMessage[];
  executedCommands: string[];
  terminals: FakeTerminal[];
  workspaceState: Map<string, unknown>;
  statusBar: {
    text: string;
    tooltip: string;
    command?: string;
    visible: boolean;
    show(): void;
    hide(): void;
    dispose(): void;
  };
  runCommand(id: string): Promise<unknown>;
  getEnabled(): boolean;
}

export function createFakeState(options: FakeOptions = {}): FakeState {
  const state: FakeState = {
    options,
    configStore: { "yakudoc.enabled": options.enabled ?? true },
    configListeners: [],
    commands: new Map(),
    configurePluginCalls: [],
    messages: [],
    executedCommands: [],
    terminals: [],
    workspaceState: new Map(),
    statusBar: {
      text: "",
      tooltip: "",
      command: undefined,
      visible: false,
      show() {
        this.visible = true;
      },
      hide() {
        this.visible = false;
      },
      dispose() {},
    },
    runCommand(id: string) {
      const handler = state.commands.get(id);
      if (!handler) {
        throw new Error(`command not registered: ${id}`);
      }
      return Promise.resolve(handler());
    },
    getEnabled() {
      return state.configStore["yakudoc.enabled"] as boolean;
    },
  };
  return state;
}

// mock.module で差し替える「現在の状態」。テストごとに setActiveFake で更新する。
let active: FakeState = createFakeState();

export function setActiveFake(state: FakeState): void {
  active = state;
}

/**
 * mock.module に一度だけ渡す安定した vscode namespace。
 * すべてのメソッド・ゲッターは呼び出し時に `active` を読む。
 */
export const vscodeApi = {
  StatusBarAlignment: { Left: 1, Right: 2 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },

  // ロケール未適用時の vscode.l10n.t を再現する。バンドルが無いので原文
  // (英語ソース文字列)を返し、{0}/{1}... の位置引数だけ差し込む。
  l10n: {
    t: (message: string, ...args: unknown[]): string =>
      args.length === 0
        ? message
        : message.replace(/\{(\d+)\}/g, (whole, index: string) => {
            const i = Number(index);
            return i < args.length ? String(args[i]) : whole;
          }),
  },

  Uri: {
    file: (p: string) => uri(p),
    joinPath: (base: FakeUri, ...segments: string[]) =>
      uri(path.join(base.fsPath, ...segments)),
  },

  window: {
    createStatusBarItem: () => active.statusBar,
    get terminals() {
      return active.terminals;
    },
    createTerminal: (name: string): FakeTerminal => {
      const terminal: FakeTerminal = {
        name,
        shown: false,
        sentText: [],
        show() {
          this.shown = true;
        },
        sendText(text: string) {
          this.sentText.push(text);
        },
        dispose() {},
      };
      active.terminals.push(terminal);
      return terminal;
    },
    showInformationMessage: (message: string, ...items: string[]) => {
      active.messages.push({ kind: "info", message, items });
      const matchKey = Object.keys(active.options.infoResponses ?? {}).find((k) =>
        message.includes(k)
      );
      return Promise.resolve(
        matchKey ? active.options.infoResponses![matchKey] : undefined
      );
    },
    showWarningMessage: (message: string, ...items: string[]) => {
      active.messages.push({ kind: "warning", message, items });
      return Promise.resolve(undefined);
    },
    showQuickPick: (items: Array<{ label: string; uri: FakeUri }>, _opts: unknown) => {
      const picks = items.filter((item) =>
        (active.options.quickPickPick ?? []).some((label) => item.label.includes(label))
      );
      return Promise.resolve(picks);
    },
  },

  commands: {
    registerCommand: (id: string, handler: (...args: unknown[]) => unknown) => {
      active.commands.set(id, handler);
      return { dispose() {} };
    },
    executeCommand: (id: string, ...args: unknown[]) => {
      active.executedCommands.push(id);
      const handler = active.commands.get(id);
      return Promise.resolve(handler ? handler(...args) : undefined);
    },
  },

  extensions: {
    getExtension: (id: string) => {
      if (
        id !== "vscode.typescript-language-features" ||
        active.options.hasTsExtension === false
      ) {
        return undefined;
      }
      return {
        activate: () => Promise.resolve(),
        exports: {
          getAPI: (_version: number) => ({
            configurePlugin: (name: string, config: unknown) => {
              active.configurePluginCalls.push({ name, config });
            },
          }),
        },
      };
    },
  },

  workspace: {
    get workspaceFolders() {
      return (active.options.workspaceFolders ?? []).map((p) => ({ uri: uri(p) }));
    },
    getConfiguration: (section: string) => ({
      get: <T>(key: string, defaultValue: T): T => {
        const value = active.configStore[`${section}.${key}`];
        return (value === undefined ? defaultValue : value) as T;
      },
      update: (key: string, value: unknown, _target: unknown) => {
        active.configStore[`${section}.${key}`] = value;
        const event = {
          affectsConfiguration: (k: string) => k === `${section}.${key}`,
        };
        return Promise.all(active.configListeners.map((listener) => listener(event)));
      },
    }),
    onDidChangeConfiguration: (listener: ConfigListener) => {
      active.configListeners.push(listener);
      return { dispose() {} };
    },
    findFiles: (_pattern: string, _exclude: string, _max: number) =>
      Promise.resolve((active.options.findFilesResult ?? []).map((p) => uri(p))),
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
