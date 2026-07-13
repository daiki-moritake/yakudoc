import { applyEdits, modify, parse } from "jsonc-parser";

export const PLUGIN_NAME = "yakudoc-ts-plugin";

interface TsconfigLike {
  compilerOptions?: {
    plugins?: unknown;
  };
}

/**
 * tsconfig.json(JSONC)のテキストに compilerOptions.plugins エントリを追加する。
 * コメントや既存のフォーマットは保持する。登録済みなら何もしない。
 * plugins が配列以外の値なら安全に編集できないためエラーにする。
 *
 * 注意: この実装は packages/yakudoc/src/init.ts の addPluginToTsconfig と
 * 対で保守する(拡張側は typescript 非依存のため共有していない。extends 解決
 * 後の実効 plugins を考慮できるのは CLI の init 側のみ)。
 */
export function addYakudocPlugin(
  tsconfigText: string,
  pluginName: string = PLUGIN_NAME
): { text: string; changed: boolean } {
  const root = (parse(tsconfigText) ?? {}) as TsconfigLike;
  const rawPlugins = root.compilerOptions?.plugins;
  if (rawPlugins !== undefined && !Array.isArray(rawPlugins)) {
    throw new Error(
      "compilerOptions.plugins が配列ではありません。配列に修正してください。"
    );
  }
  const plugins = (rawPlugins ?? []) as Array<{ name?: string }>;
  if (plugins.some((plugin) => plugin?.name === pluginName)) {
    return { text: tsconfigText, changed: false };
  }
  const edits = modify(
    tsconfigText,
    ["compilerOptions", "plugins", plugins.length],
    { name: pluginName },
    {
      isArrayInsertion: true,
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    }
  );
  return { text: applyEdits(tsconfigText, edits), changed: true };
}
