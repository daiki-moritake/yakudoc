import type * as tsserver from "typescript/lib/tsserverlibrary";
import {
  rewriteCompletionEntryDetails,
  rewriteQuickInfo,
  rewriteSignatureHelpItems,
} from "./rewrite";
import { TranslationStore } from "./translationStore";

interface YakudocPluginConfig {
  /** false にすると原文表示に戻す(既定: true)。VSCode 拡張のトグルが configurePlugin 経由で送る */
  enabled?: boolean;
  /** translations.json の場所を明示する場合に指定(既定: プロジェクトルートから上方向に .yakudoc/translations.json を探索) */
  translationsPath?: string;
}

function init(_modules: { typescript: typeof tsserver }) {
  // VSCode 拡張から configurePlugin() で送られる設定は、プロジェクトごとの
  // create() を再実行せず onConfigurationChanged() に届く。全プロジェクトで
  // 共有する 1 つの設定オブジェクトを両者から参照する。
  const sharedConfig: YakudocPluginConfig = { enabled: true };

  function create(info: tsserver.server.PluginCreateInfo): tsserver.LanguageService {
    Object.assign(sharedConfig, info.config);

    const log = (message: string) =>
      info.project.projectService.logger.info(`[yakudoc] ${message}`);

    const projectRoot = info.project.getCurrentDirectory();
    const store = new TranslationStore(
      projectRoot,
      () => sharedConfig.translationsPath,
      log
    );
    const translate = (text: string): string | undefined =>
      sharedConfig.enabled === false ? undefined : store.translate(text);

    const languageService = info.languageService;
    const proxy: tsserver.LanguageService = Object.create(null);
    for (const key of Object.keys(languageService) as Array<
      keyof tsserver.LanguageService
    >) {
      const member = languageService[key];
      (proxy as unknown as Record<string, unknown>)[key] =
        typeof member === "function"
          ? (member as (...args: unknown[]) => unknown).bind(languageService)
          : member;
    }

    proxy.getQuickInfoAtPosition = (fileName, position) =>
      rewriteQuickInfo(
        languageService.getQuickInfoAtPosition(fileName, position),
        translate
      );

    proxy.getCompletionEntryDetails = (
      fileName,
      position,
      entryName,
      formatOptions,
      source,
      preferences,
      data
    ) =>
      rewriteCompletionEntryDetails(
        languageService.getCompletionEntryDetails(
          fileName,
          position,
          entryName,
          formatOptions,
          source,
          preferences,
          data
        ),
        translate
      );

    proxy.getSignatureHelpItems = (fileName, position, options) =>
      rewriteSignatureHelpItems(
        languageService.getSignatureHelpItems(fileName, position, options),
        translate
      );

    log(`activated (project: ${projectRoot}, ${store.describe()})`);
    return proxy;
  }

  function onConfigurationChanged(config: YakudocPluginConfig): void {
    Object.assign(sharedConfig, config);
  }

  return { create, onConfigurationChanged };
}

export = init;
