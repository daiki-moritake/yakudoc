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

1. 公開する 4 パッケージの `version` を揃えて上げる

   ```bash
   npm version 0.2.0 -w yakudoc -w yakudoc-ts-plugin -w yakudoc-ai-prep -w yakudoc-mt --no-git-tag-version
   ```

2. パッケージ間の依存(`yakudoc: "^0.1.0"` など)が新しいバージョンと矛盾しないか確認する
3. リリースノート `release-notes/v0.2.0.md` を用意する([TEMPLATE.md](release-notes/TEMPLATE.md) をコピーして編集)
4. 変更(version と release-notes)をコミットして PR を作り、`main` にマージする
5. `main` を最新にして、リポジトリルートで **`npm run release`** を実行する

   ```bash
   git switch main && git pull
   npm run release
   ```

   このコマンド([scripts/release.mjs](scripts/release.mjs))が、version 整合・ブランチ/同期・タグ重複・リリースノートの存在を確認したうえで、タグ `v0.2.0` の作成と push(= Release ワークフローによる npm publish の起動)、GitHub Release の公開までをまとめて行います。リリースノートが無ければ、用意を促して中断します。

   タグ push と GitHub Release は取り消しの効きにくい公開操作のため、実行前に内容を表示して確認を求めます(`npm run release -- --yes` で省略できます)。

6. [Actions](https://github.com/daiki-moritake/yakudoc/actions/workflows/release.yml) で Release ワークフロー(npm publish)の成功を確認する

## ローカルから公開する(代替手段)

NPM_TOKEN を用意できない場合や、CI の publish が失敗して手元から公開したい場合は、リポジトリルートで **`npm run publish:local`** を使えます。

```bash
npm run publish:local -- --dry-run        # 公開せず、公開される内容だけ確認する
npm run publish:local                      # 実際に公開する(確認あり)
npm run publish:local -- --otp 123456      # 2FA 有効時: ワンタイムパスワードを渡す
```

> **2FA(二要素認証)を有効にしている場合**: publish に OTP が必要です。`--otp <code>` で渡すと、4 パッケージを 1 つのコードでまとめて公開できます(コードの有効期限内に完了します)。指定しない場合は npm が対話的に尋ねます。

このコマンド([scripts/publish-local.mjs](scripts/publish-local.mjs))は:

1. 公開 4 パッケージの version が揃っているか確認する
2. **リリースタグとの一致を検証する** — タグ `v<version>` が存在し、HEAD がそのコミットと一致し、作業ツリーがクリーンであること(= タグ付けした内容そのものを公開する保証)
3. npm にログイン済みか確認する(`npm whoami`)
4. ビルドとテストを通す
5. 依存順に publish する(公開済みの版はスキップ)

`main` が公開したいタグより先に進んでいる場合は、タグのコミットに移動してから実行します。

```bash
git checkout v0.2.0
npm run publish:local
```

> **provenance について**: `npm run publish:local` では provenance(公開物とソースの対応を示す署名)は付きません。provenance は GitHub Actions 上でしか機能しないためです。provenance が必要なら、NPM_TOKEN を設定して `npm run release`(タグ push)経由で公開してください。

## 失敗したとき

- ワークフローはビルドとテストを通してから publish します
- publish は公開済みバージョンを自動でスキップするため、途中のパッケージで失敗した場合は **同じタグのままワークフローを再実行**すれば続きから公開されます(バージョンを上げ直す必要はありません)
- タグが main に含まれないコミットに打たれている場合、ワークフローは publish 前に失敗します。main 上のコミットにタグを打ち直してください
