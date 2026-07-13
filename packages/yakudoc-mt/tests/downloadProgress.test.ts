import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createProgressRenderer,
  type DownloadProgressEvent,
} from "../src/downloadProgress";

const MB = 1024 * 1024;

function collect(): { messages: string[]; render: (event: DownloadProgressEvent) => void } {
  const messages: string[] = [];
  return { messages, render: createProgressRenderer((m) => messages.push(m)) };
}

describe("createProgressRenderer", () => {
  it("10% 刻みでだけ進捗を出す", () => {
    const { messages, render } = collect();
    for (const progress of [1, 5, 9, 10, 14, 19, 20, 100]) {
      render({ status: "progress", file: "model.onnx", progress, loaded: progress * MB, total: 100 * MB });
    }
    assert.deepEqual(
      messages.map((m) => m.match(/(\d+)%/)![1]),
      ["0", "10", "20", "100"]
    );
  });

  it("同じ刻みを二度は出さない", () => {
    const { messages, render } = collect();
    render({ status: "progress", file: "model.onnx", progress: 15, total: 100 * MB });
    render({ status: "progress", file: "model.onnx", progress: 16, total: 100 * MB });
    assert.equal(messages.length, 1);
  });

  it("1MB 未満の小さいファイルは報告しない", () => {
    const { messages, render } = collect();
    render({ status: "progress", file: "tokenizer.json", progress: 50, total: 0.2 * MB });
    assert.deepEqual(messages, []);
  });

  it("progress 以外のイベントは無視する", () => {
    const { messages, render } = collect();
    render({ status: "initiate", file: "model.onnx" });
    render({ status: "done", file: "model.onnx" });
    render({ status: "ready" });
    assert.deepEqual(messages, []);
  });

  it("ファイルごとに独立して刻む", () => {
    const { messages, render } = collect();
    render({ status: "progress", file: "a.onnx", progress: 30, total: 10 * MB });
    render({ status: "progress", file: "b.onnx", progress: 30, total: 10 * MB });
    assert.equal(messages.length, 2);
  });

  it("ファイル名と MB 表示を含む", () => {
    const { messages, render } = collect();
    render({
      status: "progress",
      file: "model.onnx",
      progress: 40,
      loaded: 123.4 * MB,
      total: 300 * MB,
    });
    assert.equal(messages[0], "ダウンロード中: model.onnx 40%(123.4 / 300.0 MB)");
  });
});
