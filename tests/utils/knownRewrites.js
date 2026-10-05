// The rewrites already on record, for the generated documents
// (roundTripProperty.test.js) and the corpus of real notes
// (tests/corpus/corpus.test.js): each a backlog line, a preservation
// KNOWN_FAILURES entry or a sanctioned change. Delete an entry once its
// rewrite is fixed; the properties guard it from then on.

const lines = (doc) => doc.split(/\r?\n/);

/** A document holding a rewrite already on record: why, and how to tell. */
export const KNOWN = [
  // docs/BACKLOG.md, Undocumented normalisations: an opener with no closer,
  // or nothing between the two, is rewritten.
  [
    "frontmatter unclosed or empty",
    (doc) => {
      const l = lines(doc);
      if (l[0].trim() !== "---") return false;
      const close = l.findIndex((x, i) => i > 0 && x.trim() === "---");
      return close === -1 || close === 1;
    },
  ],
  // preservation KNOWN_FAILURES, blockquotes-callouts.md: `>` becomes `> `.
  ["a quote line without its space", (doc) => lines(doc).some((l) => /^>(?! )/.test(l))],
  // preservation KNOWN_FAILURES, blockquotes-callouts.md: the type is lowercased.
  ["a callout type with capitals", (doc) => /^> \[![a-z]*[A-Z]/m.test(doc.replace(/\r/g, ""))],
  // docs/BACKLOG.md, Undocumented normalisations: `- [X]` becomes `- [x]`.
  ["an uppercase task mark", (doc) => doc.includes("[X]")],
  // docs/BACKLOG.md, Undocumented normalisations: a divider is dedented and trimmed.
  [
    "a divider spelled otherwise",
    (doc) => lines(doc).some((l) => /^( {1,3}---|---[ \t]+)$/.test(l)),
  ],
  // preservation KNOWN_FAILURES, trailing-ws-list-lines.md (pictures and a
  // tab after an empty marker too, found by this file): trailing whitespace
  // on a line that is not a paragraph's goes.
  [
    "trailing whitespace on a line that is not a paragraph's",
    (doc) =>
      lines(doc).some(
        (l) => /[ \t]$/.test(l) && /^(\s*([-*+]|\d+[.)])([ \t]|$)|#{1,6} |!\[|>)/.test(l),
      ),
  ],
  // docs/BACKLOG.md, Markdown compatibility: a line straight under a table is
  // read as a paragraph and written apart, where GFM reads it as a row.
  [
    "a line straight under a table",
    (doc) => {
      const l = lines(doc);
      return l.some((x, i) => i > 0 && x !== "" && !x.startsWith("|") && l[i - 1].startsWith("|"));
    },
  ],
  // docs/SPEC-markdown-source-of-truth.md, sanctioned: the blank line before a
  // `---` straight under a paragraph, which every other reader takes for a
  // heading underline.
  [
    "sanctioned: a tight `---` under a line",
    (doc) => {
      const l = lines(doc);
      return l.some((x, i) => i > 0 && x === "---" && l[i - 1].trim() !== "" && l[i - 1] !== "---");
    },
  ],
];
export const known = (doc) => KNOWN.some(([, holds]) => holds(doc));

/** Whether two kinds of delimiter open and close across each other (`**a==b**c==`). */
function interleaved(text) {
  const kinds = text.match(/\*\*|__|~~|==|`+|\*|_/g) ?? [];
  const n = kinds.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++)
        for (let l = k + 1; l < n; l++)
          if (kinds[i] === kinds[k] && kinds[j] === kinds[l] && kinds[i] !== kinds[j]) return true;
  return false;
}

/** Inline text holding a rewrite already on record. */
export const KNOWN_INLINE = [
  // docs/BACKLOG.md, Markdown compatibility (code: literal handling): a code
  // span's backticks and an emphasis delimiter, or two kinds of delimiter,
  // interleaved are paired differently by the renderer than as written.
  ["code and emphasis interleaved", (t) => t.includes("`") && /[*_~=]/.test(t)],
  ["two kinds of delimiter interleaved", interleaved],
  // docs/BACKLOG.md, Markdown compatibility: markup inside a wikilink's
  // target is rendered inside the link, and its tags reach the file.
  ["markup inside a wikilink", (t) => /\[\[(?:\\.|[^\]\\])*[*_`~=<]/.test(t)],
  // docs/BACKLOG.md, Markdown compatibility: a bare URL with an unclosed
  // parenthesis before a `#tag` has the tag drawn inside the link's own HTML.
  ["a bare URL's unclosed parenthesis before a tag", (t) => /https?:\/\/\S*\([^\s)]*#/.test(t)],
  // The same pipeline: a `#tag` inside a wikilink's target (`[[Notes #todo]]`).
  // (`Note#Heading` is a heading link, not a tag.)
  ["a tag inside a wikilink", (t) => /\[\[[^\]]*[^\p{L}\p{N}]#\p{L}/u.test(t)],
  // docs/BACKLOG.md, Markdown compatibility (alternate dividers): a run of
  // five stars or more is paired as bold and italic delimiters (`******` an
  // empty bold italic, which the first edit loses).
  ["a run of five stars or more", (t) => t.includes("*****")],
  // The same pairing: an escaped delimiter beside live ones (`\**a**a*`).
  [
    "an escaped delimiter among live ones",
    (t) => /\\[*_~=`]/.test(t) && /[*_~=`]/.test(t.replace(/\\./g, "")),
  ],
];

/** The known rewrite a document holds, by name, or null. */
export const knownRewrite = (doc) => KNOWN.find(([, holds]) => holds(doc))?.[0] ?? null;
