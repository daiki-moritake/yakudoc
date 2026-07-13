import * as fs from "node:fs";
import * as path from "node:path";
import {
  hashText,
  normalizeText,
  PACKS_DIR_NAME,
  parsePack,
  TRANSLATIONS_RELATIVE_PATH,
  type TranslationEntry,
  type TranslationsFile,
} from "yakudoc";

export type { TranslationEntry, TranslationsFile };

export type Logger = (message: string) => void;

const DEFAULT_RELOAD_INTERVAL_MS = 500;

/** `.yakudoc/` ディレクトリ名(translations.json の親) */
const YAKUDOC_DIR_NAME = path.dirname(TRANSLATIONS_RELATIVE_PATH);

/** 監視対象のファイル一式 */
interface StoreFiles {
  /** translations.json(存在しないこともある) */
  translationsFile?: string;
  /** packs/ ディレクトリ(存在しないこともある) */
  packsDir?: string;
}

/**
 * `.yakudoc/translations.json` と `.yakudoc/packs/*.json`(依存パッケージの
 * 翻訳パック)を読み込み、原文テキストから訳文を引くストア。
 *
 * - `.yakudoc/` はプロジェクトルートから上方向に探索する(モノレポ対応)
 * - tsserver は長時間生きるプロセスなので、各ファイルの mtime とパックの
 *   増減を監視して変更があれば自動で再読み込みする(stat はスロットリングする)
 * - ファイルがまだ存在しない場合も、後から作成されれば拾う
 * - 同じ原文がプロジェクトとパックの両方にある場合はプロジェクトの訳を優先する
 */
export class TranslationStore {
  private byHash = new Map<string, TranslationEntry>();
  private byNormalizedOriginal = new Map<string, TranslationEntry>();
  private loadedSignature = "";
  private loadedFileCount = 0;
  private lastCheckAt = 0;

  constructor(
    private readonly projectRoot: string,
    private readonly getExplicitPath: () => string | undefined,
    private readonly log: Logger = () => {},
    private readonly reloadIntervalMs: number = DEFAULT_RELOAD_INTERVAL_MS
  ) {}

  /**
   * 原文テキストに対応する訳文を返す。未訳・未登録なら undefined。
   */
  translate(originalText: string): string | undefined {
    this.reloadIfChanged();
    const normalized = normalizeText(originalText);
    if (!normalized) {
      return undefined;
    }
    const entry =
      this.byHash.get(hashText(normalized)) ??
      this.byNormalizedOriginal.get(normalized);
    if (!entry || !entry.translated) {
      return undefined;
    }
    return entry.translated;
  }

  /** ログ表示用の現在の読み込み状態 */
  describe(): string {
    return this.loadedFileCount > 0
      ? `${this.loadedFileCount} file(s), ${this.byHash.size} entries`
      : "no translation files found yet";
  }

  /**
   * 監視対象を解決する。明示パスがあればそのファイルと隣の packs/。
   * 無ければ projectRoot から上方向に、translations.json か packs/ を含む
   * `.yakudoc/` ディレクトリを探す。
   */
  private resolveFiles(): StoreFiles {
    const explicit = this.getExplicitPath();
    if (explicit) {
      const translationsFile = path.isAbsolute(explicit)
        ? explicit
        : path.join(this.projectRoot, explicit);
      return {
        translationsFile,
        packsDir: path.join(path.dirname(translationsFile), PACKS_DIR_NAME),
      };
    }
    let dir = this.projectRoot;
    for (;;) {
      const yakudocDir = path.join(dir, YAKUDOC_DIR_NAME);
      const translationsFile = path.join(dir, TRANSLATIONS_RELATIVE_PATH);
      const packsDir = path.join(yakudocDir, PACKS_DIR_NAME);
      if (fs.existsSync(translationsFile) || fs.existsSync(packsDir)) {
        return { translationsFile, packsDir };
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        return {};
      }
      dir = parent;
    }
  }

  /** 読み込むべきファイルの一覧(translations.json → パックの順) */
  private listFiles(files: StoreFiles): string[] {
    const result: string[] = [];
    if (files.translationsFile && fs.existsSync(files.translationsFile)) {
      result.push(files.translationsFile);
    }
    if (files.packsDir) {
      let names: string[] = [];
      try {
        names = fs.readdirSync(files.packsDir);
      } catch {
        // packs/ が無いのは通常の状態
      }
      for (const name of names.sort()) {
        if (name.toLowerCase().endsWith(".json")) {
          result.push(path.join(files.packsDir, name));
        }
      }
    }
    return result;
  }

  private reloadIfChanged(): void {
    const now = Date.now();
    if (now - this.lastCheckAt < this.reloadIntervalMs) {
      return;
    }
    this.lastCheckAt = now;

    const files = this.resolveFiles();
    const filePaths = this.listFiles(files);
    if (filePaths.length === 0) {
      if (this.loadedSignature !== "") {
        this.log("translation files removed");
      }
      this.clear();
      return;
    }

    // 全ファイルの (パス, mtime, サイズ) を署名にして変更を検知する。
    // パックの追加・削除もパスの並びの変化として現れる
    const parts: string[] = [];
    for (const filePath of filePaths) {
      try {
        const stat = fs.statSync(filePath);
        parts.push(`${filePath}:${stat.mtimeMs}:${stat.size}`);
      } catch {
        parts.push(`${filePath}:missing`);
      }
    }
    const signature = parts.join("|");
    if (signature === this.loadedSignature) {
      return;
    }

    const byHash = new Map<string, TranslationEntry>();
    const byNormalizedOriginal = new Map<string, TranslationEntry>();
    let loadedCount = 0;
    // パック → translations.json の順で登録し、後勝ちでプロジェクトの訳を
    // 優先する(listFiles は translations.json が先頭なので逆順に処理する)
    for (const filePath of [...filePaths].reverse()) {
      const entries = this.readEntries(filePath);
      if (!entries) {
        continue;
      }
      loadedCount += 1;
      for (const [key, entry] of Object.entries(entries)) {
        byHash.set(key, entry);
        // extractor 側のハッシュ実装が変わっても original から引き直せるよう、
        // 再計算したハッシュと正規化済み原文でも索引しておく。
        byHash.set(hashText(entry.original), entry);
        byNormalizedOriginal.set(normalizeText(entry.original), entry);
      }
    }

    if (loadedCount === 0) {
      // すべて壊れた JSON(編集途中など)なら直前の状態を維持する
      return;
    }

    this.byHash = byHash;
    this.byNormalizedOriginal = byNormalizedOriginal;
    this.loadedSignature = signature;
    this.loadedFileCount = loadedCount;
    this.log(`loaded ${this.describe()}`);
  }

  /**
   * 1 ファイル分のエントリを読む。translations.json 形式(ハッシュ → エントリ)
   * とパック形式({ entries: ... })の両方を受け付ける。壊れていれば undefined。
   */
  private readEntries(filePath: string): TranslationsFile | undefined {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      this.log(`failed to load ${filePath}: ${String(error)}`);
      return undefined;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    if ((parsed as { entries?: unknown }).entries !== undefined) {
      const pack = parsePack(parsed, path.basename(filePath));
      return pack?.entries;
    }
    const entries: TranslationsFile = {};
    for (const [key, entry] of Object.entries(
      parsed as Record<string, TranslationEntry>
    )) {
      if (entry && typeof entry.original === "string") {
        entries[key] = entry;
      }
    }
    return entries;
  }

  private clear(): void {
    this.byHash = new Map();
    this.byNormalizedOriginal = new Map();
    this.loadedSignature = "";
    this.loadedFileCount = 0;
  }
}
