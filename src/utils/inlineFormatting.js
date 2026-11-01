// Inline markdown ↔ HTML conversion utilities.
// Stores formatting as markdown tokens in block.text, renders as HTML via innerHTML.

import { CARET_ANCHOR_CLASS, ESCAPE_CLASS, INLINE_MATH_CLASS } from "./domHelpers";
import { parseWikilinkTarget, wikilinkKey } from "./wikilinkTarget";
import { LINK_DEST } from "./linkDestination";
import { TAG_RE } from "./tags";
import { codeSourceText, codeSpanSource, editedCodeSpanSource, findCodeSpans } from "./codeSpans";

/** Step 1 of the renderer, for prose that has been read back to characters. */
const escapeHtml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** The three entities step 1 of the renderer makes, back to their characters. */
const unescapeHtml = (html) =>
  html.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/**
 * The rendered HTML, one piece at a time: a whole link, code span or wikilink
 * (with everything inside it), any other tag, or a run of prose between tags.
 * Every `<` in the string is a tag's, because the text's own were escaped first.
 */
const PROSE_OR_ELEMENT_RE =
  /<a\b[^>]*>[\s\S]*?<\/a>|<code\b[^>]*>[\s\S]*?<\/code>|<span class="wikilink[^"]*"[^>]*>[\s\S]*?<\/span>|<[^>]*>|[^<]+/g;

/**
 * A code span, a bare URL or a link's destination (`](…)`), left whole for
 * their own passes, or inline maths by the Pandoc-style
 * rule: `$` with no space or `$` after it, a formula that does not end in a
 * space, and a closing `$` not followed by a digit or another `$`. Neither
 * dollar may be escaped. So `$x^2$` is maths and `costs $5 and $10` is not.
 * One line only; a soft break ends the chance.
 */
const CODE_OR_MATH_RE = new RegExp(
  String.raw`(\`[^\`]+\`|https?:\/\/[^\s<]+|\]\(${LINK_DEST}\))|(?<![\\$])\$(?=[^\s$])((?:[^$\n\\]|\\[^\n])+?)(?<=\S)\$(?![$\d])`,
  "g",
);

/**
 * The Markdown a rendered code element stands for: its source as the file
 * wrote it (`data-md`) while it still shows that source's text, so an
 * untouched span keeps its spelling (backticks, padding, a line break);
 * edited, the same runs and padding around the new text where they still
 * read back as it (`editedCodeSpanSource`).
 */
function codeElementMarkdown(el) {
  const text = el.textContent.replace(/\u200B/g, "");
  const source = el.getAttribute("data-md");
  if (!source) return codeSpanSource(text);
  return codeSourceText(source) === text ? source : editedCodeSpanSource(source, text);
}

/** The inline formula's element: its source on `data-math`, drawn by KaTeX later (`utils/inlineMath`). */
function mathAtomHtml(escapedSource) {
  const attr = escapedSource.replace(/"/g, "&quot;");
  return `<span class="${INLINE_MATH_CLASS}" contenteditable="false" data-math="${attr}">$${escapedSource}$</span>`;
}

/**
 * What a backslash escapes: any ASCII punctuation, as CommonMark reads it
 * (and Obsidian, and the writer, which escapes a soft-break line's first
 * punctuation so it never opens a block: `\-`, `1\.`). A backslash before
 * anything else is text (`C:\Users`).
 */
export const ESCAPABLE_RE = /[!-/:-@[-`{-~]/;

/** A backslash escape in prose: the symbol alone, sealed; its backslash is the walker's to write back. */
const escapeAtomHtml = (ch) => `<span class="${ESCAPE_CLASS}" contenteditable="false">${ch}</span>`;

const ESC_TOKEN_RE = /\x00ESC(\d+)\x00/g;
/** Rendered text ending in an escape, inside formatting or not. */
const ESCAPE_AT_END_RE = new RegExp(
  `<span class="${ESCAPE_CLASS}"[^>]*>[^<]*</span>(?:</[a-z]+>)*$`,
);
/** A code span or a wikilink, whole: an escape in either is shown as written. */
const LITERAL_ESCAPE_RE =
  /<code\b[^>]*>[\s\S]*?<\/code>|<span class="wikilink[^"]*"[^>]*>[\s\S]*?<\/span>/g;

/**
 * The shielded escapes put back into the rendered HTML: as written inside a
 * tag (an `href`, a wikilink's `data-target`), a code span or a wikilink, and
 * as sealed elements everywhere else. Inside a tag the escape is an
 * attribute's value and is encoded as one: the attribute encoding ran while
 * it was shielded, and a bare `"` put back there closed the value early, so
 * `[x](\" onmouseover=…)` drew a live event handler and `[[a\"b]]` lost its
 * target on read-back.
 */
function restoreEscapes(html, escapes) {
  if (!escapes.length) return html;
  const asWritten = (piece) => piece.replace(ESC_TOKEN_RE, (_, i) => `\\${escapes[Number(i)]}`);
  const inAttribute = (tag) =>
    tag.replace(ESC_TOKEN_RE, (_, i) =>
      `\\${escapes[Number(i)]}`.replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
    );
  return html
    .replace(/<[^>]*>/g, inAttribute)
    .replace(LITERAL_ESCAPE_RE, asWritten)
    .replace(ESC_TOKEN_RE, (_, i) => escapeAtomHtml(escapes[Number(i)]));
}

/** `[text](destination)`, the destination as `LINK_DEST` reads it. */
const MD_LINK_RE = new RegExp(String.raw`\[([^\]]+)\]\((${LINK_DEST})\)`, "g");

/** A bare URL in prose: `http(s)://` and everything up to whitespace or `<`. */
const BARE_URL_RE = /https?:\/\/[^\s<]+/g;
/** Punctuation that more often closes the sentence than belongs to the address. */
const URL_TRAILING = ".,;:!?]'\"}>";

/**
 * The bare URL without the punctuation it ends in, GitHub's rule: a trailing
 * `)` goes only while it has no `(` in the URL to close, so
 * `(https://example.com)` links `https://example.com` and
 * `https://en.wikipedia.org/wiki/Mercury_(planet)` keeps its own paren, and
 * `<https://example.com>` links `https://example.com` and shows the brackets
 * as the text they are.
 */
export function trimBareUrl(url) {
  let end = url.length;
  let open = 0;
  let close = 0;
  for (const ch of url) {
    if (ch === "(") open++;
    else if (ch === ")") close++;
  }
  while (end > 0) {
    const ch = url[end - 1];
    if (ch === ")" && close > open) close--;
    else if (!URL_TRAILING.includes(ch)) break;
    end--;
  }
  return url.slice(0, end);
}

/** A run of escaped prose with each bare URL made the editor's own autolink. */
function autolinkProse(escaped) {
  if (!escaped.includes("://")) return escaped;
  const text = unescapeHtml(escaped);
  let out = "";
  let last = 0;
  for (const m of text.matchAll(BARE_URL_RE)) {
    const raw = trimBareUrl(m[0]);
    if (!/^https?:\/\/./.test(raw)) continue;
    const url = escapeHtml(raw);
    const attr = url.replace(/"/g, "&quot;");
    out += `${escapeHtml(text.slice(last, m.index))}<a href="${attr}" class="external-link bare-url" data-url="${attr}">${url}<span class="external-link-icon" contenteditable="false">\u2197</span></a>`;
    last = m.index + raw.length;
  }
  return out + escapeHtml(text.slice(last));
}

/** `md` with each code span replaced by a token, its element pushed onto `codes`. */
function shieldCodeSpans(md, codes) {
  const spans = findCodeSpans(md);
  if (!spans.length) return md;
  let out = "";
  let last = 0;
  for (const { start, end, source, text } of spans) {
    // A line break in the source is an entity: the soft-break pass (12) turns
    // every newline left in the HTML into a `<br>`, attributes included.
    const attr = escapeHtml(source)
      .replace(/"/g, "&quot;")
      .replace(/\r/g, "&#13;")
      .replace(/\n/g, "&#10;");
    codes.push({ source: attr, html: `<code data-md="${attr}">${escapeHtml(text)}</code>` });
    out += `${md.slice(last, start)}\x00CODE${codes.length - 1}\x00`;
    last = end;
  }
  return out + md.slice(last);
}

const CODE_TOKEN_RE = /\x00CODE(\d+)\x00/g;

/**
 * The shielded code spans put back: as their source inside a tag (a wikilink's
 * `data-target`: `[[a `b`]]` names "a `b`"), where an element would break the
 * attribute open; as their elements everywhere else.
 */
function restoreCodeSpans(html, codes) {
  if (!codes.length) return html;
  return html
    .replace(/<[^>]*>/g, (tag) => tag.replace(CODE_TOKEN_RE, (_, i) => codes[Number(i)].source))
    .replace(CODE_TOKEN_RE, (_, i) => codes[Number(i)].html);
}

/**
 * Convert inline markdown tokens to HTML for rendering.
 * Process order: shield code spans → escape HTML → shield escapes, link
 *                destinations, wikilink targets, star runs and maths → bold+italic → bold → italic →
 *                strikethrough → highlight → wikilinks → markdown links →
 *                bare URLs (in prose only, on the text as written) → tags
 */
export function inlineMarkdownToHtml(md, noteTitles) {
  if (!md) return "";
  let s = md;

  // 0. Code spans, before anything else reads the text: everything in one is
  // literal. Each is shielded whole and restored at the end as its element,
  // its text escaped there and its source on `data-md` for the read-back.
  const codes = [];
  s = shieldCodeSpans(s, codes);

  // 1. Escape HTML entities (prevent XSS / accidental tag injection)
  s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // 1b. Protect backslash-escaped punctuation (`ESCAPABLE_RE`; `<`, `>` and
  // `&` as the entities step 1 made them) from the formatting passes below. In prose each is restored as a sealed
  // element showing the symbol alone (`escapeAtomHtml`), which the walkers
  // read back with its backslash, so the file keeps it however the line is
  // edited. Where an escape means nothing (a code span) or the HTML is an
  // attribute or a link's target, it is put back as written.
  const escapes = [];
  s = s.replace(/\\(&(?:lt|gt|amp);|[!-/:-@[-`{-~])/g, (_, ch) => {
    escapes.push(ch);
    return `\x00ESC${escapes.length - 1}\x00`;
  });

  // 1c. A link's destination, its title included, is an address, never
  // formatted: `[x](https://a.com/*b*)` and `[x]([[Note]])` name what they
  // name. Shielded before the wikilink targets and every pass below until the
  // link pass restores it. Run through the passes, its markup reached the file
  // as HTML on the first edit (`[x](https://a.com/<em>b</em>)`).
  const dests = [];
  s = s.replace(MD_LINK_RE, (_, text, dest) => {
    dests.push(dest);
    return `[${text}](\x00DEST${dests.length - 1}\x00)`;
  });
  const realDest = (d) => d.replace(/\x00DEST(\d+)\x00/g, (_, n) => dests[Number(n)]);

  // 1d. A wikilink's target is a note's name, never formatted: `[[My *great*
  // note]]` names "My *great* note". Shielded from every pass below until the
  // wikilink pass restores it; an alias after `|` is formatted as prose. Run
  // through the passes, the target's markup reached the file as HTML on the
  // first edit (`[[My <em>great</em> note|…]]`).
  const targets = [];
  s = s.replace(/\[\[((?:[^\]|\x00]|\x00ESC\d+\x00)+)(?=\||\]\])/g, (_, target) => {
    targets.push(target);
    return `[[\x00WL${targets.length - 1}\x00`;
  });
  const realTarget = (t) => t.replace(/\x00WL(\d+)\x00/g, (_, n) => targets[Number(n)]);

  // 1e. A run of four stars or more is text, as CommonMark reads it: paired as
  // delimiters, `******` drew an empty bold italic and the first edit lost it.
  const runs = [];
  s = s.replace(/\*{4,}/g, (run) => {
    runs.push(run);
    return `\x00RUN${runs.length - 1}\x00`;
  });

  // 1f. Inline maths, before every formatting pass: `_` and `*` in a formula
  // are TeX, never emphasis. A code span and a bare URL are matched first and
  // left whole, so `` `$x$` `` stays code and a `$` in an address stays in it. The formula is restored as its element at the end,
  // its source as written (escapes put back).
  const maths = [];
  s = s.replace(CODE_OR_MATH_RE, (m, code, src) => {
    if (code !== undefined) return m;
    // Its source as written: escapes and any shielded target or destination put back.
    maths.push(
      realDest(realTarget(src)).replace(/\x00ESC(\d+)\x00/g, (_, i) => `\\${escapes[Number(i)]}`),
    );
    return `\x00MATH${maths.length - 1}\x00`;
  });

  // 3. Bold+Italic (***text***) — must come before bold and italic
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");

  // 4. Bold (**text**)
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // 5. Italic (*text*) — single asterisks, not part of bold ** markers
  s = s.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");

  // 6. Strikethrough (~~text~~)
  s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // 7. Highlight (==text==)
  s = s.replace(/==(.+?)==/g, "<mark>$1</mark>");

  // 8. Wikilinks [[Target]] or [[Target|Display]]. Broken means the *note* the
  // target names is not in the vault: `[[Beta#Intro]]` names Beta, and
  // `[[Work/Gamma]]` the Gamma in Work and no other (utils/wikilinkTarget, the
  // same reading the click resolves by; the set holds `folder/title` keys
  // too); `[[#Intro]]` names the note it sits in.
  const escAttr = (v) => v.replace(/"/g, "&quot;");
  const brokenClass = (target) => {
    if (!noteTitles) return "";
    const key = wikilinkKey(parseWikilinkTarget(target));
    return key && !noteTitles.has(key) ? " wikilink-broken" : "";
  };
  // An alias written out as the target itself (`[[Note|Note]]`) draws as the
  // short form and is marked `data-piped`, so the read-back keeps its pipe.
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_, shielded, display) => {
    const target = realTarget(shielded);
    const broken = brokenClass(target);
    const piped = display === target ? " data-piped" : "";
    return `<span class="wikilink${broken}" data-target="${escAttr(target)}"${piped}>${display}</span>`;
  });
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_, shielded) => {
    const target = realTarget(shielded);
    const broken = brokenClass(target);
    return `<span class="wikilink${broken}" data-target="${escAttr(target)}">${target}</span>`;
  });
  // A target whose link never closed is the text it was.
  s = realTarget(s);

  // 9. Markdown links [text](url) \u2014 escape the URL so a stray " can't break out
  // of the href/data-url attribute (attribute-injection guard; escAttr defined above).
  s = s.replace(MD_LINK_RE, (_, text, url) => {
    const safe = escAttr(realDest(url));
    return `<a href="${safe}" class="external-link" data-url="${safe}">${text}<span class="external-link-icon" contenteditable="false">\u2197</span></a>`;
  });

  // 10. Bare URLs, in prose only. The pass reads the text as written, never
  // the HTML the passes above have built: an entity is the character it
  // stands for (`&gt;` is `>`, which ends a URL; `&amp;` is `&`, which may end
  // one), and a URL inside a link's text, a code span or a wikilink is that
  // element's text, never a second link. Run over the escaped HTML, the regex
  // would link `https://example.com&gt` and grow a `;` on every edit.
  s = s.replace(PROSE_OR_ELEMENT_RE, (piece) =>
    piece.startsWith("<") ? piece : autolinkProse(piece),
  );

  // 11. Tags, in prose only, as the bare URLs: a `#` inside a link (its text or
  // its address: `https://x.y(#ta` drew a tag inside the link's own `href`),
  // a code span or a wikilink is that element's own text. A tag opens only
  // after a space, a `(` or the line's start (TAG_RE), so a prose piece that
  // follows an element opens none at its first character.
  s = s.replace(PROSE_OR_ELEMENT_RE, (piece, offset) =>
    piece.startsWith("<")
      ? piece
      : piece.replace(TAG_RE, (m, pre, tag, at) =>
          at === 0 && pre === "" && offset > 0
            ? m
            : `${pre}<span class="inline-tag" data-tag="${tag}">#${tag}</span>`,
        ),
  );

  // A destination whose link the passes above took apart is the text it was.
  s = realDest(s);

  // Restore the formulas, then the runs of stars, then backslash-escaped characters, backslash included
  s = s.replace(/\x00MATH(\d+)\x00/g, (_, i) => mathAtomHtml(maths[Number(i)]));
  s = s.replace(/\x00RUN(\d+)\x00/g, (_, i) => runs[parseInt(i, 10)]);
  s = restoreEscapes(s, escapes);
  s = restoreCodeSpans(s, codes);

  // 12. A newline inside block text is a soft break: one line break on screen.
  // A trailing newline gets a second <br>, the way Chromium keeps an empty
  // last line visible and reachable by the caret; the DOM→Markdown walkers
  // ignore a block's final <br>, so "a<br><br>" reads back as "a\n", inside
  // a closing element too (`` `x\n` ``).
  s = s.replace(/\n/g, "<br>");
  if (/<br>(?:<\/[a-z]+>)*$/.test(s)) s += "<br>";
  // An escape at the very end leaves Chromium no caret position after it in
  // the line: End went past it into the next block, and the letters typed
  // after it landed there. The trailing <br> is one, and the walkers ignore
  // it as they ignore the one above. Not after a formula: End then landed in
  // KaTeX's drawing, where the letters were lost; its own nesting already
  // gives the caret a place.
  else if (ESCAPE_AT_END_RE.test(s)) s += "<br>";

  return s;
}

/**
 * Convert serialised HTML back to inline markdown. The one walker below
 * reads a parsed string (the copy, Enter-split and paste paths) and the live
 * block element (`domNodeToMarkdown`, every keystroke) alike; two walkers
 * once read the same DOM differently.
 */
export function htmlToInlineMarkdown(html) {
  if (!html) return "";

  // Fast path: no HTML tags or entities at all
  if (!/[<&]/.test(html)) return html;

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return walkNode(doc.body);
}

/**
 * Convert a live DOM element's childNodes directly to inline markdown, with
 * no DOMParser and no innerHTML serialisation. Use this on the hot path
 * (every keystroke) where `el` is already in the document.
 */
export function domNodeToMarkdown(element) {
  if (!element) return "";
  return walkNode(element);
}

/**
 * Text read back from the editor, with the non-breaking spaces Chromium typed
 * made the spaces they were. Chromium holds a space typed at a line's edge,
 * doubled, or after a link as U+00A0 so it shows, and the read-back is
 * verbatim, so the file got the byte (`hello `, and Obsidian kept it). A
 * U+00A0 the file itself holds reads back the same, so the block's saved text
 * decides: one that held none gets plain spaces; one that held any is left as
 * read, the file's own bytes kept over the typed ones.
 */
export function settleTypedSpaces(read, saved) {
  if (!read.includes(" ") || (saved || "").includes(" ")) return read;
  return read.replace(/ /g, " ");
}

// The caret anchor placeCaret parks the caret on after a link
// (domHelpers CARET_ANCHOR): a `<span class="caret-anchor">` around one
// zero-width space. The element is what marks the space as scaffolding; a
// U+200B anywhere else is the note's own byte and is read back as written.
const CARET_ANCHOR_RE = /\u200B/g;

/**
 * The DOM → Markdown walk. Text is read verbatim. A formatting element wraps
 * whatever it holds, a space included (`<em> </em>` is `* *`, the bytes the
 * renderer made it from); only one holding nothing at all, the residue of
 * toggling a format off, is dropped. A link is the bare URL only when it is
 * the editor's own autolink (`bare-url`) and its text still is its URL, so
 * an explicit `[url](url)` from the file stays one. The ↗ icon is its own
 * `contenteditable="false"` span and is skipped as that; a ↗ in a link's
 * text is text.
 */
function walkNode(node) {
  let result = "";
  for (const child of node.childNodes) result += nodeToMarkdown(child, result);
  return result;
}

/**
 * The Markdown one child node adds to the walk, given `before`, the Markdown
 * of its preceding siblings (a `<div>` line only needs a newline when the
 * text so far does not end in one). Exported so the typed-formatting paint
 * can find an element by the same reading the walker gives it.
 */
export function nodeToMarkdown(child, before = "") {
  if (child.nodeType === Node.TEXT_NODE) return child.textContent;
  if (child.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = child.nodeName;
  const inner = walkNode(child);

  if (tag === "STRONG" || tag === "B") return inner ? `**${inner}**` : "";
  if (tag === "EM" || tag === "I") return inner ? `*${inner}*` : "";
  // A code span is literal: its text, in the spelling the file gave it.
  if (tag === "CODE") return codeElementMarkdown(child);
  if (tag === "DEL" || tag === "S") return inner ? `~~${inner}~~` : "";
  if (tag === "MARK") return inner ? `==${inner}==` : "";
  if (tag === "A") {
    const href = child.getAttribute("href") || "";
    if (child.classList.contains("bare-url") && inner === href) return inner;
    return `[${inner}](${href})`;
  }
  if (tag === "SPAN") {
    // A formula is its source, whatever KaTeX drew inside it.
    if (child.classList.contains(INLINE_MATH_CLASS))
      return `$${child.getAttribute("data-math") ?? ""}$`;
    // An escape is its symbol with the backslash the screen leaves out.
    if (child.classList.contains(ESCAPE_CLASS)) {
      const ch = child.textContent?.[0];
      return ch ? `\\${ch}` : "";
    }
    // External link icon — decorative, skip
    if (child.classList.contains("external-link-icon")) return "";
    if (child.classList.contains(CARET_ANCHOR_CLASS)) {
      // The anchor's zero-width space is scaffolding; text typed on it is prose.
      return inner.replace(CARET_ANCHOR_RE, "");
    }
    if (child.classList.contains("wikilink")) {
      const target = child.getAttribute("data-target") || inner;
      return target === inner && !child.hasAttribute("data-piped")
        ? `[[${inner}]]`
        : `[[${target}|${inner}]]`;
    }
    // Tag spans and anything else: the text, which for a tag already has its #.
    return inner;
  }
  if (tag === "BR") {
    // Ignore <br> at end of block (browser artifact): the last child of the
    // block, or of inline elements nothing in the block follows. One closing
    // a code span mid-line is the text's newline: dropped, a fence written in
    // a quote (`> ```\n> code\n> ````) lost the line before its close.
    return followedInLine(child) ? "\n" : "";
  }
  if (tag === "DIV") {
    // Browser sometimes wraps lines in <div>; treat as line break
    if (!inner) return "";
    return before && !before.endsWith("\n") ? `\n${inner}` : inner;
  }
  // Unknown element — recurse children, strip the tag
  return inner;
}

/** The inline elements a block's text is made of; a `<br>` in them may still end the block. */
const INLINE_TAGS = new Set(["STRONG", "B", "EM", "I", "CODE", "DEL", "S", "MARK", "A", "SPAN"]);

/** Whether anything in the block comes after `node`: a later sibling of it or of an inline element holding it. */
function followedInLine(node) {
  for (let n = node; n; n = n.parentNode) {
    if (n.nextSibling) return true;
    if (!INLINE_TAGS.has(n.parentNode?.nodeName)) return false;
  }
  return false;
}

const ALLOWED_TAGS = new Set([
  "STRONG",
  "EM",
  "CODE",
  "A",
  "B",
  "I",
  "BR",
  "DEL",
  "S",
  "MARK",
  "SPAN",
]);

const BLOCK_TAGS = new Set(["DIV", "P", "LI", "H1", "H2", "H3", "H4", "H5", "H6"]);

/**
 * Sanitize HTML: strip all tags except formatting tags.
 * Normalizes <b> → <strong>, <i> → <em>.
 * Strips empty formatting tags.
 * Block elements (a rich paste's paragraphs) are unwrapped to a line break
 * between them; the result is always inline content, never a wrapper element
 * (a returned `<div>` once landed inside `<strong>` and split the line).
 */
export function sanitizeInlineHtml(html) {
  if (!html) return "";
  const container = document.createElement("div");
  container.appendChild(sanitizeInlineFragment(html));
  return container.innerHTML;
}

/**
 * `sanitizeInlineHtml` as nodes, for inserting into the live DOM. The paste
 * handler inserts this itself rather than through `execCommand("insertHTML")`,
 * which rewrote the space beside the insertion into a non-breaking space
 * that reached the file as U+00A0.
 */
export function sanitizeInlineFragment(html) {
  const frag = document.createDocumentFragment();
  if (!html) return frag;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  sanitizeInto(frag, doc.body, false);
  return frag;
}

/**
 * Append the sanitised children of `sourceNode` to `target`. Inside a caret
 * anchor (`inAnchor`) the zero-width space is scaffolding and is dropped, so a
 * copy or an Enter-split never carries it into Markdown.
 */
function sanitizeInto(target, sourceNode, inAnchor) {
  for (const child of sourceNode.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = inAnchor ? child.textContent.replace(CARET_ANCHOR_RE, "") : child.textContent;
      if (text) target.appendChild(document.createTextNode(text));
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.nodeName;

      if (tag === "BR") {
        target.appendChild(document.createElement("br"));
      } else if (tag === "SPAN" && child.classList.contains(CARET_ANCHOR_CLASS)) {
        sanitizeInto(target, child, true);
      } else if (tag === "SPAN" && child.classList.contains(INLINE_MATH_CLASS)) {
        // A formula keeps its source and nothing KaTeX drew; it is drawn again where it lands.
        const source = child.getAttribute("data-math") ?? "";
        const el = document.createElement("span");
        el.className = INLINE_MATH_CLASS;
        el.setAttribute("contenteditable", "false");
        el.setAttribute("data-math", source);
        el.textContent = `$${source}$`;
        target.appendChild(el);
      } else if (tag === "SPAN" && child.classList.contains(ESCAPE_CLASS)) {
        // An escape stays sealed, so the Markdown read from the copy keeps its backslash.
        const ch = child.textContent?.[0];
        if (!ch) continue;
        const el = document.createElement("span");
        el.className = ESCAPE_CLASS;
        el.setAttribute("contenteditable", "false");
        el.textContent = ch;
        target.appendChild(el);
      } else if (ALLOWED_TAGS.has(tag)) {
        // Normalize <b> → <strong>, <i> → <em>, <s> → <del>
        let newTag = tag;
        if (tag === "B") newTag = "STRONG";
        if (tag === "I") newTag = "EM";
        if (tag === "S") newTag = "DEL";

        const el = document.createElement(newTag);

        // Copy href, class, data-url for links
        if (tag === "A" && child.getAttribute("href")) {
          el.setAttribute("href", child.getAttribute("href"));
          const cls = child.getAttribute("class");
          if (cls) el.setAttribute("class", cls);
          const dataUrl = child.getAttribute("data-url");
          if (dataUrl) el.setAttribute("data-url", dataUrl);
        }

        // A code span's source, so a split or a copy keeps its spelling; it is
        // read back only while it is one span showing the element's text.
        if (tag === "CODE" && child.hasAttribute("data-md")) {
          el.setAttribute("data-md", child.getAttribute("data-md"));
        }

        // Copy class + data attrs for SPAN (wikilinks, tags, link icons)
        if (tag === "SPAN") {
          const cls = child.getAttribute("class") || "";
          if (cls === "wikilink" || cls.startsWith("wikilink") || cls === "inline-tag") {
            el.setAttribute("class", cls);
            if (cls.startsWith("wikilink")) {
              const target = child.getAttribute("data-target");
              if (target) el.setAttribute("data-target", target);
              if (child.hasAttribute("data-piped")) el.setAttribute("data-piped", "");
            }
          } else if (cls === "external-link-icon") {
            el.setAttribute("class", cls);
            el.setAttribute("contenteditable", "false");
          }
        }

        sanitizeInto(el, child, inAnchor);

        // An empty formatting tag (leftover from toggling off) is nothing;
        // one holding only a space wraps that space, as the walker writes it
        // (`<em> </em>` is the file's own `* *` on the Enter-split and copy paths).
        if (el.textContent === "") continue;
        target.appendChild(el);
      } else if (BLOCK_TAGS.has(tag)) {
        // Unwrap block elements, but preserve separation as line breaks
        const inner = document.createDocumentFragment();
        sanitizeInto(inner, child, inAnchor);
        if (inner.textContent.trim()) {
          if (target.childNodes.length > 0 && target.lastChild?.nodeName !== "BR") {
            target.appendChild(document.createElement("br"));
          }
          target.appendChild(inner);
        }
      } else {
        // Unknown tag: recurse children only (strip the tag)
        sanitizeInto(target, child, inAnchor);
      }
    }
  }
}

/**
 * Strip all markdown formatting tokens, returning plain text.
 * Used for accurate word count.
 */
export function stripMarkdownFormatting(md) {
  if (!md) return "";
  // An escaped symbol is shown alone, and is never a marker for the passes below.
  const escapes = [];
  // A code span is its text, literal: no pass below reads inside it.
  const spans = findCodeSpans(md);
  const codes = spans.map((span) => span.text);
  let s = md;
  for (let i = spans.length - 1; i >= 0; i--) {
    s = `${s.slice(0, spans[i].start)}\x00CODE${i}\x00${s.slice(spans[i].end)}`;
  }
  s = s.replace(/\\([!-/:-@[-`{-~])/g, (_, ch) => {
    escapes.push(ch);
    return `\x00ESC${escapes.length - 1}\x00`;
  });
  // Remove wikilinks: [[target|display]] → display, [[target]] → target
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  s = s.replace(/\[\[([^\]]+)\]\]/g, "$1");
  // Remove markdown links: [text](url) → text
  s = s.replace(MD_LINK_RE, "$1");
  // Remove bold+italic (***text*** → text)
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, "$1");
  // Remove bold (**text** → text)
  s = s.replace(/\*\*(.+?)\*\*/g, "$1");
  // Remove italic (*text* → text)
  s = s.replace(/\*(.+?)\*/g, "$1");
  // Remove strikethrough (~~text~~ → text)
  s = s.replace(/~~(.+?)~~/g, "$1");
  // Remove highlight (==text== → text)
  s = s.replace(/==(.+?)==/g, "$1");
  return s
    .replace(ESC_TOKEN_RE, (_, i) => escapes[Number(i)])
    .replace(CODE_TOKEN_RE, (_, i) => codes[Number(i)]);
}
