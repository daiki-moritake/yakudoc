export {
  configPathFor,
  readConfig,
  resolveTargetLang,
  writeConfig,
  type YakudocConfig,
} from "./config";
export {
  DEFAULT_TARGET_LANG,
  LANGUAGES,
  resolveLanguage,
  supportedLanguageCodes,
  type LanguageSpec,
} from "./languages";
export { hashText, normalizeText } from "./normalize";
export {
  extractFromSourceFile,
  extractProject,
  type ExtractedComment,
  type ExtractOptions,
  type ExtractSummary,
} from "./extract";
export {
  addPluginToTsconfig,
  effectivePluginsOf,
  initProject,
  PLUGIN_NAME,
  type InitOptions,
  type InitSummary,
} from "./init";
export {
  doctorProject,
  type DoctorCheck,
  type DoctorLevel,
  type DoctorOptions,
  type DoctorReport,
} from "./doctor";
export { resolveInstalledPackage } from "./installed";
export {
  mergeTranslations,
  needsTranslation,
  readTranslations,
  resolveTranslationsPath,
  TRANSLATIONS_RELATIVE_PATH,
  writeTranslations,
  type MergeStats,
} from "./translationsFile";
export {
  placeholderToken,
  protectText,
  restoreText,
  type ProtectedText,
  type RestoredText,
} from "./placeholders";
export {
  computeStatus,
  statusExitCode,
  statusProject,
  type PendingEntry,
  type StatusCounts,
  type StatusOptions,
  type StatusSummary,
} from "./status";
export type {
  EngineRunOptions,
  TranslationEntry,
  TranslationsFile,
} from "./types";
