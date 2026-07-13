# yakudoc-mt

[![npm](https://img.shields.io/npm/v/yakudoc-mt.svg)](https://www.npmjs.com/package/yakudoc-mt)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[yakudoc](https://www.npmjs.com/package/yakudoc) の翻訳エンジン(オフライン・内蔵モデル)です。オープンウェイトの機械翻訳モデル([transformers.js](https://github.com/huggingface/transformers.js) 経由の NLLB-200 / mBART-50)で、翻訳待ちのエントリをローカルで翻訳します。API キー不要・オフラインで動きます。

`yakudoc-ai-prep`(任意の AI に依頼するエンジン)とは択一で、どちらか一方を入れれば動きます。

## 使い方

```bash
npm install --save-dev yakudoc-mt
npx yakudoc translate --engine local
```

モデルは搭載メモリから自動選択されます(既定 `auto`)。明示的に切り替えることもできます。

```bash
npx yakudoc translate --engine local --model-size small   # NLLB-200 蒸留 600M(軽量・高速)
npx yakudoc translate --engine local --model-size large   # mBART-50(高品質・要メモリ)
```

初回はモデルのダウンロードが走ります(進捗が 10% 刻みで表示されます)。精度よりも手軽さを優先する用途向けです。より自然な訳が必要な場合は [yakudoc-ai-prep](https://www.npmjs.com/package/yakudoc-ai-prep) で任意の AI に翻訳させる方法もあります。

詳しい導入・翻訳の手順は [yakudoc の README](https://github.com/daiki-moritake/yakudoc#readme) を参照してください。

## ライセンス

[MIT](./LICENSE)
