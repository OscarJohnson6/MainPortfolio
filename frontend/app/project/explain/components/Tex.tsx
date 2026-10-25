'use client';

import katex from 'katex';
import 'katex/dist/katex.min.css';
import { memo, useMemo } from 'react';

/** Renders LaTeX with KaTeX (HTML + MathML, so screen readers get real math). */
export const Tex = memo(function Tex({
  tex,
  display = false,
  className,
}: {
  tex: string;
  display?: boolean;
  className?: string;
}) {
  const html = useMemo(
    () => katex.renderToString(tex, { throwOnError: false, displayMode: display, strict: 'ignore' }),
    [tex, display],
  );
  // `relative` keeps KaTeX's hidden MathML copy inside scroll containers (it is absolutely positioned).
  return <span className={`relative ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
});

/** Plain text with inline $…$ math segments. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\$[^$]+\$)/g);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.startsWith('$') && p.endsWith('$') && p.length > 2 ? <Tex key={i} tex={p.slice(1, -1)} /> : <span key={i}>{p}</span>,
      )}
    </span>
  );
}
