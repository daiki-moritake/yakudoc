import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectEngine } from "../src/engineSelect";

const none = () => false;
const only = (name: string) => (packageName: string) => packageName === name;

describe("selectEngine", () => {
  it("--engine 指定はインストール状態に関わらず尊重する", () => {
    const selection = selectEngine("local", undefined, none);
    assert.equal(selection.engine, "local");
    assert.equal(selection.packageName, "yakudoc-mt");
    assert.equal(selection.note, undefined);
  });

  it("不明なエンジン名はエラーにする", () => {
    assert.throws(() => selectEngine("cloud", undefined, none), /不明なエンジン/);
  });

  it("--apply があれば prep に確定する", () => {
    const selection = selectEngine(undefined, "res.json", none);
    assert.equal(selection.engine, "prep");
    assert.match(selection.note ?? "", /--apply/);
  });

  it("インストール済みが 1 つならそれを自動選択して説明を付ける", () => {
    const selection = selectEngine(undefined, undefined, only("yakudoc-mt"));
    assert.equal(selection.engine, "local");
    assert.match(selection.note ?? "", /自動|インストール済み/);
  });

  it("どちらも無ければインストール手順つきのエラーにする", () => {
    assert.throws(
      () => selectEngine(undefined, undefined, none),
      /npm install --save-dev yakudoc-mt/
    );
  });

  it("両方あれば --engine の指定を求める", () => {
    assert.throws(
      () => selectEngine(undefined, undefined, () => true),
      /両方のエンジン/
    );
  });
});
