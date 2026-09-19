// @ts-check

/**
 * What a code block's info string names, for reading it back to the user.
 *
 * **The file keeps the word that was typed.** ` ```js ` stays `js` on disk, as
 * it does in Obsidian, where the file is the document; this is what the corner
 * of the block and the language menu read it as. Prism's own alias table
 * (`LANG_ALIAS` in `CodeBlock`) answers a different question — which grammar
 * draws the colours — so `xml` is markup there and stays `xml` here: a file
 * that says xml is not HTML, whatever highlights it.
 */

/** Info string → the value the language menu offers. */
const DISPLAY_ALIAS: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  htm: "html",
  plain: "",
  text: "",
  txt: "",
};

/**
 * The language an info string names, as the app spells it: the value a menu
 * row carries, `""` for no language, or the word itself when the app knows no
 * better (kept, read as written, highlighted by nothing).
 */
export function canonicalLang(info: string | undefined | null): string {
  const word = (info ?? "").trim().toLowerCase();
  if (!word) return "";
  return DISPLAY_ALIAS[word] ?? word;
}

/** Whether two info strings name the same language, so a re-pick writes nothing. */
export function sameLang(a: string | undefined | null, b: string | undefined | null): boolean {
  return canonicalLang(a) === canonicalLang(b);
}
