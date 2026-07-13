import { createRequire } from "node:module";
import * as path from "node:path";

/**
 * パッケージが projectDir から Node の解決規則で見つかるかを調べ、
 * 見つかればその場所(パッケージディレクトリ)を返す。見つからなければ undefined。
 *
 * tsserver も compilerOptions.plugins のプラグインを node_modules の
 * 上方向探索で解決するため、この結果が「プラグインが実際に読み込めるか」の
 * 近似になる。main(dist/)が未ビルドでも存在だけは検知できるよう、
 * package.json → main の順で解決を試みる。
 */
export function resolveInstalledPackage(
  projectDir: string,
  packageName: string
): string | undefined {
  const requireFrom = createRequire(path.join(projectDir, "__yakudoc__.js"));
  try {
    return path.dirname(requireFrom.resolve(`${packageName}/package.json`));
  } catch {
    // exports フィールドで package.json を公開していないパッケージ向けの後段
    try {
      return path.dirname(requireFrom.resolve(packageName));
    } catch {
      return undefined;
    }
  }
}
