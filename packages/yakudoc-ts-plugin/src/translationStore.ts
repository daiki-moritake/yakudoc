import * as fs from "node:fs";
import * as path from "node:path";
import {
  hashText,
  normalizeText,
  TRANSLATIONS_RELATIVE_PATH,
  type TranslationEntry,
  type TranslationsFile,
} from "yakudoc-core";

export type { TranslationEntry, TranslationsFile };

export type Logger = (message: string) => void;

const DEFAULT_RELOAD_INTERVAL_MS = 500;

/**
 * `.yakudoc/translations.json` を読み込み、原文テキストから訳文を引くストア。
 *
 * - ファイルはプロジェクトルートから上方向に探索する(モノレポ対応)
 * - tsserver は長時間生きるプロセスなので、ファイルの mtime を監視して
 *   変更があれば自動で再読み込みする(stat はスロットリングする)
 * - ファイルがまだ存在しない場合も、後から作成されれば拾う
 */
export class TranslationStore {
  private byHash = new Map<string, TranslationEntry>();
  private byNormalizedOriginal = new Map<string, TranslationEntry>();
  private loadedPath: string | undefined;
  private loadedMtimeMs = -1;
  private loadedSize = -1;
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
    return this.loadedPath
      ? `${this.loadedPath} (${this.byHash.size} entries)`
      : "translations.json not found yet";
  }

  private resolvePath(): string | undefined {
    const explicit = this.getExplicitPath();
    if (explicit) {
      return path.isAbsolute(explicit)
        ? explicit
        : path.join(this.projectRoot, explicit);
    }
    let dir = this.projectRoot;
    for (;;) {
      const candidate = path.join(dir, TRANSLATIONS_RELATIVE_PATH);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        return undefined;
      }
      dir = parent;
    }
  }

  private reloadIfChanged(): void {
    const now = Date.now();
    if (now - this.lastCheckAt < this.reloadIntervalMs) {
      return;
    }
    this.lastCheckAt = now;

    const filePath = this.resolvePath();
    if (!filePath) {
      this.clear();
      return;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      this.clear();
      return;
    }

    if (
      filePath === this.loadedPath &&
      stat.mtimeMs === this.loadedMtimeMs &&
      stat.size === this.loadedSize
    ) {
      return;
    }

    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as TranslationsFile;
      this.byHash.clear();
      this.byNormalizedOriginal.clear();
      for (const [key, entry] of Object.entries(parsed)) {
        if (!entry || typeof entry.original !== "string") {
          continue;
        }
        this.byHash.set(key, entry);
        // extractor 側のハッシュ実装が変わっても original から引き直せるよう、
        // 再計算したハッシュと正規化済み原文でも索引しておく。
        this.byHash.set(hashText(entry.original), entry);
        this.byNormalizedOriginal.set(normalizeText(entry.original), entry);
      }
      this.loadedPath = filePath;
      this.loadedMtimeMs = stat.mtimeMs;
      this.loadedSize = stat.size;
      this.log(`loaded ${this.describe()}`);
    } catch (error) {
      // 壊れた JSON(編集途中など)は読み飛ばし、直前の状態を維持する
      this.log(`failed to load ${filePath}: ${String(error)}`);
    }
  }

  private clear(): void {
    if (this.loadedPath !== undefined) {
      this.log(`translations file removed: ${this.loadedPath}`);
    }
    this.byHash.clear();
    this.byNormalizedOriginal.clear();
    this.loadedPath = undefined;
    this.loadedMtimeMs = -1;
    this.loadedSize = -1;
  }
}
