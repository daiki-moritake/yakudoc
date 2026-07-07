import type * as ts from "typescript/lib/tsserverlibrary";

/** 原文テキストを受け取り、訳文か undefined(訳なし)を返す */
export type Translate = (text: string) => string | undefined;

/**
 * SymbolDisplayPart の列を訳文に差し替える。
 *
 * 2 段階で照合する:
 * 1. 全パーツを連結したテキスト全体で照合(通常の説明文はこれで当たる)
 * 2. 外れた場合、kind === "text" のパーツを個別に照合
 *    (@param タグの text は [parameterName, space, text] の列になるため、
 *     説明部分だけがエントリとして登録されているケースを拾う)
 */
export function rewriteDisplayParts(
  parts: ts.SymbolDisplayPart[] | undefined,
  translate: Translate
): ts.SymbolDisplayPart[] | undefined {
  if (!parts || parts.length === 0) {
    return parts;
  }

  const fullText = parts.map((part) => part.text).join("");
  const whole = translate(fullText);
  if (whole !== undefined) {
    return [{ kind: "text", text: whole }];
  }

  let changed = false;
  const rewritten = parts.map((part) => {
    if (part.kind !== "text") {
      return part;
    }
    const translated = translate(part.text);
    if (translated === undefined) {
      return part;
    }
    changed = true;
    return { ...part, text: translated };
  });
  return changed ? rewritten : parts;
}

export function rewriteTags(
  tags: ts.JSDocTagInfo[] | undefined,
  translate: Translate
): ts.JSDocTagInfo[] | undefined {
  if (!tags || tags.length === 0) {
    return tags;
  }
  return tags.map((tag) =>
    tag.text && tag.text.length > 0
      ? { ...tag, text: rewriteDisplayParts(tag.text, translate) }
      : tag
  );
}

/** ホバー表示(getQuickInfoAtPosition) */
export function rewriteQuickInfo(
  quickInfo: ts.QuickInfo | undefined,
  translate: Translate
): ts.QuickInfo | undefined {
  if (!quickInfo) {
    return quickInfo;
  }
  return {
    ...quickInfo,
    documentation: rewriteDisplayParts(quickInfo.documentation, translate),
    tags: rewriteTags(quickInfo.tags, translate),
  };
}

/** 補完候補の詳細(getCompletionEntryDetails) */
export function rewriteCompletionEntryDetails(
  details: ts.CompletionEntryDetails | undefined,
  translate: Translate
): ts.CompletionEntryDetails | undefined {
  if (!details) {
    return details;
  }
  return {
    ...details,
    documentation: rewriteDisplayParts(details.documentation, translate),
    tags: rewriteTags(details.tags, translate),
  };
}

/** シグネチャヘルプ(getSignatureHelpItems) */
export function rewriteSignatureHelpItems(
  items: ts.SignatureHelpItems | undefined,
  translate: Translate
): ts.SignatureHelpItems | undefined {
  if (!items) {
    return items;
  }
  return {
    ...items,
    items: items.items.map((item) => ({
      ...item,
      documentation: rewriteDisplayParts(item.documentation, translate) ?? [],
      tags: rewriteTags(item.tags, translate) ?? [],
      parameters: item.parameters.map((parameter) => ({
        ...parameter,
        documentation:
          rewriteDisplayParts(parameter.documentation, translate) ?? [],
      })),
    })),
  };
}
