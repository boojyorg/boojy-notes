/** Sets of block kinds that several parts of the editor ask about. */

/** List items: they nest by indent, and Enter continues them as another of their kind. */
export const LIST_TYPES: ReadonlySet<string> = new Set(["bullet", "numbered", "checkbox"]);

/**
 * The kinds a line can be besides a paragraph: what Backspace at its start
 * demotes to a paragraph, and, with `p`, what Turn into turns among.
 */
export const LINE_KIND_TYPES: ReadonlySet<string> = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  ...LIST_TYPES,
  "blockquote",
]);

/** The deepest a list item nests, in the editor and when read from a file. */
export const MAX_INDENT = 6;
