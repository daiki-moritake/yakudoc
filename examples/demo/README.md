# yakudoc demo

`yakudoc-ts-plugin` の動作確認用プロジェクトです。

## 確認手順

1. リポジトリルートで依存をインストールしてビルドする

   ```bash
   npm install
   npm run build
   ```

2. **このディレクトリ(`examples/demo`)を VSCode で開く**

   ```bash
   code examples/demo
   ```

3. 右下に「ワークスペースの TypeScript バージョンを使用しますか?」と表示されたら **許可** する
   (ローカルの `node_modules` にあるプラグインは、ワークスペース版 TypeScript でのみ読み込まれます)

4. [src/user.ts](src/user.ts) を開き、最終行の `fetchUser` にホバーする

   JSDoc が `.yakudoc/translations.json` の日本語訳で表示されれば成功です。
   補完候補の説明や、`fetchUser(` と入力した際の引数ヒントも同様に日本語化されます。

## うまく表示されないとき

- コマンドパレット → `TypeScript: Restart TS Server` を実行する
- コマンドパレット → `TypeScript: Open TS Server log` で `[yakudoc]` のログ行を確認する
  (`activated (project: ..., ... entries)` が出ていれば読み込みは成功しています)
