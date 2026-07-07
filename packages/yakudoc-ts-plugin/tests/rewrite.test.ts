import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type * as ts from "typescript/lib/tsserverlibrary";
import {
  rewriteDisplayParts,
  rewriteSignatureHelpItems,
  rewriteTags,
  Translate,
} from "../src/rewrite";

const dictionary: Record<string, string> = {
  "Fetches user data from the API.": "APIからユーザーデータを取得します。",
  "The user id.": "ユーザーID。",
};

const translate: Translate = (text) => dictionary[text.trim()];

describe("rewriteDisplayParts", () => {
  it("全体一致した場合は単一の text パーツに差し替える", () => {
    const parts: ts.SymbolDisplayPart[] = [
      { kind: "text", text: "Fetches user data from the API." },
    ];
    assert.deepEqual(rewriteDisplayParts(parts, translate), [
      { kind: "text", text: "APIからユーザーデータを取得します。" },
    ]);
  });

  it("全体で一致しない場合は text パーツだけを個別に差し替える", () => {
    // @param タグの text 相当: [parameterName, space, text]
    const parts: ts.SymbolDisplayPart[] = [
      { kind: "parameterName", text: "id" },
      { kind: "space", text: " " },
      { kind: "text", text: "The user id." },
    ];
    assert.deepEqual(rewriteDisplayParts(parts, translate), [
      { kind: "parameterName", text: "id" },
      { kind: "space", text: " " },
      { kind: "text", text: "ユーザーID。" },
    ]);
  });

  it("訳が無い場合は元の配列をそのまま返す", () => {
    const parts: ts.SymbolDisplayPart[] = [
      { kind: "text", text: "No translation here." },
    ];
    assert.equal(rewriteDisplayParts(parts, translate), parts);
  });

  it("undefined / 空配列はそのまま返す", () => {
    assert.equal(rewriteDisplayParts(undefined, translate), undefined);
    const empty: ts.SymbolDisplayPart[] = [];
    assert.equal(rewriteDisplayParts(empty, translate), empty);
  });
});

describe("rewriteTags", () => {
  it("タグの説明文を差し替え、text の無いタグは触らない", () => {
    const tags: ts.JSDocTagInfo[] = [
      {
        name: "param",
        text: [
          { kind: "parameterName", text: "id" },
          { kind: "space", text: " " },
          { kind: "text", text: "The user id." },
        ],
      },
      { name: "deprecated" },
    ];
    const result = rewriteTags(tags, translate)!;
    assert.equal(result[0].text![2].text, "ユーザーID。");
    assert.deepEqual(result[1], { name: "deprecated" });
  });
});

describe("rewriteSignatureHelpItems", () => {
  it("シグネチャ本体と各引数の documentation を差し替える", () => {
    const items = {
      applicableSpan: { start: 0, length: 1 },
      selectedItemIndex: 0,
      argumentIndex: 0,
      argumentCount: 1,
      items: [
        {
          isVariadic: false,
          prefixDisplayParts: [],
          suffixDisplayParts: [],
          separatorDisplayParts: [],
          documentation: [
            { kind: "text", text: "Fetches user data from the API." },
          ],
          tags: [],
          parameters: [
            {
              name: "id",
              documentation: [{ kind: "text", text: "The user id." }],
              displayParts: [],
              isOptional: false,
              isRest: false,
            },
          ],
        },
      ],
    } as unknown as ts.SignatureHelpItems;

    const result = rewriteSignatureHelpItems(items, translate)!;
    assert.equal(
      result.items[0].documentation[0].text,
      "APIからユーザーデータを取得します。"
    );
    assert.equal(
      result.items[0].parameters[0].documentation[0].text,
      "ユーザーID。"
    );
  });
});
