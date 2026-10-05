// The rewrites already on record, for the generated documents
// (roundTripProperty.test.js) and the corpus of real notes
// (tests/corpus/corpus.test.js): each a backlog line, a preservation
// KNOWN_FAILURES entry or a sanctioned change. Delete an entry once its
// rewrite is fixed; the properties guard it from then on.

const lines = (doc) => doc.split(/\r?\n/);

/** A document holding a rewrite already on record: why, and how to tell. */
export const KNOWN = [
  // docs/SPEC-markdown-source-of-truth.md, sanctioned: the blank line before a
  // `---` straight under a paragraph, which every other reader takes for a
  // heading underline.
  [
    "sanctioned: a tight `---` under a line",
    (doc) => {
      const l = lines(doc);
      const divider = (x) => /^ {0,3}---[ \t]*$/.test(x);
      return l.some((x, i) => i > 0 && divider(x) && l[i - 1].trim() !== "" && !divider(l[i - 1]));
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
  // Wikilink brackets inside a wikilink (`[[[[|a]]]]`) pair as no reader would.
  ["wikilink brackets nested", (t) => /\[\[[^\]]*\[\[/.test(t)],
  // An alias is prose, so a delimiter in it pairs with one past the link (`[[x|**]]**`).
  [
    "a delimiter in an alias pairing past its link",
    (t) => {
      const alias = t.match(/\[\[[^\]]*\|([^\]]*)\]\]/);
      if (!alias) return false;
      const outside = t.replace(alias[0], "");
      return [..."*~=`_"].some((d) => alias[1].includes(d) && outside.includes(d));
    },
  ],
  // The same pairing: an escaped delimiter beside live ones (`\**a**a*`).
  [
    "an escaped delimiter among live ones",
    (t) => /\\[*_~=`]/.test(t) && /[*_~=`]/.test(t.replace(/\\./g, "")),
  ],
];

/** The known rewrite a document holds, by name, or null. */
export const knownRewrite = (doc) => KNOWN.find(([, holds]) => holds(doc))?.[0] ?? null;
