# yakudoc-ts-plugin

[![npm](https://img.shields.io/npm/v/yakudoc-ts-plugin.svg)](https://www.npmjs.com/package/yakudoc-ts-plugin)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[yakudoc](https://www.npmjs.com/package/yakudoc) の `tsserver` Language Service Plugin です。エディタのホバー・補完・シグネチャヘルプに出る JSDoc の documentation を、翻訳済みテキストに差し替えて表示します。

これは yakudoc の**表示側**の本体です。単体では使わず、通常は `yakudoc` の CLI(`npx yakudoc init`)から自動でセットアップされます。

## 使い方

```bash
npm install --save-dev yakudoc yakudoc-ts-plugin
npx yakudoc init   # tsconfig.json への登録と初回抽出をまとめて行う
```

手動で登録する場合は tsconfig.json に次を追記します。

```jsonc
{
  "compilerOptions": {
    "plugins": [{ "name": "yakudoc-ts-plugin" }]
  }
}
```

登録後、VSCode ではコマンドパレットから「TypeScript: Restart TS Server」を実行してください。

`.yakudoc/translations.json` と `.yakudoc/packs/*.json`(依存ライブラリの翻訳パック)を読み込み、原文テキストのハッシュで訳文を照合します。ファイルの変更やパックの追加・削除は自動検知され、エディタの再起動は不要です。

詳しい導入・翻訳の手順は [yakudoc の README](https://github.com/daiki-moritake/yakudoc#readme) を参照してください。

## ライセンス

[MIT](./LICENSE)
