# yakudoc

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

### 2. tsconfig.json にプラグインを登録

```jsonc
{
  "compilerOptions": {
    "plugins": [{ "name": "yakudoc-ts-plugin" }]
  }
}
```

### 3. VSCode 拡張の導入（任意・推奨）

Marketplace から「yakudoc」を検索してインストールすると、`tsconfig.json` への登録やステータスバーからの有効/無効切り替えが自動化されます。

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

`{型}` やコード例（`@example` 内）、URL などは翻訳対象から自動的に除外され、プレースホルダーとして保護されます。

### 翻訳の実行

**オプション A：内蔵モデルで翻訳する**

```bash
npm install --save-dev yakudoc-mt
npx yakudoc translate --engine local
```

オフライン・API キー不要で完結します。精度よりも手軽さを優先する場合に向いています。

**オプション B：任意の AI に翻訳させる**

```bash
npm install --save-dev yakudoc-ai-prep
npx yakudoc translate --engine prep
```

プレースホルダー保護済みの原文一覧と用語集（`glossary.json`）がまとめて出力されます。これを Claude などの LLM に渡し、返ってきた結果を同じキー構造で `translations.json` に書き戻すだけで完了します。

### 反映

`translations.json` を保存すると、`tsserver` プラグインがファイルの変更を自動検知して表示に反映します。エディタの再起動は不要です。

## 差分翻訳

翻訳のキーは原文コメントのハッシュ値です。コードを編集して JSDoc の原文が変わった場合、そのエントリだけが自動的に「翻訳待ち」に戻ります。無関係な変更で翻訳全体が失効することはありません。

## 対応範囲・制限事項

- 対応言語は現状 TypeScript / JavaScript のみです（`tsserver` のプラグイン機構に依存しているため）
- Python の docstring や、Pylance のようなクローズドソースの言語サーバーには対応していません
- 翻訳結果の品質は使用する翻訳エンジン（内蔵モデル or 外部 AI）に依存します

## ライセンス

MIT

