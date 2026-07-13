# yakudoc

JSDoc のホバー・補完・シグネチャヘルプを **日本語訳(または任意の言語)で表示** する VSCode 拡張です。

(English: Shows JSDoc hover / completion / signature help translated into your language. The source code is never modified — only what the editor displays. See the [English README](https://github.com/daiki-moritake/yakudoc/blob/main/README.en.md).)

コードには一切手を加えません。原文の JSDoc はそのままに、`tsserver` の Language Service Plugin(`yakudoc-ts-plugin`)が **エディタ上の表示だけ** を翻訳に差し替えます。

## クイックスタート

1. プロジェクトに CLI とプラグインを導入する

   ```bash
   npm install --save-dev yakudoc yakudoc-ts-plugin
   npx yakudoc init
   ```

2. 翻訳を実行する(どちらか一方でよい)

   ```bash
   npx yakudoc translate --engine local   # 内蔵モデルでオフライン翻訳(要 yakudoc-mt)
   npx yakudoc translate --engine prep    # Claude などの AI に依頼(要 yakudoc-ai-prep)
   ```

3. コマンドパレットから「TypeScript: Restart TS Server」を実行する

以降は `.yakudoc/translations.json` の変更が自動で表示に反映されます。詳しくは [リポジトリの README](https://github.com/daiki-moritake/yakudoc#readme) を参照してください。

## この拡張がやること

- ワークスペースの `tsconfig.json` に `yakudoc-ts-plugin` が未登録なら、起動時に登録を提案します(コメントや書式は保持したまま追記)
- ステータスバーのボタンで、翻訳表示と原文表示をワンクリックで切り替えられます(TS Server の再起動は不要)
- コマンドパレットから yakudoc CLI(init / extract / status)を統合ターミナルで実行できます

## コマンド

| コマンド | 動作 |
| --- | --- |
| `yakudoc: 導入を実行 (init)` | `npx yakudoc init` を統合ターミナルで実行する |
| `yakudoc: 翻訳対象を抽出 (extract)` | `npx yakudoc extract` を統合ターミナルで実行する |
| `yakudoc: 翻訳の進捗を表示 (status)` | `npx yakudoc status` を統合ターミナルで実行する |
| `yakudoc: 翻訳表示を切り替え(原文 / 翻訳)` | 表示を切り替える(ステータスバーからも可) |
| `yakudoc: tsconfig.json にプラグインを登録` | 未登録の `tsconfig.json` に追記する |

## 設定

| 設定 | 既定値 | 説明 |
| --- | --- | --- |
| `yakudoc.enabled` | `true` | JSDoc の表示を翻訳に差し替える |

## トラブルシューティング

表示が変わらないときは、ターミナルで導入状態を診断できます:

```bash
npx yakudoc doctor
```

## ライセンス

[MIT](https://github.com/daiki-moritake/yakudoc/blob/main/LICENSE)
