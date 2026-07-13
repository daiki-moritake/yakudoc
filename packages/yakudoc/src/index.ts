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
  type PackStatus,
  type PendingEntry,
  type StatusCounts,
  type StatusOptions,
  type StatusSummary,
} from "./status";
export {
  listPacks,
  packFileNameFor,
  packPathFor,
  packageNameFromFileName,
  PACKS_DIR_NAME,
  parsePack,
  readPack,
  removePack,
  resolvePacksDir,
  writePack,
  type LoadedPack,
  type PackFile,
} from "./packs";
export {
  collectDeclarationFiles,
  extractInstalledPackage,
  resolveInstalledPackageInfo,
  type InstalledPackageInfo,
  type PackageExtractResult,
} from "./depExtract";
export {
  DEFAULT_REGISTRY_URL,
  fetchCommunityPack,
  PACKS_REPO_URL,
  packUrlFor,
  REGISTRY_ENV_VAR,
  resolveRegistryUrl,
  type FetchLike,
  type RegistryFetchResult,
} from "./registry";
export {
  applyTranslation,
  collectPending,
  loadProjectSources,
  loadSourcesAt,
  writeSources,
  type PendingItem,
  type TranslationSource,
} from "./translationSet";
export {
  addPackage,
  overlayCommunityPack,
  type AddPackageOptions,
  type AddPackageSummary,
} from "./addPack";
export type {
  EngineRunOptions,
  TranslationEntry,
  TranslationsFile,
} from "./types";
