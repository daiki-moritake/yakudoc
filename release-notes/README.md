# リリースノート

このディレクトリは、GitHub Release として公開するリリースノートの置き場です。

- ファイル名は `v<version>.md`(例: `v0.1.0.md`)。`version` は公開 4 パッケージ共通のバージョンです
- ファイルの中身がそのまま GitHub Release の本文になります
- 新しい版を出すときは [TEMPLATE.md](./TEMPLATE.md) をコピーして書きます

## リリース手順

バージョンを上げてノートを用意したら、リポジトリルートで次を実行します。

```bash
npm run release
```

このコマンドは([scripts/release.mjs](../scripts/release.mjs)):

1. 公開 4 パッケージの version が揃っているか確認する
2. main ブランチ・作業ツリーがクリーンか、origin と同期しているか確認する
3. `release-notes/v<version>.md` の存在を確認する(無ければ用意を促して中断)
4. タグ `v<version>` を作成して push する(これで [Release ワークフロー](../.github/workflows/release.yml) が npm publish を実行)
5. リリースノートを GitHub Release として公開する

タグ push と GitHub Release は取り消しの効きにくい公開操作のため、実行前に内容を表示して確認を求めます(`npm run release -- --yes` で省略できます)。

バージョンの上げ方や NPM_TOKEN の設定など、リリース全体の流れは [../RELEASING.md](../RELEASING.md) を参照してください。
