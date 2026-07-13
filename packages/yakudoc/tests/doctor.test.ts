import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";
import { doctorProject, type DoctorCheck, type DoctorReport } from "../src/doctor";

const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yakudoc-doctor-"));
  tempDirs.push(dir);
  return dir;
}

/** node_modules 直下に解決可能な偽パッケージを置く */
function installFakePackage(dir: string, name: string): void {
  const pkgDir = path.join(dir, "node_modules", name);
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({ name, version: "0.0.0", main: "index.js" })
  );
  fs.writeFileSync(path.join(pkgDir, "index.js"), "module.exports = {};\n");
}

const REGISTERED_TSCONFIG = `{
  "compilerOptions": {
    "plugins": [{ "name": "yakudoc-ts-plugin" }]
  }
}
`;

function writeTranslationsFile(dir: string): void {
  fs.mkdirSync(path.join(dir, ".yakudoc"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".yakudoc", "translations.json"),
    JSON.stringify({
      aaaa: { original: "Greets.", translated: "挨拶する。", lang: "ja", symbol: "src/a.ts#greet" },
      bbbb: { original: "Farewell.", translated: "", symbol: "src/a.ts#bye" },
    })
  );
}

function checkOf(report: DoctorReport, label: string): DoctorCheck {
  const found = report.checks.find((check) => check.label === label);
  assert.ok(found, `検査項目 ${label} が存在する`);
  return found;
}

describe("doctorProject", () => {
  it("すべて整っていれば error なし・exitCode 0", () => {
    const dir = makeDir();
    fs.writeFileSync(path.join(dir, "tsconfig.json"), REGISTERED_TSCONFIG);
    installFakePackage(dir, "yakudoc-ts-plugin");
    installFakePackage(dir, "yakudoc-mt");
    writeTranslationsFile(dir);

    const report = doctorProject({ projectDir: dir });

    assert.equal(report.exitCode, 0);
    assert.equal(checkOf(report, "プラグイン登録").level, "ok");
    assert.equal(checkOf(report, "プラグイン本体").level, "ok");
    const translations = checkOf(report, "translations.json");
    assert.equal(translations.level, "ok");
    assert.match(translations.detail, /全 2 件 \/ 翻訳済み 1 \/ 翻訳待ち 1/);
    assert.equal(checkOf(report, "翻訳先言語").detail, "ja(既定)");
    assert.equal(checkOf(report, "翻訳エンジン").detail, "yakudoc-mt");
  });

  it("空のディレクトリでは登録・本体が error になり exitCode 1", () => {
    const report = doctorProject({ projectDir: makeDir() });

    assert.equal(report.exitCode, 1);
    const registration = checkOf(report, "プラグイン登録");
    assert.equal(registration.level, "error");
    assert.match(registration.detail, /tsconfig\.json が見つかりません/);
    assert.equal(checkOf(report, "プラグイン本体").level, "error");
    assert.equal(checkOf(report, "translations.json").level, "warn");
    assert.equal(checkOf(report, "翻訳エンジン").level, "warn");
  });

  it("tsconfig にプラグイン未登録なら init を案内する", () => {
    const dir = makeDir();
    fs.writeFileSync(
      path.join(dir, "tsconfig.json"),
      `{ "compilerOptions": { "strict": true } }`
    );

    const registration = checkOf(doctorProject({ projectDir: dir }), "プラグイン登録");

    assert.equal(registration.level, "error");
    assert.match(registration.hint ?? "", /yakudoc init/);
  });

  it("extends 先で登録済みなら ok と判定する", () => {
    const dir = makeDir();
    fs.writeFileSync(
      path.join(dir, "tsconfig.base.json"),
      REGISTERED_TSCONFIG
    );
    fs.writeFileSync(
      path.join(dir, "tsconfig.json"),
      `{ "extends": "./tsconfig.base.json" }`
    );

    assert.equal(
      checkOf(doctorProject({ projectDir: dir }), "プラグイン登録").level,
      "ok"
    );
  });

  it("config.json の翻訳先言語を表示に反映する", () => {
    const dir = makeDir();
    fs.writeFileSync(path.join(dir, "tsconfig.json"), REGISTERED_TSCONFIG);
    fs.mkdirSync(path.join(dir, ".yakudoc"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".yakudoc", "config.json"),
      `{ "targetLang": "de" }`
    );

    assert.equal(
      checkOf(doctorProject({ projectDir: dir }), "翻訳先言語").detail,
      "de(.yakudoc/config.json)"
    );
  });

  it("壊れた config.json は error として報告する", () => {
    const dir = makeDir();
    fs.writeFileSync(path.join(dir, "tsconfig.json"), REGISTERED_TSCONFIG);
    fs.mkdirSync(path.join(dir, ".yakudoc"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".yakudoc", "config.json"), "{ broken");

    const report = doctorProject({ projectDir: dir });

    assert.equal(report.exitCode, 1);
    assert.equal(checkOf(report, "翻訳先言語").level, "error");
  });

  it("検査は読み取り専用でファイルを作らない", () => {
    const dir = makeDir();
    fs.writeFileSync(path.join(dir, "tsconfig.json"), REGISTERED_TSCONFIG);

    doctorProject({ projectDir: dir });

    assert.deepEqual(fs.readdirSync(dir).sort(), ["tsconfig.json"]);
  });
});
