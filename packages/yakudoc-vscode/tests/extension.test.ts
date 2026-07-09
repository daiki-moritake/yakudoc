import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, afterEach, describe, it, mock } from "node:test";
import { createFakeContext, createFakeVscode, type FakeVscode } from "./fakeVscode";

const EXTENSION_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/extension.ts"
);

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-ext-test-"));
  tempDirs.push(dir);
  return dir;
}

/**
 * vscode をモックしてから extension を動的 import し、activate まで実行する。
 * mock.module は import 前に登録する必要があるため、毎回この順序で行う。
 */
async function activateWith(fake: FakeVscode) {
  mock.module("vscode", { namedExports: fake.api });
  // 各テストでモックを差し替えるため、キャッシュを避けて毎回新しく評価させる。
  // 相対指定にクエリを付けると tsx が解決に失敗するので絶対 file URL を使う。
  const url = pathToFileURL(EXTENSION_PATH).href + `?v=${Math.random()}`;
  const extension = await import(url);
  const context = createFakeContext(fake.workspaceState);
  await extension.activate(context);
  return { extension, context };
}

afterEach(() => {
  mock.reset();
});

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("activate", () => {
  it("有効時はステータスバーに JP を表示し、tsserver へ enabled:true を送る", async () => {
    const fake = createFakeVscode({ enabled: true, hasTsExtension: true });
    await activateWith(fake);

    assert.ok(fake.statusBar.text.includes("JP"));
    assert.equal(fake.statusBar.visible, true);
    assert.equal(fake.statusBar.command, "yakudoc.toggle");
    // 起動時に現在の設定を tsserver へ同期する
    assert.deepEqual(fake.configurePluginCalls.at(-1), {
      name: "yakudoc-ts-plugin",
      config: { enabled: true },
    });
  });

  it("無効設定で起動するとステータスバーに EN を表示する", async () => {
    const fake = createFakeVscode({ enabled: false, hasTsExtension: true });
    await activateWith(fake);
    assert.ok(fake.statusBar.text.includes("EN"));
  });
});

describe("yakudoc.toggle", () => {
  it("トグルで設定が反転し、その反映として configurePlugin と表示が更新される", async () => {
    const fake = createFakeVscode({ enabled: true, hasTsExtension: true });
    await activateWith(fake);
    const callsBefore = fake.configurePluginCalls.length;

    // 実際のコマンドハンドラを実行する(update → onDidChangeConfiguration 経由で反映)
    await fake.runCommand("yakudoc.toggle");

    assert.equal(fake.getEnabled(), false);
    assert.ok(fake.statusBar.text.includes("EN"));
    // トグルによって新たな configurePlugin({ enabled: false }) が送られている
    const latest = fake.configurePluginCalls.at(-1);
    assert.deepEqual(latest, {
      name: "yakudoc-ts-plugin",
      config: { enabled: false },
    });
    assert.ok(fake.configurePluginCalls.length > callsBefore);

    // もう一度トグルすると true に戻る
    await fake.runCommand("yakudoc.toggle");
    assert.equal(fake.getEnabled(), true);
    assert.ok(fake.statusBar.text.includes("JP"));
    assert.deepEqual(fake.configurePluginCalls.at(-1)?.config, { enabled: true });
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

    const fake = createFakeVscode({
      hasTsExtension: true,
      findFilesResult: [tsconfigPath],
      infoResponses: { "登録しました": "再起動" },
    });
    await activateWith(fake);

    await fake.runCommand("yakudoc.registerPlugin");

    const written = fs.readFileSync(tsconfigPath, "utf8");
    assert.ok(written.includes("yakudoc-ts-plugin"));
    // コメントは保持される
    assert.ok(written.includes("// プロジェクト設定"));
    // 再起動が提案され、承諾したので tsserver 再起動コマンドが実行される
    assert.ok(fake.executedCommands.includes("typescript.restartTsServer"));
  });

  it("既に登録済みなら書き換えず、その旨を通知する", async () => {
    const dir = tempDir();
    const tsconfigPath = path.join(dir, "tsconfig.json");
    const content = `{
  "compilerOptions": { "plugins": [{ "name": "yakudoc-ts-plugin" }] }
}`;
    fs.writeFileSync(tsconfigPath, content);

    const fake = createFakeVscode({
      hasTsExtension: true,
      findFilesResult: [tsconfigPath],
    });
    await activateWith(fake);
    await fake.runCommand("yakudoc.registerPlugin");

    assert.equal(fs.readFileSync(tsconfigPath, "utf8"), content);
    assert.ok(
      fake.messages.some((m) => m.message.includes("すべて登録済み"))
    );
    assert.ok(!fake.executedCommands.includes("typescript.restartTsServer"));
  });

  it("tsconfig.json が見つからなければ警告する", async () => {
    const fake = createFakeVscode({ hasTsExtension: true, findFilesResult: [] });
    await activateWith(fake);
    await fake.runCommand("yakudoc.registerPlugin");
    assert.ok(
      fake.messages.some(
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

    const fake = createFakeVscode({
      hasTsExtension: true,
      workspaceFolders: [dir],
      infoResponses: { "登録されていません": "登録する", "登録しました": "再起動" },
    });
    await activateWith(fake);
    // activate 内の offerRegistrationIfNeeded は非同期に走るので待つ
    await new Promise((resolve) => setImmediate(resolve));

    const written = fs.readFileSync(tsconfigPath, "utf8");
    assert.ok(written.includes("yakudoc-ts-plugin"));
    // 二度目は提案しない(workspaceState に記録済み)
    assert.equal(fake.workspaceState.get("yakudoc.registrationPrompted"), true);
  });

  it("既に登録済みなら提案しない", async () => {
    const dir = tempDir();
    fs.writeFileSync(
      path.join(dir, "tsconfig.json"),
      `{ "compilerOptions": { "plugins": [{ "name": "yakudoc-ts-plugin" }] } }`
    );

    const fake = createFakeVscode({
      hasTsExtension: true,
      workspaceFolders: [dir],
    });
    await activateWith(fake);
    await new Promise((resolve) => setImmediate(resolve));

    assert.ok(
      !fake.messages.some((m) => m.message.includes("登録されていません"))
    );
  });
});
