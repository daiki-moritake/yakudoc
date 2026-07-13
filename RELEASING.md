# リリース手順

npm への公開はタグ push をトリガーに GitHub Actions([release.yml](.github/workflows/release.yml))が行います。

公開対象は次の 4 パッケージです(`yakudoc-vscode` は npm ではなく VSCode Marketplace で配布するため対象外)。

- `yakudoc`
- `yakudoc-ts-plugin`
- `yakudoc-ai-prep`
- `yakudoc-mt`

## 事前準備(初回のみ)

1. npm でアクセストークンを発行する(Granular Access Token、対象パッケージへの Read and write 権限)
2. GitHub リポジトリの Settings → Secrets and variables → Actions に `NPM_TOKEN` として登録する

publish には `--provenance` を付けており、npm 上に「どのリポジトリのどのコミットからビルドされたか」の証明が表示されます。GitHub Actions 上でのみ機能するため、手元からの `npm publish` は使いません。

## リリースのたびにやること

1. `main` を最新にして、公開する 4 パッケージの `version` を揃えて上げる

   ```bash
   npm version 0.2.0 -w yakudoc -w yakudoc-ts-plugin -w yakudoc-ai-prep -w yakudoc-mt --no-git-tag-version
   ```

2. パッケージ間の依存(`yakudoc: "^0.1.0"` など)が新しいバージョンと矛盾しないか確認する
3. 変更をコミットして PR を作り、`main` にマージする
4. マージ後の `main` にタグを打って push する

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

5. [Actions](https://github.com/daiki-moritake/yakudoc/actions/workflows/release.yml) で Release ワークフローの成功を確認する
6. GitHub の Releases ページからタグに対してリリースノートを書く(Generate release notes で PR 一覧から自動生成できます)

## 失敗したとき

- ワークフローはビルドとテストを通してから publish します
- publish は公開済みバージョンを自動でスキップするため、途中のパッケージで失敗した場合は **同じタグのままワークフローを再実行**すれば続きから公開されます(バージョンを上げ直す必要はありません)
- タグが main に含まれないコミットに打たれている場合、ワークフローは publish 前に失敗します。main 上のコミットにタグを打ち直してください
