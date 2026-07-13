# yakudoc-ai-prep

[![npm](https://img.shields.io/npm/v/yakudoc-ai-prep.svg)](https://www.npmjs.com/package/yakudoc-ai-prep)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[yakudoc](https://www.npmjs.com/package/yakudoc) の翻訳エンジン(任意の AI に依頼する下準備)です。翻訳待ちのエントリから、そのまま LLM に貼れる依頼文を生成し、返ってきた結果を書き戻します。コード片・リンク・型注釈はプレースホルダーで保護され、壊れた訳文は採用されません。

`yakudoc-mt`(オフラインの内蔵モデル)とは択一で、どちらか一方を入れれば動きます。

## 使い方

```bash
npm install --save-dev yakudoc-ai-prep

# 1. 下準備ファイルを生成する
npx yakudoc translate --engine prep
```

`.yakudoc/ai/` に次が出力されます。

- `prompt.md` — 翻訳ルールと用語集、保護済みの原文をまとめた依頼文
- `request.json` — 機械可読な原文一覧とプレースホルダー対応表

```bash
# 2. prompt.md を Claude などの LLM に渡し、返ってきた JSON を
#    .yakudoc/ai/response.json に保存してから書き戻す
npx yakudoc translate --engine prep --apply .yakudoc/ai/response.json
```

用語集(`.yakudoc/glossary.json`)を `{ "英語": "日本語" }` 形式で育てると、依頼文に反映されます。オフライン・API キー不要で済ませたい場合は [yakudoc-mt](https://www.npmjs.com/package/yakudoc-mt) の内蔵モデルも使えます。

詳しい導入・翻訳の手順は [yakudoc の README](https://github.com/daiki-moritake/yakudoc#readme) を参照してください。

## ライセンス

[MIT](./LICENSE)
