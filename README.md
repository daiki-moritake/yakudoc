# yakudoc

[![CI](https://github.com/daiki-moritake/yakudoc/actions/workflows/ci.yml/badge.svg)](https://github.com/daiki-moritake/yakudoc/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

日本語 | [English](./README.en.md)

JSDoc コメントを日本語化し、VSCode の言語機能（ホバー・補完・シグネチャヘルプ）にその翻訳を割り込ませるためのツールセットです。

コード自体は書き換えません。原文の JSDoc はそのままに、`tsserver` プラグインを通じて **エディタ上の表示だけ** を日本語訳に差し替えます。

## モチベーション

英語の JSDoc は正確ですが、読むたびに脳内変換のコストがかかります。かといって、コード中のコメントを直接日本語に書き換えるのはライブラリのコードや共同開発の都合上避けたい——という場面のために作られています。

- 原文はそのまま残る（Git 上の diff を汚さない）
- 翻訳はエディタ表示だけに介入する
- 翻訳エンジンは差し替え可能（内蔵の軽量モデル / 任意の AI に投げる下準備のみ、の2択）

## 仕組み

VSCode の JS/TS 言語機能（ホバー表示・補完の説明・シグネチャヘルプ）は、すべて `tsserver` が生成しています。yakudoc はこの `tsserver` に対して **Language Service Plugin** として登録され、`getQuickInfoAtPosition` や `getCompletionEntryDetails` などが返す `documentation` / `tags` を、日本語訳済みのテキストに差し替えて返します。

```
[あなたのコード]
      │
      ▼
 tsserver (TypeScript本体)
      │
      ▼
 yakudoc-ts-plugin  ← ここで documentation を日本語訳に差し替え
      │
      ▼
 VSCode のホバー / 補完 / シグネチャヘルプに表示
```

拡張機能を別に追加するのではなく、TypeScript 本体の出力そのものを書き換えるため、既存のホバー表示と二重に表示されることはありません。

## パッケージ構成

モノレポ構成で、以下のパッケージに分かれています。

| パッケージ | 役割 |
|---|---|
| `yakudoc-core` | AST から JSDoc を抽出し、翻訳ファイルを生成・管理する |
| `yakudoc-ts-plugin` | `tsserver` に登録するプラグイン本体。表示の差し替えを行う |
| `yakudoc-vscode` | VSCode 拡張。`tsconfig.json` へのプラグイン自動登録、有効/無効の切り替え UI などを提供 |
| `yakudoc-mt`（オプション） | オープンウェイトの翻訳モデルを内蔵し、コマンド一つで翻訳を完結させる |
| `yakudoc-ai-prep`（オプション） | 任意の AI（Claude など）に翻訳させるための下準備ファイルを生成する |

`yakudoc-mt` と `yakudoc-ai-prep` はどちらか一方だけ導入すれば動作します。両方インストールする必要はありません。

## セットアップ

### 1. インストール

```bash
npm install --save-dev yakudoc-core yakudoc-ts-plugin
```

### 2. init を実行

```bash
npx yakudoc init
```

tsconfig.json への `yakudoc-ts-plugin` の登録（コメントを保持したまま追記）と、初回の抽出（extract）をまとめて実行します。再実行しても安全です（登録済みならスキップし、既存の訳文は保持されます）。

手動で設定したい場合は、tsconfig.json に次を追記してください。

```jsonc
{
  "compilerOptions": {
    "plugins": [{ "name": "yakudoc-ts-plugin" }]
  }
}
```

登録後、VSCode ではコマンドパレットから「TypeScript: Restart TS Server」を実行すると反映されます。

### 3. VSCode 拡張の導入（任意・推奨）

Marketplace から「yakudoc」を検索してインストールすると、`tsconfig.json` への登録やステータスバーからの有効/無効切り替えが自動化されます。

コマンドパレット（`Cmd/Ctrl+Shift+P`）からは、ターミナルを開かずに次の操作を実行できます。

| コマンド | 動作 |
|---|---|
| `yakudoc: 翻訳対象を抽出 (extract)` | `npx yakudoc extract` を統合ターミナルで実行する |
| `yakudoc: 翻訳の進捗を表示 (status)` | `npx yakudoc status` を統合ターミナルで実行する |
| `yakudoc: 翻訳表示を切り替え (JP/EN)` | 原文表示と日本語訳表示を切り替える |
| `yakudoc: tsconfig.json にプラグインを登録` | プラグインを未登録の `tsconfig.json` に追記する |

## 使い方

### 翻訳対象の抽出

```bash
npx yakudoc extract
```

プロジェクト内の JSDoc コメントを走査し、`.yakudoc/translations.json` に翻訳待ちの原文を書き出します。

```json
{
  "a1b2c3d4": {
    "original": "Fetches user data from the API.",
    "translated": "",
    "symbol": "src/api/user.ts#fetchUser"
  }
}
```

`@example` 内のコード例や `@see` などの参照タグは抽出そのものから除外されます。説明文に含まれる `` `コード` ``・`{@link ...}`・`{型}`・URL は、翻訳を壊さないよう `<ph0>` のようなトークンに退避して保護され、書き戻し時に元へ復元されます。

### 進捗の確認

```bash
npx yakudoc status
```

`translations.json` を書き換えずに、翻訳済み・翻訳待ちの件数と割合を表示します。翻訳待ちのエントリは対象シンボルと原文つきで一覧されるため、次にどこを訳せばよいかがすぐ分かります。

```text
翻訳ファイル: /path/to/project/.yakudoc/translations.json
進捗: 12 / 20 件 翻訳済み (60%) / 翻訳待ち 8 件

翻訳待ち:
  src/api/user.ts#fetchUser  Fetches user data from the API.
  …
```

スクリプトや CI から使う場合は `--json` で機械可読な出力に、`--fail-on-pending` で翻訳待ちが残っているときに終了コード 1 を返せます。

```bash
npx yakudoc status --json                 # { total, translated, untranslated, pending } を出力
npx yakudoc status --fail-on-pending       # 未翻訳が残っていれば exit 1(翻訳漏れの検知に)
```

### 翻訳の実行

**オプション A：内蔵モデルで翻訳する**

```bash
npm install --save-dev yakudoc-mt
npx yakudoc translate --engine local
```

オフライン・API キー不要で `translations.json` に直接書き込まれます。オープンウェイトの翻訳モデルを使うため、精度よりも手軽さを優先する場合に向いています。初回はモデルのダウンロードが走ります。

モデルは PC のリソースに合わせて切り替えられます。既定は `auto` で、搭載メモリからサイズを自動選択します。

```bash
npx yakudoc translate --engine local --model-size small   # NLLB-200 蒸留 600M（軽量・高速）
npx yakudoc translate --engine local --model-size large   # mBART-50（高品質・要メモリ）
npx yakudoc translate --engine local --model <HF のモデル id>  # 使用モデルを明示指定
```

| サイズ | モデル | 目安 |
|---|---|---|
| `small` | NLLB-200 蒸留 600M | 軽量・高速。ダウンロード数百 MB |
| `large` | mBART-50 | 訳が自然になりやすい。ダウンロード 1GB 超・メモリと時間を要する |
| `auto`（既定） | 搭載メモリ 16GB 以上で `large`、未満で `small` | — |

環境変数 `YAKUDOC_MT_MODEL_SIZE`（`small`/`large`/`auto`）や `YAKUDOC_MT_MODEL`（モデル id 明示）でも指定できます。

**オプション B：任意の AI に翻訳させる**

まず下準備ファイルを生成します。

```bash
npm install --save-dev yakudoc-ai-prep
npx yakudoc translate --engine prep
```

`.yakudoc/ai/` 以下に次の3つが出力されます。

- `prompt.md` — 翻訳ルールと用語集、保護済みの原文をまとめた、そのまま LLM に貼れる依頼文
- `request.json` — 機械可読な原文一覧とプレースホルダー対応表
- `glossary.json`（`.yakudoc/` 直下）— 用語集。`{ "英語": "日本語" }` 形式で育てると `prompt.md` に反映されます

`prompt.md` を Claude などの LLM に渡し、返ってきた JSON を `.yakudoc/ai/response.json` に保存して、次のコマンドで書き戻します。

```bash
npx yakudoc translate --engine prep --apply .yakudoc/ai/response.json
```

保護トークン（`<ph0>` など）を復元して反映します。トークンが欠けた訳文は採用されず、翻訳待ちのまま残るため、原文中のコードやリンクが壊れることはありません。

### 反映

`translations.json` を保存すると、`tsserver` プラグインがファイルの変更を自動検知して表示に反映します。エディタの再起動は不要です。

## 差分翻訳

翻訳のキーは原文コメントのハッシュ値です。コードを編集して JSDoc の原文が変わった場合、そのエントリだけが自動的に「翻訳待ち」に戻ります。無関係な変更で翻訳全体が失効することはありません。

再抽出（`npx yakudoc extract`）しても既存の訳文は保持されます。ソースから消えた原文のエントリは既定では残され（抽出漏れで訳を失わないため）、`--prune` を付けると削除されます。

## 対応範囲・制限事項

- 対応言語は現状 TypeScript / JavaScript のみです（`tsserver` のプラグイン機構に依存しているため）
- Python の docstring や、Pylance のようなクローズドソースの言語サーバーには対応していません
- 翻訳結果の品質は使用する翻訳エンジン（内蔵モデル or 外部 AI）に依存します

## コントリビュート

バグ報告・機能提案・プルリクエストを歓迎します。開発環境のセットアップ手順やテストの実行方法は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。

## ライセンス

[MIT](./LICENSE)

