/**
 * Code coloured as Boojy colours it: Prism's grammars, the app's aliases and
 * its own Mermaid grammar, shared by the code block's overlay and the
 * Markdown view's fences so a language reads the same in both. The colours
 * are the global `.token` rules (GlobalStyles), keyed to the theme's `syntax`.
 */
import Prism from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-markup";
// C++ extends C, so C loads first; Markdown and LaTeX bring their own `md` and `tex`.
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-java";
import "prismjs/components/prism-latex";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-r";

// Map common aliases to Prism grammar keys
const LANG_ALIAS = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  htm: "markup",
  html: "markup",
  xml: "markup",
  svg: "markup",
  "c++": "cpp",
  "c#": "csharp",
};

/**
 * Mermaid's source in the editor's syntax colours: a few token kinds, enough
 * to read a flowchart by (Prism has no grammar of its own for it).
 */
Prism.languages.mermaid = {
  comment: /%%.*/,
  keyword:
    /\b(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|mindmap|journey|gitGraph|timeline|subgraph|end|participant|actor|title|section|note|loop|alt|else)\b/,
  constant: /\b(?:TD|TB|LR|RL|BT)\b/,
  string: /\[[^\]\n]*\]|\([^)\n]*\)|\{[^}\n]*\}|\|[^|\n]*\|/,
  operator: /-\.->|==>|-->>|->>|-->|---|--|->/,
};

function resolveGrammar(lang) {
  const key = LANG_ALIAS[lang] || lang;
  return Prism.languages[key] ? { grammar: Prism.languages[key], name: key } : null;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** `text` as HTML in the colours of language `langKey`, or escaped when it names none Boojy knows. */
export function highlightCode(text, langKey) {
  const resolved = resolveGrammar(langKey);
  if (resolved) {
    return Prism.highlight(text, resolved.grammar, resolved.name);
  }
  return escapeHtml(text);
}
