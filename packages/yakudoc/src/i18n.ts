/**
 * CLI メッセージの国際化(i18n)。
 *
 * yakudoc の既定の表示言語は日本語。ただし翻訳先(targetLang)が ja 以外の
 * ユーザーは日本語話者とは限らないため、その場合は CLI の表示を英語に切り替える。
 * 表示言語は起動時に一度だけ {@link setUiLocale} で確定し、以降は各モジュールが
 * {@link m} 経由でメッセージを引く(引数でロケールを引き回さない)。
 *
 * 既定は "ja" に固定してある。既存の日本語ユーザーとテストの挙動を変えないため。
 */
export type UiLocale = "ja" | "en";

/** 起動時に確定する表示ロケール。既定は日本語 */
let activeLocale: UiLocale = "ja";

/** 表示ロケールを設定する(CLI 起動時に一度だけ呼ぶ) */
export function setUiLocale(locale: UiLocale): void {
  activeLocale = locale;
}

/** 現在の表示ロケール */
export function getUiLocale(): UiLocale {
  return activeLocale;
}

/**
 * 翻訳先の言語コードから CLI の表示ロケールを決める。
 * ja(既定)は日本語、それ以外は英語。日本語訳を使う人は日本語 UI、
 * 他言語へ訳す人は英語 UI、という単純な規則。
 */
export function uiLocaleForTargetLang(targetLang: string): UiLocale {
  return targetLang.trim().toLowerCase() === "ja" ? "ja" : "en";
}

/**
 * メッセージカタログの型。ja と en の双方が全キーを実装しないと
 * 型エラーになるため、片方だけ翻訳し忘れることを防げる。
 * すべて関数にして埋め込み値(件数・パス等)を受け取れるようにしている。
 */
export interface Messages {
  usage(): string;

  /** 例示コマンド中のパッケージ名プレースホルダ(例: `<パッケージ名>`) */
  packagePlaceholder(): string;
  /** 言語コードのプレースホルダ(例: `<言語コード>`) */
  langPlaceholder(): string;

  // --- 汎用 ---
  /** 例外を stderr に出すときの接頭辞行(末尾に改行を付ける前) */
  errorPrefix(message: string): string;
  unknownCommand(command: string): string;

  // --- extract / init 共通 ---
  extractOutDest(outPath: string): string;
  extractCounts(
    fileCount: number,
    extracted: number,
    translated: number,
    untranslated: number
  ): string;
  stalePruned(stale: number): string;
  staleKept(stale: number): string;

  // --- init ---
  pluginRegistered(tsconfigLabel: string): string;
  pluginAlreadyRegistered(tsconfigLabel: string): string;
  langSaved(targetLang: string, configLabel: string): string;
  pluginNotInstalledWarning(pluginName: string): string;
  initNextSteps(addExample: string): string;

  // --- add ---
  addExtracted(
    name: string,
    version: string,
    fileCount: number,
    total: number
  ): string;
  communityApplied(count: number): string;
  communityNotFound(): string;
  communityFetchError(message: string): string;
  progressLine(
    translated: number,
    total: number,
    percent: number,
    untranslated: number
  ): string;
  addOutDest(relPath: string): string;
  addNeedPackage(): string;
  projectDependenciesList(deps: string): string;
  addPendingRemains(): string;

  // --- remove ---
  removeNeedPackage(): string;
  packRemoved(name: string, relPath: string): string;
  packRemoveNotFound(name: string, relPath: string): string;

  // --- export ---
  exportNeedPackage(): string;
  packNotFound(name: string, packPath: string): string;
  exportWritten(targetPath: string, translated: number, total: number): string;
  exportShareGuide(
    repoUrl: string,
    lang: string,
    fileName: string,
    name: string
  ): string;

  // --- status ---
  noTranslationFile(): string;
  noTranslateTargets(): string;
  statusFileLabel(outPath: string): string;
  statusTargetLang(targetLang: string): string;
  statusNoTargets(): string;
  statusBreakdownHeader(): string;
  statusBreakdownProject(
    translated: number,
    total: number,
    label: string
  ): string;
  statusBreakdownPack(
    name: string,
    version: string,
    translated: number,
    total: number
  ): string;
  statusPendingHeader(): string;
  symbolUnknown(): string;
  pendingMore(rest: number): string;

  // --- translate ---
  engineNotInstalled(packageName: string): string;
  engineApplyNote(): string;
  engineAutoNote(engine: string, packageName: string): string;
  engineUnknown(name: string): string;
  engineNoneInstalled(): string;
  engineBothInstalled(): string;

  // --- config ---
  configReadFailed(configPath: string, detail: string): string;
  configNotJson(configPath: string): string;
  configNotObject(configPath: string): string;

  // --- languages ---
  unsupportedLang(code: string, supported: string): string;

  // --- init / extract (tsconfig) ---
  tsconfigNotFoundInit(): string;
  tsconfigNotFoundExtract(): string;
  pluginsNotArray(): string;

  // --- depExtract ---
  packageNotInstalled(packageName: string): string;
  noTypeDefinitions(packageName: string, typesHint: string): string;

  // --- registry ---
  registryHttpError(status: number): string;
  registryNotJson(): string;
  registryNotPackFormat(): string;
  registryTimeout(): string;

  // --- doctor ---
  doctorLabelPluginRegistration(): string;
  doctorLabelPluginBinary(): string;
  doctorLabelTranslations(): string;
  doctorLabelPacks(): string;
  doctorLabelTargetLang(): string;
  doctorLabelEngine(): string;
  doctorTsconfigNotFound(): string;
  doctorTsconfigNotFoundHint(): string;
  doctorPluginRegisteredDetail(tsconfigLabel: string, pluginName: string): string;
  doctorPluginNotRegisteredDetail(
    tsconfigLabel: string,
    pluginName: string
  ): string;
  doctorPluginNotRegisteredHint(): string;
  doctorPluginBinaryMissingDetail(pluginName: string): string;
  doctorPluginBinaryMissingHint(pluginName: string): string;
  doctorTargetLangFromConfig(targetLang: string): string;
  doctorTargetLangDefault(targetLang: string): string;
  doctorTargetLangErrorHint(defaultLang: string): string;
  doctorTranslationsNoneWithPacks(outLabel: string): string;
  doctorTranslationsMissingDetail(outLabel: string): string;
  doctorTranslationsMissingHint(): string;
  doctorTranslationsDetail(
    outLabel: string,
    total: number,
    translated: number,
    untranslated: number
  ): string;
  doctorPacksDetail(count: number, parts: string): string;
  doctorPacksNoneDetail(): string;
  doctorEngineNoneDetail(): string;
  doctorEngineNoneHint(): string;
  doctorSummaryErrors(errors: number): string;
  doctorSummaryWarns(warns: number): string;
  doctorSummaryOk(): string;
}

const USAGE_JA = `使い方: yakudoc <command> [options]

コマンド:
  add <pkg...>     依存ライブラリの翻訳パックを作成・更新する。
                   node_modules の型定義から JSDoc を抽出し、公開済みの
                   コミュニティ翻訳パックがあれば訳文を自動適用する
  remove <pkg...>  依存ライブラリの翻訳パックを削除する
  init             導入を一括で行う(tsconfig.json へのプラグイン登録 + 初回 extract)
  extract          自分のコードの JSDoc を .yakudoc/translations.json に書き出す
                   (既存の訳文は保持される)
  status           翻訳の進捗を表示する(translations.json + 全パック)
  translate        翻訳エンジンを実行する(translations.json + 全パック)
  export <pkg>     翻訳パックを共有用にカレントディレクトリへ書き出す
  doctor           導入状態を診断する(プラグイン登録・インストール・翻訳ファイル)

オプション:
  -p, --project <path>   tsconfig.json のパス(既定: カレントから探索)
      --out <path>       translations.json のパス(既定: .yakudoc/translations.json)
      --prune            [extract/add] ソースから消えた原文のエントリを削除する
      --json             [status] 進捗を機械可読な JSON で出力する
      --fail-on-pending  [status] 翻訳待ちが残っていれば終了コード 1(CI 用)
      --lang <code>      [init/add/translate] 翻訳先の言語コード(既定: ja)。
                         init で指定すると .yakudoc/config.json に保存され、
                         以後の add / translate はそれを使う
      --engine <name>    [translate] prep(AI 用下準備)/ local(内蔵モデル)。
                         省略時はインストール済みのエンジンを自動選択する
                         (1 つだけの場合)
      --apply <path>     [translate] 翻訳結果 JSON を書き戻す
      --pkg <name>       [translate] 対象を指定パッケージのパックだけに絞る
                         (複数指定可)
      --no-fetch         [add] コミュニティ翻訳パックを取得しない(オフライン)
      --registry <url>   [add] コミュニティ翻訳パックの取得元 URL を上書きする
      --to <path>        [export] 書き出し先(既定: ./<パッケージ名>.json)
      --model-size <s>   [translate --engine local] small | large | auto
                         (既定: auto。搭載メモリからモデルを自動選択)
      --model <hf-id>    [translate --engine local] 使用モデルを明示指定
  -v, --version          バージョンを表示する
  -h, --help             このヘルプを表示する
`;

const USAGE_EN = `Usage: yakudoc <command> [options]

Commands:
  add <pkg...>     Create or update a translation pack for a dependency.
                   Extracts JSDoc from the package's type definitions in
                   node_modules and, if a published community pack exists,
                   applies its translations automatically.
  remove <pkg...>  Remove a dependency's translation pack.
  init             Set up everything at once (register the plugin in
                   tsconfig.json + run the first extract).
  extract          Extract your own code's JSDoc to
                   .yakudoc/translations.json (existing translations are kept).
  status           Show translation progress (translations.json + all packs).
  translate        Run a translation engine (translations.json + all packs).
  export <pkg>     Write a translation pack to the current directory for sharing.
  doctor           Diagnose the setup (plugin registration, install,
                   translation files).

Options:
  -p, --project <path>   Path to tsconfig.json (default: search from cwd).
      --out <path>       Path to translations.json
                         (default: .yakudoc/translations.json).
      --prune            [extract/add] Remove entries whose source text is gone.
      --json             [status] Print progress as machine-readable JSON.
      --fail-on-pending  [status] Exit code 1 if anything is untranslated (CI).
      --lang <code>      [init/add/translate] Target language code (default: ja).
                         When passed to init it is saved to
                         .yakudoc/config.json and reused by later add/translate.
      --engine <name>    [translate] prep (prepare for an AI) / local (built-in
                         model). If omitted, the installed engine is chosen
                         automatically (when exactly one is installed).
      --apply <path>     [translate] Write a translation-result JSON back in.
      --pkg <name>       [translate] Limit to the given package's pack only
                         (repeatable).
      --no-fetch         [add] Do not fetch community packs (offline).
      --registry <url>   [add] Override the base URL community packs are fetched from.
      --to <path>        [export] Output path (default: ./<package>.json).
      --model-size <s>   [translate --engine local] small | large | auto
                         (default: auto; picks a model from available memory).
      --model <hf-id>    [translate --engine local] Use the given model explicitly.
  -v, --version          Print the version.
  -h, --help             Show this help.
`;

const ja: Messages = {
  usage: () => USAGE_JA,
  packagePlaceholder: () => "<パッケージ名>",
  langPlaceholder: () => "<言語コード>",

  errorPrefix: (message) => `yakudoc: ${message}`,
  unknownCommand: (command) => `不明なコマンドです: ${command}`,

  extractOutDest: (outPath) => `書き出し先: ${outPath}`,
  extractCounts: (fileCount, extracted, translated, untranslated) =>
    `${fileCount} ファイルから ${extracted} 件の原文を抽出しました` +
    `(翻訳済み ${translated} / 翻訳待ち ${untranslated})`,
  stalePruned: (stale) => `ソースに存在しない ${stale} 件のエントリを削除しました`,
  staleKept: (stale) =>
    `ソースに存在しない ${stale} 件のエントリを残しています(--prune で削除できます)`,

  pluginRegistered: (tsconfigLabel) =>
    `${tsconfigLabel} に yakudoc-ts-plugin を登録しました`,
  pluginAlreadyRegistered: (tsconfigLabel) =>
    `${tsconfigLabel} には yakudoc-ts-plugin が登録済みです`,
  langSaved: (targetLang, configLabel) =>
    `翻訳先言語: ${targetLang}(${configLabel} に保存しました)`,
  pluginNotInstalledWarning: (pluginName) => `
警告: ${pluginName} が node_modules に見つかりません。
  tsconfig.json への登録は完了しましたが、インストールされるまで表示は変わりません:
    npm install --save-dev ${pluginName}`,
  initNextSteps: (addExample) => `
次にやること:
  1. 依存ライブラリの翻訳パックを追加する(ホバーに出る docs の大半はここ)
       ${addExample}
     公開済みのコミュニティ翻訳パックがあれば、訳文まで自動で入ります
  2. 残りを翻訳する
       npx yakudoc translate --engine local   (内蔵モデル。要 yakudoc-mt)
       npx yakudoc translate --engine prep    (任意の AI に依頼。要 yakudoc-ai-prep)
     または translations.json / packs 内の "translated" を直接編集する
  3. VSCode でコマンドパレットから「TypeScript: Restart TS Server」を実行する
     (プラグイン登録を反映するため。以降の翻訳更新は自動で反映されます)`,

  addExtracted: (name, version, fileCount, total) =>
    `${name}${version}: 型定義 ${fileCount} ファイルから ${total} 件`,
  communityApplied: (count) =>
    `  コミュニティ翻訳パック: ${count} 件の訳文を適用しました`,
  communityNotFound: () =>
    "  コミュニティ翻訳パック: 未公開でした(翻訳できたら `yakudoc export` で共有できます)",
  communityFetchError: (message) =>
    `  コミュニティ翻訳パック: 取得できませんでした(${message})`,
  progressLine: (translated, total, percent, untranslated) =>
    `進捗: ${translated} / ${total} 件 翻訳済み (${percent}%) / 翻訳待ち ${untranslated} 件`,
  addOutDest: (relPath) => `  書き出し先: ${relPath}`,
  addNeedPackage: () =>
    "追加するパッケージ名を指定してください。例: npx yakudoc add zod",
  projectDependenciesList: (deps) =>
    `\n\nこのプロジェクトの依存パッケージ:\n  ${deps}`,
  addPendingRemains: () =>
    "\n翻訳待ちが残っています。`npx yakudoc translate` で翻訳できます。",

  removeNeedPackage: () =>
    "削除するパッケージ名を指定してください。例: npx yakudoc remove zod",
  packRemoved: (name, relPath) =>
    `${name} の翻訳パックを削除しました(${relPath})`,
  packRemoveNotFound: (name, relPath) =>
    `${name} の翻訳パックはありません(${relPath})`,

  exportNeedPackage: () =>
    "書き出すパッケージ名を 1 つ指定してください。例: npx yakudoc export zod",
  packNotFound: (name, packPath) =>
    `${name} の翻訳パックが見つかりません(${packPath})。` +
    `\n  先に \`yakudoc add ${name}\` を実行してください。`,
  exportWritten: (targetPath, translated, total) =>
    `${targetPath} に書き出しました(翻訳済み ${translated} / ${total} 件)`,
  exportShareGuide: (repoUrl, lang, fileName, name) => `
このパックをコミュニティに共有するには:
  1. ${repoUrl} をフォークする
  2. packs/${lang}/${fileName} として追加する
  3. プルリクエストを送る
共有されたパックは、全ユーザーの \`yakudoc add ${name}\` で自動適用されます。`,

  noTranslationFile: () =>
    "翻訳ファイルが見つかりません。先にどちらかを実行してください:\n" +
    "  npx yakudoc init              (自分のコードの JSDoc を対象にする)\n" +
    "  npx yakudoc add <パッケージ名>  (依存ライブラリの docs を対象にする)",
  noTranslateTargets: () =>
    "翻訳対象がありません。先にどちらかを実行してください:\n" +
    "  npx yakudoc init              (自分のコードの JSDoc を対象にする)\n" +
    "  npx yakudoc add <パッケージ名>  (依存ライブラリの docs を対象にする)",
  statusFileLabel: (outPath) => `翻訳ファイル: ${outPath}`,
  statusTargetLang: (targetLang) => `翻訳先言語: ${targetLang}`,
  statusNoTargets: () => "翻訳対象がありません。",
  statusBreakdownHeader: () => "\n内訳:",
  statusBreakdownProject: (translated, total, label) =>
    `  プロジェクト  ${translated}/${total}(${label})`,
  statusBreakdownPack: (name, version, translated, total) =>
    `  ${name}${version}  ${translated}/${total}`,
  statusPendingHeader: () => "\n翻訳待ち:",
  symbolUnknown: () => "(シンボル不明)",
  pendingMore: (rest) => `  … 他 ${rest} 件`,

  engineNotInstalled: (packageName) =>
    `${packageName} がインストールされていません。` +
    `\n  npm install --save-dev ${packageName}`,
  engineApplyNote: () => "--apply 指定のため prep エンジンを使います",
  engineAutoNote: (engine, packageName) =>
    `--engine 未指定のため、インストール済みの ${engine}(${packageName})を使います`,
  engineUnknown: (name) =>
    `不明なエンジンです: ${name}(prep または local が使えます)`,
  engineNoneInstalled: () =>
    "--engine を指定してください(prep または local)。どちらのエンジンも見つかりません:\n" +
    "  npm install --save-dev yakudoc-mt       (local: 内蔵モデルで翻訳)\n" +
    "  npm install --save-dev yakudoc-ai-prep  (prep: 任意の AI に依頼)",
  engineBothInstalled: () =>
    "--engine を指定してください(prep または local)。両方のエンジンがインストールされています。",

  configReadFailed: (configPath, detail) =>
    `${configPath} を読み込めませんでした: ${detail}`,
  configNotJson: (configPath) =>
    `${configPath} を JSON として解釈できませんでした。` +
    `\n  { "targetLang": "ja" } の形式で保存し直してください。`,
  configNotObject: (configPath) =>
    `${configPath} の内容がオブジェクトではありません。` +
    `\n  { "targetLang": "ja" } の形式で保存し直してください。`,

  unsupportedLang: (code, supported) =>
    `未対応の言語コードです: ${code}\n` + `  対応コード: ${supported}`,

  tsconfigNotFoundInit: () =>
    "tsconfig.json が見つかりません。--project でパスを指定するか、" +
    "`npx tsc --init` で作成してください。",
  tsconfigNotFoundExtract: () =>
    "tsconfig.json が見つかりません。--project でパスを指定してください。",
  pluginsNotArray: () =>
    "tsconfig.json の compilerOptions.plugins が配列ではありません。" +
    "配列に修正してから再実行してください。",

  packageNotInstalled: (packageName) =>
    `${packageName} が node_modules に見つかりません。` +
    `\n  npm install ${packageName} でインストールしてから再実行してください。`,
  noTypeDefinitions: (packageName, typesHint) =>
    `${packageName} に型定義ファイル(.d.ts)が見つかりません。` +
    `\n  型定義が別パッケージの場合はそちらを指定してください(例: ${typesHint})。`,

  registryHttpError: (status) => `レジストリが HTTP ${status} を返しました`,
  registryNotJson: () => "レジストリの応答を JSON として解釈できませんでした",
  registryNotPackFormat: () => "レジストリの応答がパック形式ではありませんでした",
  registryTimeout: () => "タイムアウトしました",

  doctorLabelPluginRegistration: () => "プラグイン登録",
  doctorLabelPluginBinary: () => "プラグイン本体",
  doctorLabelTranslations: () => "translations.json",
  doctorLabelPacks: () => "翻訳パック",
  doctorLabelTargetLang: () => "翻訳先言語",
  doctorLabelEngine: () => "翻訳エンジン",
  doctorTsconfigNotFound: () => "tsconfig.json が見つかりません",
  doctorTsconfigNotFoundHint: () =>
    "--project でパスを指定するか、`npx tsc --init` で作成してから" +
    " `npx yakudoc init` を実行してください。",
  doctorPluginRegisteredDetail: (tsconfigLabel, pluginName) =>
    `${tsconfigLabel} に ${pluginName} を登録済み`,
  doctorPluginNotRegisteredDetail: (tsconfigLabel, pluginName) =>
    `${tsconfigLabel} に ${pluginName} が登録されていません`,
  doctorPluginNotRegisteredHint: () =>
    "`npx yakudoc init` で登録と初回 extract をまとめて実行できます。",
  doctorPluginBinaryMissingDetail: (pluginName) =>
    `${pluginName} が node_modules に見つかりません`,
  doctorPluginBinaryMissingHint: (pluginName) =>
    `tsserver は解決できないプラグインを黙って無視するため、` +
    `このままでは表示が変わりません:\n` +
    `  npm install --save-dev ${pluginName}`,
  doctorTargetLangFromConfig: (targetLang) =>
    `${targetLang}(.yakudoc/config.json)`,
  doctorTargetLangDefault: (targetLang) => `${targetLang}(既定)`,
  doctorTargetLangErrorHint: (defaultLang) =>
    `.yakudoc/config.json を修正するか削除してください(削除すると既定の ${defaultLang} に戻ります)。`,
  doctorTranslationsNoneWithPacks: (outLabel) =>
    `${outLabel} なし(依存パッケージの翻訳のみ使用中)`,
  doctorTranslationsMissingDetail: (outLabel) => `${outLabel} がありません`,
  doctorTranslationsMissingHint: () =>
    "`npx yakudoc init`(または `npx yakudoc extract`)で生成できます。",
  doctorTranslationsDetail: (outLabel, total, translated, untranslated) =>
    `${outLabel}(全 ${total} 件 / 翻訳済み ${translated} / 翻訳待ち ${untranslated})`,
  doctorPacksDetail: (count, parts) => `${count} パッケージ(${parts})`,
  doctorPacksNoneDetail: () =>
    "なし(`npx yakudoc add <パッケージ名>` で依存ライブラリの翻訳を追加できます)",
  doctorEngineNoneDetail: () =>
    "yakudoc-mt / yakudoc-ai-prep のどちらも見つかりません",
  doctorEngineNoneHint: () =>
    "`yakudoc translate` を使う場合はどちらかをインストールしてください" +
    "(translations.json を直接編集するだけなら不要です):\n" +
    "  npm install --save-dev yakudoc-mt       (内蔵モデルで翻訳)\n" +
    "  npm install --save-dev yakudoc-ai-prep  (任意の AI に依頼)",
  doctorSummaryErrors: (errors) =>
    `${errors} 件の問題が見つかりました。上の対処に従って解消してください。`,
  doctorSummaryWarns: (warns) => `致命的な問題はありません(警告 ${warns} 件)。`,
  doctorSummaryOk: () =>
    "すべての検査を通過しました。ホバーが変わらない場合は VSCode で" +
    "「TypeScript: Restart TS Server」を実行してください。",
};

const en: Messages = {
  usage: () => USAGE_EN,
  packagePlaceholder: () => "<package>",
  langPlaceholder: () => "<lang-code>",

  errorPrefix: (message) => `yakudoc: ${message}`,
  unknownCommand: (command) => `Unknown command: ${command}`,

  extractOutDest: (outPath) => `Output: ${outPath}`,
  extractCounts: (fileCount, extracted, translated, untranslated) =>
    `Extracted ${extracted} source strings from ${fileCount} file(s)` +
    ` (translated ${translated} / pending ${untranslated}).`,
  stalePruned: (stale) =>
    `Removed ${stale} entr${stale === 1 ? "y" : "ies"} no longer present in the source.`,
  staleKept: (stale) =>
    `Kept ${stale} entr${stale === 1 ? "y" : "ies"} no longer present in the source (use --prune to remove).`,

  pluginRegistered: (tsconfigLabel) =>
    `Registered yakudoc-ts-plugin in ${tsconfigLabel}.`,
  pluginAlreadyRegistered: (tsconfigLabel) =>
    `yakudoc-ts-plugin is already registered in ${tsconfigLabel}.`,
  langSaved: (targetLang, configLabel) =>
    `Target language: ${targetLang} (saved to ${configLabel}).`,
  pluginNotInstalledWarning: (pluginName) => `
Warning: ${pluginName} was not found in node_modules.
  Registration in tsconfig.json is done, but nothing will change until it is installed:
    npm install --save-dev ${pluginName}`,
  initNextSteps: (addExample) => `
Next steps:
  1. Add translation packs for your dependencies (most hover docs come from here)
       ${addExample}
     If a published community pack exists, translations are applied automatically.
  2. Translate the rest
       npx yakudoc translate --engine local   (built-in model; needs yakudoc-mt)
       npx yakudoc translate --engine prep    (ask any AI; needs yakudoc-ai-prep)
     or edit "translated" directly in translations.json / packs.
  3. Run "TypeScript: Restart TS Server" from the VSCode command palette
     (to apply the plugin registration; later updates apply automatically).`,

  addExtracted: (name, version, fileCount, total) =>
    `${name}${version}: ${total} entr${total === 1 ? "y" : "ies"} from ${fileCount} type-definition file(s)`,
  communityApplied: (count) =>
    `  Community pack: applied ${count} translation(s).`,
  communityNotFound: () =>
    "  Community pack: none published yet (once translated, share it with `yakudoc export`).",
  communityFetchError: (message) =>
    `  Community pack: could not fetch (${message}).`,
  progressLine: (translated, total, percent, untranslated) =>
    `Progress: ${translated} / ${total} translated (${percent}%) / ${untranslated} pending`,
  addOutDest: (relPath) => `  Output: ${relPath}`,
  addNeedPackage: () =>
    "Please specify a package name. Example: npx yakudoc add zod",
  projectDependenciesList: (deps) =>
    `\n\nDependencies in this project:\n  ${deps}`,
  addPendingRemains: () =>
    "\nSome entries are still untranslated. Run `npx yakudoc translate` to translate them.",

  removeNeedPackage: () =>
    "Please specify a package name to remove. Example: npx yakudoc remove zod",
  packRemoved: (name, relPath) =>
    `Removed the translation pack for ${name} (${relPath}).`,
  packRemoveNotFound: (name, relPath) =>
    `No translation pack for ${name} (${relPath}).`,

  exportNeedPackage: () =>
    "Please specify exactly one package name to export. Example: npx yakudoc export zod",
  packNotFound: (name, packPath) =>
    `No translation pack found for ${name} (${packPath}).` +
    `\n  Run \`yakudoc add ${name}\` first.`,
  exportWritten: (targetPath, translated, total) =>
    `Wrote ${targetPath} (translated ${translated} / ${total}).`,
  exportShareGuide: (repoUrl, lang, fileName, name) => `
To share this pack with the community:
  1. Fork ${repoUrl}
  2. Add it as packs/${lang}/${fileName}
  3. Open a pull request
Once shared, the pack is applied automatically for everyone via \`yakudoc add ${name}\`.`,

  noTranslationFile: () =>
    "No translation file found. Run one of the following first:\n" +
    "  npx yakudoc init            (target your own code's JSDoc)\n" +
    "  npx yakudoc add <package>   (target a dependency's docs)",
  noTranslateTargets: () =>
    "Nothing to translate. Run one of the following first:\n" +
    "  npx yakudoc init            (target your own code's JSDoc)\n" +
    "  npx yakudoc add <package>   (target a dependency's docs)",
  statusFileLabel: (outPath) => `Translation file: ${outPath}`,
  statusTargetLang: (targetLang) => `Target language: ${targetLang}`,
  statusNoTargets: () => "Nothing to translate.",
  statusBreakdownHeader: () => "\nBreakdown:",
  statusBreakdownProject: (translated, total, label) =>
    `  project  ${translated}/${total} (${label})`,
  statusBreakdownPack: (name, version, translated, total) =>
    `  ${name}${version}  ${translated}/${total}`,
  statusPendingHeader: () => "\nPending:",
  symbolUnknown: () => "(unknown symbol)",
  pendingMore: (rest) => `  … and ${rest} more`,

  engineNotInstalled: (packageName) =>
    `${packageName} is not installed.` +
    `\n  npm install --save-dev ${packageName}`,
  engineApplyNote: () => "Using the prep engine because --apply was given.",
  engineAutoNote: (engine, packageName) =>
    `No --engine given; using the installed engine ${engine} (${packageName}).`,
  engineUnknown: (name) => `Unknown engine: ${name} (use prep or local).`,
  engineNoneInstalled: () =>
    "Please pass --engine (prep or local). Neither engine was found:\n" +
    "  npm install --save-dev yakudoc-mt       (local: translate with the built-in model)\n" +
    "  npm install --save-dev yakudoc-ai-prep  (prep: ask any AI)",
  engineBothInstalled: () =>
    "Please pass --engine (prep or local). Both engines are installed.",

  configReadFailed: (configPath, detail) =>
    `Could not read ${configPath}: ${detail}`,
  configNotJson: (configPath) =>
    `Could not parse ${configPath} as JSON.` +
    `\n  Save it again in the form { "targetLang": "ja" }.`,
  configNotObject: (configPath) =>
    `The contents of ${configPath} are not an object.` +
    `\n  Save it again in the form { "targetLang": "ja" }.`,

  unsupportedLang: (code, supported) =>
    `Unsupported language code: ${code}\n` + `  Supported codes: ${supported}`,

  tsconfigNotFoundInit: () =>
    "tsconfig.json not found. Pass a path with --project, or create one with `npx tsc --init`.",
  tsconfigNotFoundExtract: () =>
    "tsconfig.json not found. Pass a path with --project.",
  pluginsNotArray: () =>
    "compilerOptions.plugins in tsconfig.json is not an array. Fix it to an array and retry.",

  packageNotInstalled: (packageName) =>
    `${packageName} was not found in node_modules.` +
    `\n  Install it with npm install ${packageName} and retry.`,
  noTypeDefinitions: (packageName, typesHint) =>
    `No type definitions (.d.ts) found for ${packageName}.` +
    `\n  If the types live in another package, specify that instead (e.g. ${typesHint}).`,

  registryHttpError: (status) => `The registry returned HTTP ${status}.`,
  registryNotJson: () => "Could not parse the registry response as JSON.",
  registryNotPackFormat: () => "The registry response was not in pack format.",
  registryTimeout: () => "Timed out.",

  doctorLabelPluginRegistration: () => "Plugin registration",
  doctorLabelPluginBinary: () => "Plugin binary",
  doctorLabelTranslations: () => "translations.json",
  doctorLabelPacks: () => "Translation packs",
  doctorLabelTargetLang: () => "Target language",
  doctorLabelEngine: () => "Translation engine",
  doctorTsconfigNotFound: () => "tsconfig.json not found",
  doctorTsconfigNotFoundHint: () =>
    "Pass a path with --project, or create one with `npx tsc --init`, then run" +
    " `npx yakudoc init`.",
  doctorPluginRegisteredDetail: (tsconfigLabel, pluginName) =>
    `${pluginName} is registered in ${tsconfigLabel}`,
  doctorPluginNotRegisteredDetail: (tsconfigLabel, pluginName) =>
    `${pluginName} is not registered in ${tsconfigLabel}`,
  doctorPluginNotRegisteredHint: () =>
    "`npx yakudoc init` registers it and runs the first extract in one step.",
  doctorPluginBinaryMissingDetail: (pluginName) =>
    `${pluginName} was not found in node_modules`,
  doctorPluginBinaryMissingHint: (pluginName) =>
    `tsserver silently ignores plugins it cannot resolve, so nothing will change:\n` +
    `  npm install --save-dev ${pluginName}`,
  doctorTargetLangFromConfig: (targetLang) =>
    `${targetLang} (.yakudoc/config.json)`,
  doctorTargetLangDefault: (targetLang) => `${targetLang} (default)`,
  doctorTargetLangErrorHint: (defaultLang) =>
    `Fix or delete .yakudoc/config.json (deleting reverts to the default ${defaultLang}).`,
  doctorTranslationsNoneWithPacks: (outLabel) =>
    `no ${outLabel} (using dependency translations only)`,
  doctorTranslationsMissingDetail: (outLabel) => `${outLabel} is missing`,
  doctorTranslationsMissingHint: () =>
    "Generate it with `npx yakudoc init` (or `npx yakudoc extract`).",
  doctorTranslationsDetail: (outLabel, total, translated, untranslated) =>
    `${outLabel} (${total} total / translated ${translated} / pending ${untranslated})`,
  doctorPacksDetail: (count, parts) => `${count} package(s) (${parts})`,
  doctorPacksNoneDetail: () =>
    "none (add dependency translations with `npx yakudoc add <package>`)",
  doctorEngineNoneDetail: () => "neither yakudoc-mt nor yakudoc-ai-prep was found",
  doctorEngineNoneHint: () =>
    "Install one if you want to use `yakudoc translate`" +
    " (not needed if you only edit translations.json by hand):\n" +
    "  npm install --save-dev yakudoc-mt       (translate with the built-in model)\n" +
    "  npm install --save-dev yakudoc-ai-prep  (ask any AI)",
  doctorSummaryErrors: (errors) =>
    `Found ${errors} problem(s). Follow the guidance above to resolve them.`,
  doctorSummaryWarns: (warns) =>
    `No fatal problems (${warns} warning(s)).`,
  doctorSummaryOk: () =>
    "All checks passed. If hover still does not change, run" +
    " \"TypeScript: Restart TS Server\" in VSCode.",
};

/** 現在の表示ロケールのメッセージカタログを返す */
export function m(): Messages {
  return activeLocale === "en" ? en : ja;
}
