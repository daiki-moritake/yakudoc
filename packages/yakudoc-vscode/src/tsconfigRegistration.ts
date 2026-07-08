import { applyEdits, modify, parse } from "jsonc-parser";

export const PLUGIN_NAME = "yakudoc-ts-plugin";

interface TsconfigLike {
  compilerOptions?: {
    plugins?: Array<{ name?: string }>;
  };
}

/**
 * tsconfig.json(JSONC)のテキストに compilerOptions.plugins エントリを追加する。
 * コメントや既存のフォーマットは保持する。登録済みなら何もしない。
 */
export function addYakudocPlugin(
  tsconfigText: string,
  pluginName: string = PLUGIN_NAME
): { text: string; changed: boolean } {
  const root = (parse(tsconfigText) ?? {}) as TsconfigLike;
  const plugins = root.compilerOptions?.plugins ?? [];
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
