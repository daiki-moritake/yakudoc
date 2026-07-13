# yakudoc

[![npm](https://img.shields.io/npm/v/yakudoc.svg)](https://www.npmjs.com/package/yakudoc)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**依存ライブラリの docs を、母語で読む。** / **Read your dependencies' docs in your language.**

lodash・zod・`@types/node`——エディタのホバーに出てくる英語の JSDoc を、コードを 1 行も書き換えずに日本語(ほか 21 言語)で表示するツールの CLI 本体です。

```bash
npx yakudoc add zod
```

これだけで、zod の API にホバーしたときの説明が日本語になります。公開済みのコミュニティ翻訳パックがあるライブラリなら、**訳文まで自動で入ります**(翻訳作業ゼロ)。

## しくみ

`tsserver` の Language Service Plugin([yakudoc-ts-plugin](https://www.npmjs.com/package/yakudoc-ts-plugin))として登録され、ホバー・補完・シグネチャヘルプが返す documentation を翻訳済みテキストに差し替えます。照合は**原文テキストのハッシュ**で行うため、依存ライブラリの `.d.ts` にもそのまま効き、ライブラリのバージョンが上がっても原文が変わっていない訳は生き続けます。原文(node_modules も自分のコードも)は書き換えません。

## クイックスタート

```bash
# 1. 導入(tsconfig.json へのプラグイン登録 + 自分のコードの抽出)
npm install --save-dev yakudoc yakudoc-ts-plugin
npx yakudoc init

# 2. 依存ライブラリの翻訳パックを追加(コミュニティ訳があれば自動適用)
npx yakudoc add zod lodash

# 3. 残りを翻訳する(内蔵モデル or 任意の AI。どちらか一方でよい)
npm install --save-dev yakudoc-mt          # 内蔵モデル(オフライン)
npx yakudoc translate --engine local
#   または
npm install --save-dev yakudoc-ai-prep     # 任意の AI に依頼
npx yakudoc translate --engine prep
```

VSCode ではコマンドパレットから「TypeScript: Restart TS Server」を実行すると反映されます(以降の更新は自動反映)。

## コマンド

| コマンド | 役割 |
| --- | --- |
| `add <pkg...>` | 依存ライブラリの型定義から JSDoc を抽出し、コミュニティ翻訳パックがあれば適用して `.yakudoc/packs/` に保存 |
| `remove <pkg...>` | 依存ライブラリの翻訳パックを削除 |
| `init` | tsconfig.json へのプラグイン登録 + 初回 extract |
| `extract` | 自分のコードの JSDoc を `.yakudoc/translations.json` に抽出 |
| `status` | 翻訳の進捗を表示(translations.json + 全パック) |
| `translate` | 翻訳エンジンを実行(`--engine local` / `--engine prep`) |
| `export <pkg>` | 翻訳パックを共有用に書き出す |
| `doctor` | 導入状態を診断する |

## 関連パッケージ

| パッケージ | 役割 |
| --- | --- |
| [yakudoc-ts-plugin](https://www.npmjs.com/package/yakudoc-ts-plugin) | 表示の差し替えを行う tsserver プラグイン(必須) |
| [yakudoc-mt](https://www.npmjs.com/package/yakudoc-mt) | オフラインの内蔵翻訳モデル(任意) |
| [yakudoc-ai-prep](https://www.npmjs.com/package/yakudoc-ai-prep) | 任意の AI に翻訳させる下準備(任意) |

翻訳パックの共有先: [yakudoc-packs](https://github.com/daiki-moritake/yakudoc-packs)

## ドキュメント

対応言語の一覧・差分翻訳・翻訳パックの共有方法など、詳細は [GitHub リポジトリの README](https://github.com/daiki-moritake/yakudoc#readme) を参照してください([English](https://github.com/daiki-moritake/yakudoc/blob/main/README.en.md))。

## ライセンス

[MIT](./LICENSE)
