import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import {
  configPathBeside,
  readConfig,
  resolveTargetLang,
  writeConfig,
} from "../src/config";

const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempConfigPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-config-"));
  tempDirs.push(dir);
  return path.join(dir, ".yakudoc", "config.json");
}

describe("configPathBeside", () => {
  it("translations.json と同じディレクトリの config.json を指す", () => {
    assert.equal(
      configPathBeside("/proj/.yakudoc/translations.json"),
      path.join("/proj/.yakudoc", "config.json")
    );
  });
});

describe("read / write config", () => {
  it("書き出して読み戻せる", () => {
    const configPath = tempConfigPath();
    writeConfig(configPath, { targetLang: "de" });
    assert.deepEqual(readConfig(configPath), { targetLang: "de" });
  });

  it("ファイルが無ければ空の設定を返す", () => {
    assert.deepEqual(readConfig(tempConfigPath()), {});
  });

  it("未知のキーは読み込み時に落とす", () => {
    const configPath = tempConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify({ targetLang: "ko", unknown: true })
    );
    assert.deepEqual(readConfig(configPath), { targetLang: "ko" });
  });
});

describe("resolveTargetLang", () => {
  it("CLI 指定 > config.json > 既定(ja)の順で決まる", () => {
    const configPath = tempConfigPath();
    assert.equal(resolveTargetLang(undefined, configPath), "ja");

    writeConfig(configPath, { targetLang: "de" });
    assert.equal(resolveTargetLang(undefined, configPath), "de");
    assert.equal(resolveTargetLang("ko", configPath), "ko");
  });

  it("未対応の言語コードはどこから来てもエラーにする", () => {
    const configPath = tempConfigPath();
    assert.throws(() => resolveTargetLang("xx", configPath), /未対応の言語コード/);

    writeConfig(configPath, { targetLang: "yy" });
    assert.throws(
      () => resolveTargetLang(undefined, configPath),
      /未対応の言語コード/
    );
  });
});
