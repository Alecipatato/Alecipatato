import { Fragment, type ReactNode } from "react";
import { fmt } from "./config";

/**
 * Texte avec mise en forme : rich("Payez <b>15 %</b> de {x}", { b: (s) => <strong>{s}</strong> }, { x: "la marge" }).
 * Les balises viennent des dictionnaires (jamais des valeurs insérées).
 */
export function rich(
  template: string,
  tags: Record<string, (chunk: ReactNode) => ReactNode>,
  values: Record<string, string | number> = {},
): ReactNode {
  const parts: ReactNode[] = [];
  const re = /<(\w+)>(.*?)<\/\1>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(template))) {
    if (match.index > last) parts.push(fmt(template.slice(last, match.index), values));
    const render = tags[match[1]];
    const inner = fmt(match[2], values);
    parts.push(<Fragment key={parts.length}>{render ? render(inner) : inner}</Fragment>);
    last = re.lastIndex;
  }
  if (last < template.length) parts.push(fmt(template.slice(last), values));
  return parts;
}
