/** translate のエンジン名 → 実装パッケージ */
export const ENGINE_PACKAGES: Record<string, string> = {
  prep: "yakudoc-ai-prep",
  local: "yakudoc-mt",
};

export interface EngineSelection {
  /** エンジン名(prep | local) */
  engine: string;
  /** 実装パッケージ名 */
  packageName: string;
  /** 自動選択したときの説明(CLI が表示する) */
  note?: string;
}

/**
 * translate で使うエンジンを決める。
 *
 * - --engine 指定があればそれ(不明な名前はエラー)
 * - --apply 指定は prep 専用の操作なので prep に確定する
 * - どちらも無ければインストール済みのエンジンを探し、1 つだけなら
 *   それを自動選択する(0 or 2 つなら案内付きのエラー)
 */
export function selectEngine(
  explicit: string | undefined,
  applyPath: string | undefined,
  isInstalled: (packageName: string) => boolean
): EngineSelection {
  if (explicit) {
    const packageName = ENGINE_PACKAGES[explicit];
    if (!packageName) {
      throw new Error(
        `不明なエンジンです: ${explicit}(prep または local が使えます)`
      );
    }
    return { engine: explicit, packageName };
  }

  if (applyPath) {
    return {
      engine: "prep",
      packageName: ENGINE_PACKAGES.prep,
      note: "--apply 指定のため prep エンジンを使います",
    };
  }

  const installed = Object.entries(ENGINE_PACKAGES).filter(([, packageName]) =>
    isInstalled(packageName)
  );
  if (installed.length === 1) {
    const [engine, packageName] = installed[0];
    return {
      engine,
      packageName,
      note: `--engine 未指定のため、インストール済みの ${engine}(${packageName})を使います`,
    };
  }
  if (installed.length === 0) {
    throw new Error(
      "--engine を指定してください(prep または local)。どちらのエンジンも見つかりません:\n" +
        "  npm install --save-dev yakudoc-mt       (local: 内蔵モデルで翻訳)\n" +
        "  npm install --save-dev yakudoc-ai-prep  (prep: 任意の AI に依頼)"
    );
  }
  throw new Error(
    "--engine を指定してください(prep または local)。両方のエンジンがインストールされています。"
  );
}
