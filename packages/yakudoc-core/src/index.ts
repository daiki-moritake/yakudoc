export { hashText, normalizeText } from "./normalize";
export {
  extractFromSourceFile,
  extractProject,
  type ExtractedComment,
  type ExtractOptions,
  type ExtractSummary,
} from "./extract";
export {
  mergeTranslations,
  readTranslations,
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
export type {
  EngineRunOptions,
  TranslationEntry,
  TranslationsFile,
} from "./types";
