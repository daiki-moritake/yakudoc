# yakudoc

[![CI](https://github.com/daiki-moritake/yakudoc/actions/workflows/ci.yml/badge.svg)](https://github.com/daiki-moritake/yakudoc/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

日本語 | [English](./README.en.md)

**依存ライブラリの docs を、母語で読む。**

lodash・zod・`@types/node`——エディタのホバーに出てくる英語の JSDoc を、コードを 1 行も書き換えずに日本語(ほか 21 言語)で表示するツールセットです。

```bash
npx yakudoc add zod
```

これだけで、zod の API にホバーしたときの説明が日本語になります。公開済みのコミュニティ翻訳パックがあるライブラリなら、**訳文まで自動で入ります**(翻訳作業ゼロ)。無ければ内蔵の翻訳モデルか任意の AI で翻訳し、`yakudoc export` で次の誰かのために共有できます。

自分のプロジェクトの JSDoc も同じ仕組みで翻訳できます。

## モチベーション

毎日いちばん読んでいる英語ドキュメントは、README でも公式サイトでもなく、**エディタのホバーに出る依存ライブラリの JSDoc** です。正確ですが、読むたびに脳内変換のコストがかかります。かといってライブラリや共同開発のコードを書き換えるわけにはいきません。

yakudoc は表示だけに介入します。

- 原文はそのまま残る(node_modules も自分のコードも書き換えない。Git の diff を汚さない)
- 翻訳はエディタ表示だけに差し込まれる
- 同じライブラリの翻訳は全ユーザー共通 → **一度誰かが訳せば、みんなが `add` 一発で恩恵を受ける**

## 仕組み

VSCode の JS/TS 言語機能(ホバー表示・補完の説明・シグネチャヘルプ)は、すべて `tsserver` が生成しています。yakudoc はこの `tsserver` に対して **Language Service Plugin** として登録され、`getQuickInfoAtPosition` などが返す `documentation` / `tags` を翻訳済みテキストに差し替えます。

```text
[あなたのコード]  [node_modules/zod/**.d.ts]
      │                │
      ▼                ▼
 tsserver (TypeScript本体)
      │
      ▼
 yakudoc-ts-plugin  ← documentation を訳文に差し替え
      │                ↑ 原文ハッシュで照合
      │        .yakudoc/translations.json(自分のコード)
      │        .yakudoc/packs/*.json    (依存ライブラリの翻訳パック)
      ▼
 VSCode のホバー / 補完 / シグネチャヘルプに表示
```

照合は**原文テキストのハッシュ**で行うため、コメントがどのファイルにあるかは関係ありません。だから依存ライブラリの docs にもそのまま効き、ライブラリのバージョンが上がっても原文が変わっていないエントリの訳は生き続けます。

## パッケージ構成

モノレポ構成で、以下のパッケージに分かれています。

| パッケージ | 役割 |
| --- | --- |
| `yakudoc` | CLI 本体(`add` / `init` / `extract` / `status` / `translate` / `export` / `doctor`)。翻訳パックと翻訳ファイルの管理を行う |
| `yakudoc-ts-plugin` | `tsserver` に登録するプラグイン本体。表示の差し替えを行う |
| `yakudoc-vscode` | VSCode 拡張。`tsconfig.json` へのプラグイン自動登録、有効/無効の切り替え UI などを提供 |
| `yakudoc-mt`(オプション) | オープンウェイトの翻訳モデルを内蔵し、コマンド一つで翻訳を完結させる |
| `yakudoc-ai-prep`(オプション) | 任意の AI(Claude など)に翻訳させるための下準備ファイルを生成する |

`yakudoc-mt` と `yakudoc-ai-prep` はどちらか一方だけ導入すれば動作します(コミュニティ翻訳パックだけを使うなら、どちらも不要です)。

## セットアップ

### 1. インストールして init を実行

```bash
npm install --save-dev yakudoc yakudoc-ts-plugin
npx yakudoc init
```

`init` は、tsconfig.json への `yakudoc-ts-plugin` の登録(コメントを保持したまま追記)と、自分のコードの初回抽出(extract)をまとめて実行します。再実行しても安全です。

登録後、VSCode ではコマンドパレットから「TypeScript: Restart TS Server」を実行すると反映されます。

### 2. 依存ライブラリの翻訳を追加する

```bash
npx yakudoc add zod lodash
```

各パッケージについて次が実行されます。

1. `node_modules` 内の型定義(`.d.ts`)から JSDoc を抽出する
2. コミュニティ翻訳パックが公開されていれば、訳文を自動適用する
3. `.yakudoc/packs/<パッケージ名>.json` に書き出す

```text
zod@3.23.8: 型定義 12 ファイルから 431 件
  コミュニティ翻訳パック: 418 件の訳文を適用しました
  進捗: 418 / 431 件 翻訳済み (97%) / 翻訳待ち 13 件
  書き出し先: .yakudoc/packs/zod.json
```

`.yakudoc/` を Git にコミットすれば、チーム全員が同じ翻訳を共有できます。

### 3. VSCode 拡張の導入(任意・推奨)

Marketplace から「yakudoc」を検索してインストールすると、`tsconfig.json` への登録やステータスバーからの有効/無効切り替えが自動化されます。

コマンドパレット(`Cmd/Ctrl+Shift+P`)からは、ターミナルを開かずに次の操作を実行できます。

| コマンド | 動作 |
| --- | --- |
| `yakudoc: 導入を実行 (init)` | `npx yakudoc init` を統合ターミナルで実行する |
| `yakudoc: 翻訳対象を抽出 (extract)` | `npx yakudoc extract` を統合ターミナルで実行する |
| `yakudoc: 翻訳の進捗を表示 (status)` | `npx yakudoc status` を統合ターミナルで実行する |
| `yakudoc: 翻訳表示を切り替え(原文 / 翻訳)` | 原文表示と翻訳表示を切り替える |
| `yakudoc: tsconfig.json にプラグインを登録` | プラグインを未登録の `tsconfig.json` に追記する |

## 使い方

### 進捗の確認

```bash
npx yakudoc status
```

translations.json と全パックを横断して、翻訳済み・翻訳待ちの件数と内訳を表示します。

```text
進捗: 430 / 452 件 翻訳済み (95%) / 翻訳待ち 22 件

内訳:
  プロジェクト  12/20(.yakudoc/translations.json)
  lodash@4.17.21  0/1
  zod@3.23.8  418/431

翻訳待ち:
  src/api/user.ts#fetchUser  Fetches user data from the API.
  …
```

スクリプトや CI から使う場合は `--json` で機械可読な出力に、`--fail-on-pending` で翻訳待ちが残っているときに終了コード 1 を返せます。

### 翻訳の実行

コミュニティパックで埋まらなかった分・自分のコードの分は、翻訳エンジンで翻訳します。対象は translations.json と全パックの翻訳待ちエントリで、同じ原文は 1 回だけ翻訳されます。`--pkg <name>` で特定パックだけに絞れます。

エンジンは 2 種類あります。インストール済みのエンジンが 1 つだけなら `--engine` は省略できます。

#### オプション A:内蔵モデルで翻訳する

```bash
npm install --save-dev yakudoc-mt
npx yakudoc translate --engine local
```

オフライン・API キー不要。オープンウェイトの翻訳モデルを使うため、精度よりも手軽さを優先する場合に向いています。初回はモデルのダウンロードが走ります(進捗が 10% 刻みで表示されます)。

モデルは PC のリソースに合わせて切り替えられます。既定は `auto` で、搭載メモリからサイズを自動選択します。

```bash
npx yakudoc translate --engine local --model-size small   # NLLB-200 蒸留 600M(軽量・高速)
npx yakudoc translate --engine local --model-size large   # mBART-50(高品質・要メモリ)
npx yakudoc translate --engine local --model <HF のモデル id>  # 使用モデルを明示指定
```

| サイズ | モデル | 目安 |
| --- | --- | --- |
| `small` | NLLB-200 蒸留 600M | 軽量・高速。ダウンロード数百 MB |
| `large` | mBART-50 | 訳が自然になりやすい。ダウンロード 1GB 超・メモリと時間を要する |
| `auto`(既定) | 搭載メモリ 16GB 以上で `large`、未満で `small` | — |

環境変数 `YAKUDOC_MT_MODEL_SIZE`(`small`/`large`/`auto`)や `YAKUDOC_MT_MODEL`(モデル id 明示)でも指定できます。

#### オプション B:任意の AI に翻訳させる

まず下準備ファイルを生成します。

```bash
npm install --save-dev yakudoc-ai-prep
npx yakudoc translate --engine prep
```

`.yakudoc/ai/` 以下に次の3つが出力されます。

- `prompt.md` — 翻訳ルールと用語集、保護済みの原文をまとめた、そのまま LLM に貼れる依頼文
- `request.json` — 機械可読な原文一覧とプレースホルダー対応表
- `glossary.json`(`.yakudoc/` 直下)— 用語集。`{ "英語": "日本語" }` 形式で育てると `prompt.md` に反映されます

`prompt.md` を Claude などの LLM に渡し、返ってきた JSON を `.yakudoc/ai/response.json` に保存して、次のコマンドで書き戻します。

```bash
npx yakudoc translate --engine prep --apply .yakudoc/ai/response.json
```

保護トークン(`<ph0>` など)を復元して反映します。トークンが欠けた訳文は採用されず、翻訳待ちのまま残るため、原文中のコードやリンクが壊れることはありません。

### 反映

`translations.json` やパックを保存すると、`tsserver` プラグインがファイルの変更・パックの追加削除を自動検知して表示に反映します。エディタの再起動は不要です。

### 自分のコードの JSDoc を翻訳する

```bash
npx yakudoc extract
```

プロジェクト内の JSDoc コメントを走査し、`.yakudoc/translations.json` に翻訳待ちの原文を書き出します。あとの流れは依存ライブラリと同じです(translate で翻訳し、ホバーに反映されます)。

`@example` 内のコード例や `@see` などの参照タグは抽出そのものから除外されます。説明文に含まれる `` `コード` ``・`{@link ...}`・`{型}`・URL は、翻訳を壊さないよう `<ph0>` のようなトークンに退避して保護され、書き戻し時に元へ復元されます。

### うまく動かないとき

```bash
npx yakudoc doctor
```

プラグインの登録・プラグイン本体のインストール・翻訳ファイル・翻訳パック・翻訳先言語・翻訳エンジンを検査し、問題があれば対処コマンドを表示します。問題が残っている場合は終了コード 1 を返します。

すべて ✔ なのに表示が変わらないときは、コマンドパレットから「TypeScript: Restart TS Server」を実行してください。

## 翻訳パックを共有する

yakudoc のいちばん重要な性質はここです。**依存ライブラリの翻訳は、あなた専用ではなく全ユーザー共通の資産になります。**

訳し終えたパックは 1 コマンドで共有用ファイルになります。

```bash
npx yakudoc export zod
```

生成された `zod.json` を [yakudoc-packs](https://github.com/daiki-moritake/yakudoc-packs) リポジトリに `packs/ja/zod.json` としてプルリクエストすると、以後、世界中の `npx yakudoc add zod` に訳文が自動適用されます。

- エントリのキーは原文ハッシュなので、**ライブラリのバージョン差に強い**(原文が変わっていない API の訳はそのまま当たる)
- `add` はローカルにある訳を上書きしない(コミュニティ訳は翻訳待ちの穴埋めにだけ使われる)
- 機械翻訳ベースのパックを人が PR で磨いていく、Wikipedia 型の運用を想定しています

取得元は差し替えられます(社内レジストリの運用も可能です)。優先順位は `--registry` > 環境変数 `YAKUDOC_REGISTRY` > `.yakudoc/config.json` の `registry` > 既定。オフラインで使う場合は `add --no-fetch` を指定してください。

## 翻訳先言語を変える

既定の翻訳先は日本語ですが、ほかの言語も指定できます。

```bash
npx yakudoc init --lang ko                       # 翻訳先を韓国語にして導入
npx yakudoc translate --engine local --lang de   # この実行だけドイツ語に
```

`init` の `--lang` は `.yakudoc/config.json` に保存され、以後の `add` / `translate` はそれを使います。コミュニティ翻訳パックも言語ごとに分かれています(`packs/<言語コード>/`)。

対応言語: `ja` `ko` `zh` `de` `fr` `es` `pt` `it` `nl` `sv` `fi` `pl` `cs` `uk` `ru` `tr` `ar` `hi` `id` `vi` `th`(内蔵モデルの NLLB-200 / mBART-50 が両対応の言語)

翻訳先が日本語以外のとき、`--engine prep` が生成する依頼文(prompt.md)は英語になります。訳文には翻訳時の言語が記録されるため、翻訳先を後から切り替えると、以前の言語で付いた訳は自動的に「翻訳待ち」へ戻ります。

用語集は言語ごとに分かれます。日本語は `.yakudoc/glossary.json`、それ以外は `.yakudoc/glossary.<code>.json`(例: `glossary.de.json`)が使われます。

## 差分翻訳

翻訳のキーは原文コメントのハッシュ値です。

- **自分のコード**: JSDoc の原文を編集すると、そのエントリだけが「翻訳待ち」に戻ります。再抽出(`extract`)しても既存の訳文は保持されます
- **依存ライブラリ**: バージョンを上げたら `yakudoc add <パッケージ名>` を再実行してください。原文が変わった API のぶんだけが「翻訳待ち」になり、変わっていない訳はすべて引き継がれます

ソースから消えた原文のエントリは既定では残され、`--prune` を付けると削除されます。

## 対応範囲・制限事項

- 対応言語は現状 TypeScript / JavaScript のみです(`tsserver` のプラグイン機構に依存しているため)
- 依存ライブラリの翻訳対象は型定義(`.d.ts` / `.d.mts` / `.d.cts`)内の JSDoc です。型定義を持たないパッケージは対象外です(`@types/*` を指定してください)
- Python の docstring や、Pylance のようなクローズドソースの言語サーバーには対応していません
- 翻訳結果の品質は使用する翻訳エンジン(内蔵モデル or 外部 AI)とコミュニティ翻訳パックに依存します

## コントリビュート

バグ報告・機能提案・プルリクエストを歓迎します。開発環境のセットアップ手順やテストの実行方法は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。

翻訳パックの共有は [yakudoc-packs](https://github.com/daiki-moritake/yakudoc-packs) へどうぞ。

## ライセンス

[MIT](./LICENSE)
