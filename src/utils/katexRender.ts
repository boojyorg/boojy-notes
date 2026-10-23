import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * KaTeX, and its stylesheet, in one module: loaded only with the first
 * formula (the maths block is lazy, inline formulas import this on demand),
 * never with the app's start.
 */
export type Rendered = { html: string } | { error: string };

/**
 * A formula drawn, or why it can't be. Nothing the file holds is trusted to
 * run: KaTeX's `trust` stays off, so `\href` and `\htmlClass` draw as text.
 */
export function renderFormula(source: string, displayMode = true): Rendered {
  if (!source.trim()) return { error: "" };
  try {
    return {
      html: katex.renderToString(source, { displayMode, throwOnError: true, strict: "ignore" }),
    };
  } catch (e) {
    const err = e as { rawMessage?: string; message?: string };
    return { error: String(err.rawMessage || err.message || "This formula can't be read") };
  }
}
