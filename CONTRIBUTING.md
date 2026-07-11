# コントリビュートガイド

yakudoc への貢献に興味を持っていただきありがとうございます。バグ報告・機能提案・ドキュメント修正・プルリクエスト、いずれも歓迎します。

(English: Issues and pull requests in English are welcome, too. Feel free to write in whichever language you prefer.)

## 開発環境

- Node.js 22.3 以上(`yakudoc-vscode` のテストが `node:test` の module mocks に依存するため。CI は 22.x / 24.x で実行しています)
- npm(このリポジトリは npm workspaces のモノレポです)

## セットアップ

```bash
git clone https://github.com/daiki-moritake/yakudoc.git
cd yakudoc
npm ci
npm run build   # 依存順に全パッケージをビルド(テストは dist を参照するため必須)
npm test        # 全ワークスペースのテストを実行
```

特定のパッケージだけテストする場合:

```bash
npm test -w yakudoc-core
```

## リポジトリ構成

| ディレクトリ | 内容 |
|---|---|
| `packages/yakudoc-core` | JSDoc 抽出・翻訳ファイル管理・CLI(`init` / `extract` / `status` / `translate`) |
| `packages/yakudoc-ts-plugin` | tsserver プラグイン本体(表示の差し替え) |
| `packages/yakudoc-vscode` | VSCode 拡張 |
| `packages/yakudoc-mt` | 内蔵モデルによるオフライン翻訳エンジン |
| `packages/yakudoc-ai-prep` | 任意の AI に翻訳させるための下準備と書き戻し |
| `examples/demo` | 動作確認用のサンプルプロジェクト |

## プルリクエスト

1. `main` からフィーチャーブランチを作成する(例: `feat/xxx`, `fix/xxx`, `docs/xxx`)
2. 変更にはできる限りテストを添える(各パッケージの `tests/` 以下、`node:test` を使用)
3. `npm run build && npm test` が通ることを確認する
4. コミットメッセージは既存の履歴に合わせる(例: `feat(core): ○○を追加`。日本語・英語どちらでも構いません)

小さな修正はそのまま PR を送ってください。大きな変更や設計に関わる変更は、先に Issue で相談してもらえるとスムーズです。

## バグ報告・機能提案

[Issue](https://github.com/daiki-moritake/yakudoc/issues) からお願いします。バグ報告には再現手順と環境(OS / Node.js / VSCode / TypeScript のバージョン)を添えてください。

## 行動規範

すべての参加者が敬意を持って接することを期待します。ハラスメントや排他的な言動は許容されません。
