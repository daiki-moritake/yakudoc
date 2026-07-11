import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it, mock } from "node:test";
import {
  createFakeContext,
  createFakeState,
  setActiveFake,
  vscodeApi,
  type FakeOptions,
  type FakeState,
} from "./fakeVscode";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-ext-test-"));
  tempDirs.push(dir);
  return dir;
}

// mock.module は登録時に値をスナップショットするため、安定した vscodeApi を
// 一度だけ渡し、extension も一度だけ import する。テストごとの差異は
// setActiveFake で状態を差し替えて表現する(Node バージョン差に非依存)。
let extension: typeof import("../src/extension");

before(async () => {
  mock.module("vscode", { namedExports: vscodeApi });
  extension = await import("../src/extension");
});

after(() => {
  mock.reset();
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** 新しい状態を有効化して activate まで実行する */
async function activateWith(options: FakeOptions): Promise<FakeState> {
  const state = createFakeState(options);
  setActiveFake(state);
  const context = createFakeContext(state.workspaceState);
  // 最小の ExtensionContext なので、公開シグネチャに合わせてキャストする
  await extension.activate(context as unknown as Parameters<typeof extension.activate>[0]);
  return state;
}

describe("activate", () => {
  it("有効時はステータスバーに JP を表示し、tsserver へ enabled:true を送る", async () => {
    const state = await activateWith({ enabled: true, hasTsExtension: true });

    assert.ok(state.statusBar.text.includes("JP"));
    assert.equal(state.statusBar.visible, true);
    assert.equal(state.statusBar.command, "yakudoc.toggle");
    assert.deepEqual(state.configurePluginCalls.at(-1), {
      name: "yakudoc-ts-plugin",
      config: { enabled: true },
    });
  });

  it("無効設定で起動するとステータスバーに EN を表示する", async () => {
    const state = await activateWith({ enabled: false, hasTsExtension: true });
    assert.ok(state.statusBar.text.includes("EN"));
  });
});

describe("yakudoc.toggle", () => {
  it("トグルで設定が反転し、その反映として configurePlugin と表示が更新される", async () => {
    const state = await activateWith({ enabled: true, hasTsExtension: true });
    const callsBefore = state.configurePluginCalls.length;

    await state.runCommand("yakudoc.toggle");

    assert.equal(state.getEnabled(), false);
    assert.ok(state.statusBar.text.includes("EN"));
    assert.deepEqual(state.configurePluginCalls.at(-1), {
      name: "yakudoc-ts-plugin",
      config: { enabled: false },
    });
    assert.ok(state.configurePluginCalls.length > callsBefore);

    await state.runCommand("yakudoc.toggle");
    assert.equal(state.getEnabled(), true);
    assert.ok(state.statusBar.text.includes("JP"));
    assert.deepEqual(state.configurePluginCalls.at(-1)?.config, { enabled: true });
  });
});

describe("yakudoc.init / yakudoc.extract / yakudoc.showStatus", () => {
  it("init は yakudoc ターミナルで npx yakudoc init を実行する", async () => {
    const state = await activateWith({ hasTsExtension: true });
    await state.runCommand("yakudoc.init");

    assert.equal(state.terminals.length, 1);
    assert.deepEqual(state.terminals[0].sentText, ["npx yakudoc init"]);
  });

  it("extract は yakudoc ターミナルで npx yakudoc extract を実行する", async () => {
    const state = await activateWith({ hasTsExtension: true });
    await state.runCommand("yakudoc.extract");

    assert.equal(state.terminals.length, 1);
    const terminal = state.terminals[0];
    assert.equal(terminal.name, "yakudoc");
    assert.ok(terminal.shown);
    assert.deepEqual(terminal.sentText, ["npx yakudoc extract"]);
  });

  it("showStatus は既存の yakudoc ターミナルを使い回す", async () => {
    const state = await activateWith({ hasTsExtension: true });
    await state.runCommand("yakudoc.extract");
    await state.runCommand("yakudoc.showStatus");

    // 新しいターミナルは作らず、1 つを使い回す
    assert.equal(state.terminals.length, 1);
    assert.deepEqual(state.terminals[0].sentText, [
      "npx yakudoc extract",
      "npx yakudoc status",
    ]);
  });
});

describe("yakudoc.registerPlugin", () => {
  it("tsconfig.json にプラグインを追記し、再起動を提案して実行する", async () => {
    const dir = tempDir();
    const tsconfigPath = path.join(dir, "tsconfig.json");
    fs.writeFileSync(
      tsconfigPath,
      `{
  // プロジェクト設定
  "compilerOptions": { "strict": true }
}`
    );

    const state = await activateWith({
      hasTsExtension: true,
      findFilesResult: [tsconfigPath],
      infoResponses: { "登録しました": "再起動" },
    });

    await state.runCommand("yakudoc.registerPlugin");

    const written = fs.readFileSync(tsconfigPath, "utf8");
    assert.ok(written.includes("yakudoc-ts-plugin"));
    assert.ok(written.includes("// プロジェクト設定"));
    assert.ok(state.executedCommands.includes("typescript.restartTsServer"));
  });

  it("既に登録済みなら書き換えず、その旨を通知する", async () => {
    const dir = tempDir();
    const tsconfigPath = path.join(dir, "tsconfig.json");
    const content = `{
  "compilerOptions": { "plugins": [{ "name": "yakudoc-ts-plugin" }] }
}`;
    fs.writeFileSync(tsconfigPath, content);

    const state = await activateWith({
      hasTsExtension: true,
      findFilesResult: [tsconfigPath],
    });
    await state.runCommand("yakudoc.registerPlugin");

    assert.equal(fs.readFileSync(tsconfigPath, "utf8"), content);
    assert.ok(state.messages.some((m) => m.message.includes("すべて登録済み")));
    assert.ok(!state.executedCommands.includes("typescript.restartTsServer"));
  });

  it("tsconfig.json が見つからなければ警告する", async () => {
    const state = await activateWith({ hasTsExtension: true, findFilesResult: [] });
    await state.runCommand("yakudoc.registerPlugin");
    assert.ok(
      state.messages.some(
        (m) => m.kind === "warning" && m.message.includes("見つかりません")
      )
    );
  });
});

describe("起動時の自動登録提案", () => {
  it("直下の tsconfig が未登録なら一度だけ提案し、承諾で追記する", async () => {
    const dir = tempDir();
    const tsconfigPath = path.join(dir, "tsconfig.json");
    fs.writeFileSync(tsconfigPath, `{ "compilerOptions": { "strict": true } }`);

    const state = await activateWith({
      hasTsExtension: true,
      workspaceFolders: [dir],
      infoResponses: { "登録されていません": "登録する", "登録しました": "再起動" },
    });
    // activate 内の offerRegistrationIfNeeded は非同期に走るので待つ
    await new Promise((resolve) => setImmediate(resolve));

    const written = fs.readFileSync(tsconfigPath, "utf8");
    assert.ok(written.includes("yakudoc-ts-plugin"));
    assert.equal(state.workspaceState.get("yakudoc.registrationPrompted"), true);
  });

  it("既に登録済みなら提案しない", async () => {
    const dir = tempDir();
    fs.writeFileSync(
      path.join(dir, "tsconfig.json"),
      `{ "compilerOptions": { "plugins": [{ "name": "yakudoc-ts-plugin" }] } }`
    );

    const state = await activateWith({
      hasTsExtension: true,
      workspaceFolders: [dir],
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.ok(!state.messages.some((m) => m.message.includes("登録されていません")));
  });
});
