/**
 * The commands the `\` menu offers in a formula's source: a hand-picked list
 * for school and university maths, most used first. KaTeX knows hundreds
 * more, and they work when typed; they are only not suggested.
 *
 * Each inserts `insert`, the caret landing at `caret` (inside the first `{}`
 * when there is one), is drawn in the menu from `sample`, and is found by the
 * start of its command or of one of its plain `words`, never fuzzily.
 */
export interface LatexCommand {
  command: string;
  insert: string;
  caret: number;
  sample: string;
  words: string[];
}

/** `\frac{}{}` with the caret after the first `{`; a plain command, after its name. */
function cmd(insert: string, words: string, sample = insert): LatexCommand {
  const brace = insert.indexOf("{}");
  return {
    command: insert.match(/^\\[A-Za-z]+/)?.[0] ?? insert,
    insert,
    caret: brace >= 0 ? brace + 1 : insert.length,
    sample,
    words: words.split(" "),
  };
}

export const LATEX_COMMANDS: LatexCommand[] = [
  // Structures
  cmd("\\frac{}{}", "fraction divide over", "\\frac{a}{b}"),
  cmd("\\sqrt{}", "root square", "\\sqrt{x}"),
  cmd("\\sum_{}^{}", "sum sigma total", "\\sum_{i=1}^{n}"),
  cmd("\\int_{}^{}", "integral", "\\int_{a}^{b}"),
  cmd("\\lim_{}", "limit", "\\lim_{x \\to 0}"),
  cmd("\\prod_{}^{}", "product", "\\prod_{i=1}^{n}"),
  cmd("\\binom{}{}", "binomial choose combination", "\\binom{n}{k}"),
  cmd("\\text{}", "text words", "\\text{if}"),
  cmd("\\left(", "bracket parenthesis big", "\\left( \\frac{a}{b} \\right)"),
  cmd("\\right)", "bracket parenthesis big close", "\\left( \\frac{a}{b} \\right)"),
  cmd("\\mathbb{}", "blackboard real integer set", "\\mathbb{R}"),
  // Accents
  cmd("\\bar{}", "mean overbar line", "\\bar{x}"),
  cmd("\\hat{}", "hat estimate", "\\hat{x}"),
  cmd("\\vec{}", "vector arrow", "\\vec{v}"),
  cmd("\\dot{}", "dot derivative", "\\dot{x}"),
  cmd("\\overline{}", "line over", "\\overline{AB}"),
  // Greek
  cmd("\\alpha", "alpha greek"),
  cmd("\\beta", "beta greek"),
  cmd("\\gamma", "gamma greek"),
  cmd("\\delta", "delta greek change"),
  cmd("\\epsilon", "epsilon greek"),
  cmd("\\theta", "theta greek angle"),
  cmd("\\lambda", "lambda greek"),
  cmd("\\mu", "mu greek mean"),
  cmd("\\pi", "pi greek"),
  cmd("\\rho", "rho greek"),
  cmd("\\sigma", "sigma greek deviation"),
  cmd("\\tau", "tau greek"),
  cmd("\\phi", "phi greek"),
  cmd("\\omega", "omega greek"),
  cmd("\\Delta", "delta greek capital change"),
  cmd("\\Sigma", "sigma greek capital"),
  cmd("\\Omega", "omega greek capital"),
  // Relations
  cmd("\\le", "less equal"),
  cmd("\\ge", "greater equal"),
  cmd("\\ne", "not equal"),
  cmd("\\approx", "approximately about"),
  cmd("\\equiv", "equivalent identical"),
  cmd("\\sim", "similar distributed tilde"),
  cmd("\\propto", "proportional"),
  cmd("\\in", "in element member"),
  cmd("\\notin", "not element member"),
  cmd("\\subseteq", "subset"),
  // Arrows
  cmd("\\to", "arrow right tends"),
  cmd("\\Rightarrow", "implies arrow right"),
  cmd("\\iff", "if only arrow both"),
  cmd("\\mapsto", "maps arrow"),
  cmd("\\leftarrow", "arrow left"),
  // Operators
  cmd("\\times", "times multiply cross"),
  cmd("\\cdot", "dot multiply"),
  cmd("\\pm", "plus minus"),
  cmd("\\div", "divide"),
  cmd("\\infty", "infinity"),
  cmd("\\partial", "partial derivative"),
  cmd("\\nabla", "nabla gradient del"),
  cmd("\\cdots", "dots ellipsis"),
  // Logic and sets
  cmd("\\forall", "for all every"),
  cmd("\\exists", "exists some"),
  cmd("\\neg", "not negation"),
  cmd("\\cup", "union"),
  cmd("\\cap", "intersection"),
  cmd("\\emptyset", "empty set"),
];

/**
 * The commands `query` (what follows the `\`) names, best first: those whose
 * command starts with it, then those with a word that does, each in the
 * list's order. Case matters for the command (`\delta` ≠ `\Delta`) but not
 * for the words. An empty query offers the list's head.
 */
export function matchCommands(query: string, limit = 8): LatexCommand[] {
  if (!query) return LATEX_COMMANDS.slice(0, limit);
  const lower = query.toLowerCase();
  const byCommand = LATEX_COMMANDS.filter((c) => c.command.slice(1).startsWith(query));
  const byWord = LATEX_COMMANDS.filter(
    (c) => !byCommand.includes(c) && c.words.some((w) => w.startsWith(lower)),
  );
  return [...byCommand, ...byWord].slice(0, limit);
}

/**
 * The `\word` the caret ends, or null: the caret collapsed at the end of a
 * backslash and its letters, with no letter after it, and the backslash not
 * itself escaped (`\\` is a line break, never a command).
 */
export function commandAtCaret(
  text: string,
  start: number,
  end: number,
): { from: number; query: string } | null {
  if (start !== end) return null;
  if (/[A-Za-z]/.test(text[end] ?? "")) return null;
  const m = /\\([A-Za-z]*)$/.exec(text.slice(0, end));
  if (!m) return null;
  const from = m.index;
  // An even run of backslashes before this one leaves it a command's; an odd one escapes it.
  let run = 0;
  for (let i = from - 1; i >= 0 && text[i] === "\\"; i--) run++;
  if (run % 2 === 1) return null;
  return { from, query: m[1] };
}
