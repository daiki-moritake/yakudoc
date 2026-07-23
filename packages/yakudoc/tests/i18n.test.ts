import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getUiLocale,
  m,
  setUiLocale,
  uiLocaleForTargetLang,
} from "../src/i18n";

// 各テスト後に既定(ja)へ戻す。モジュールレベルの activeLocale が
// 同一ファイル内の後続テストへ漏れないようにする。
afterEach(() => {
  setUiLocale("ja");
});

describe("uiLocaleForTargetLang", () => {
  it("ja(既定)は日本語 UI、それ以外は英語 UI", () => {
    assert.equal(uiLocaleForTargetLang("ja"), "ja");
    assert.equal(uiLocaleForTargetLang("en"), "en");
    assert.equal(uiLocaleForTargetLang("ko"), "en");
    assert.equal(uiLocaleForTargetLang("de"), "en");
  });

  it("大文字・前後の空白を許容する", () => {
    assert.equal(uiLocaleForTargetLang(" JA "), "ja");
    assert.equal(uiLocaleForTargetLang("Ja"), "ja");
  });
});

describe("表示ロケールの既定", () => {
  it("何も設定しなければ日本語", () => {
    assert.equal(getUiLocale(), "ja");
    assert.match(m().usage(), /使い方: yakudoc/);
  });
});

describe("setUiLocale", () => {
  it("en に切り替えると英語のメッセージを返す", () => {
    setUiLocale("en");
    assert.equal(getUiLocale(), "en");
    assert.match(m().usage(), /^Usage: yakudoc/);
    assert.equal(m().unknownCommand("foo"), "Unknown command: foo");
    assert.match(m().addNeedPackage(), /Please specify a package name/);
  });

  it("ja に戻すと日本語のメッセージを返す", () => {
    setUiLocale("en");
    setUiLocale("ja");
    assert.match(m().usage(), /使い方: yakudoc/);
    assert.equal(m().unknownCommand("foo"), "不明なコマンドです: foo");
  });
});

describe("メッセージカタログの一貫性", () => {
  const keys = Object.keys(m()) as (keyof ReturnType<typeof m>)[];

  it("ja と en が同じキー集合を持つ", () => {
    setUiLocale("ja");
    const jaKeys = Object.keys(m()).sort();
    setUiLocale("en");
    const enKeys = Object.keys(m()).sort();
    assert.deepEqual(jaKeys, enKeys);
  });

  it("全メッセージが非空文字列を返す(引数はダミーで埋める)", () => {
    for (const locale of ["ja", "en"] as const) {
      setUiLocale(locale);
      const catalog = m();
      for (const key of keys) {
        const fn = catalog[key] as (...args: unknown[]) => string;
        // 各メッセージは最大 4 個の埋め込み値を取る。数値/文字列どちらでも
        // 例外なく文字列化できるダミーを渡す。
        const out = fn("x", 1, 2, 3);
        assert.equal(
          typeof out,
          "string",
          `${locale}.${String(key)} が文字列を返さない`
        );
        assert.ok(
          out.length > 0,
          `${locale}.${String(key)} が空文字列を返す`
        );
      }
    }
  });

  it("代表的なメッセージが ja と en で異なる(訳し忘れ検出)", () => {
    setUiLocale("ja");
    const jaUnknown = m().unknownCommand("x");
    setUiLocale("en");
    const enUnknown = m().unknownCommand("x");
    assert.notEqual(jaUnknown, enUnknown);
  });
});
