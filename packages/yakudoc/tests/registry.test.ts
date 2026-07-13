import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_REGISTRY_URL,
  fetchCommunityPack,
  packUrlFor,
  resolveRegistryUrl,
  type FetchLike,
} from "../src/registry";

describe("resolveRegistryUrl", () => {
  it("優先順位: CLI > 環境変数 > config > 既定", () => {
    const env = { YAKUDOC_REGISTRY: "https://env.example" };
    assert.equal(
      resolveRegistryUrl("https://cli.example", "https://conf.example", env),
      "https://cli.example"
    );
    assert.equal(
      resolveRegistryUrl(undefined, "https://conf.example", env),
      "https://env.example"
    );
    assert.equal(
      resolveRegistryUrl(undefined, "https://conf.example", {}),
      "https://conf.example"
    );
    assert.equal(resolveRegistryUrl(undefined, undefined, {}), DEFAULT_REGISTRY_URL);
  });
});

describe("packUrlFor", () => {
  it("packs/<lang>/<ファイル名> の URL を組み立てる(末尾スラッシュ許容)", () => {
    assert.equal(
      packUrlFor("https://reg.example/base/", "ja", "zod"),
      "https://reg.example/base/packs/ja/zod.json"
    );
  });

  it("スコープ付きパッケージは __ 置換とエンコードを行う", () => {
    assert.equal(
      packUrlFor("https://reg.example", "ko", "@types/node"),
      "https://reg.example/packs/ko/%40types__node.json"
    );
  });
});

function fakeFetch(
  status: number,
  body: string
): FetchLike {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  });
}

describe("fetchCommunityPack", () => {
  const options = {
    registryUrl: "https://reg.example",
    lang: "ja",
    packageName: "zod",
  };

  it("200 でパック形式なら found", async () => {
    const body = JSON.stringify({
      name: "zod",
      version: "3.0.0",
      lang: "ja",
      entries: { abc: { original: "Parses.", translated: "解析します。" } },
    });
    const result = await fetchCommunityPack({
      ...options,
      fetchImpl: fakeFetch(200, body),
    });
    assert.equal(result.status, "found");
    if (result.status === "found") {
      assert.equal(result.pack.entries.abc.translated, "解析します。");
    }
  });

  it("404 は not-found(エラーではなく未公開)", async () => {
    const result = await fetchCommunityPack({
      ...options,
      fetchImpl: fakeFetch(404, "Not Found"),
    });
    assert.equal(result.status, "not-found");
  });

  it("その他の HTTP エラーは error", async () => {
    const result = await fetchCommunityPack({
      ...options,
      fetchImpl: fakeFetch(500, "oops"),
    });
    assert.equal(result.status, "error");
  });

  it("JSON でない応答は error", async () => {
    const result = await fetchCommunityPack({
      ...options,
      fetchImpl: fakeFetch(200, "<html>rate limited</html>"),
    });
    assert.equal(result.status, "error");
  });

  it("ネットワーク例外は error に変換され、例外は投げない", async () => {
    const failing: FetchLike = async () => {
      throw new Error("ECONNREFUSED");
    };
    const result = await fetchCommunityPack({ ...options, fetchImpl: failing });
    assert.equal(result.status, "error");
    if (result.status === "error") {
      assert.match(result.message, /ECONNREFUSED/);
    }
  });
});
