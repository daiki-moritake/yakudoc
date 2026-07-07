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
export type { TranslationEntry, TranslationsFile } from "./types";
