import { isMap, isScalar, isSeq, type Node, parseDocument, type Scalar } from "yaml";

/**
 * A note's properties: the YAML in its frontmatter block, read with the `yaml`
 * library and never written by it. YAML that does not read cleanly (a parse
 * error, a duplicate key, a root that is not a map, a key that is not a plain
 * name) has no properties; the section shows it as YAML.
 */

/** What a value is, read from how it is written. */
export type PropType = "text" | "list" | "number" | "checkbox" | "date" | "datetime";
/** Keys whose meaning is fixed by their name, whatever the value. */
export type FixedKey = "tags" | "aliases" | "cssclasses";
export const FIXED_KEYS: readonly FixedKey[] = ["tags", "aliases", "cssclasses"];

export interface Property {
  key: string;
  /** Read from the value; null when the value is empty. */
  type: PropType | null;
  fixed?: FixedKey;
  /**
   * The rows can change it: a one-line plain or quoted value, or a list of
   * them. Multi-line text, a map, anchors and aliases, explicit tags (`!!str`),
   * a merge key or a comment inside a list are shown, and changed only as YAML.
   */
  editable: boolean;
  /** What the row shows: the value as written (unquoted), true/false, the items, or null. */
  shown: string | boolean | string[] | null;
  /** The property's own lines in the text, [start, end): its key line to the next key's. */
  start: number;
  end: number;
}

export type ReadResult = { ok: true; props: Property[] } | { ok: false; reason: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

const lineStart = (text: string, at: number) => text.lastIndexOf("\n", at - 1) + 1;

/** One scalar's type, by how it is written: quotes make text; YAML's own reading decides the rest. */
function scalarType(node: Scalar): PropType | null {
  if (node.value === null) return null;
  if (node.type === "QUOTE_DOUBLE" || node.type === "QUOTE_SINGLE") return "text";
  if (typeof node.value === "boolean") return "checkbox";
  if (typeof node.value === "number") return "number";
  const s = String(node.value);
  if (DATE_RE.test(s)) return "date";
  if (DATETIME_RE.test(s)) return "datetime";
  return "text";
}

/** A scalar the rows can rewrite: one line, plain or quoted, no anchor or explicit tag. */
function plainScalar(node: Scalar, text: string): boolean {
  const [from, to] = node.range ?? [0, 0];
  return (
    (node.type === "PLAIN" || node.type === "QUOTE_DOUBLE" || node.type === "QUOTE_SINGLE") &&
    !node.anchor &&
    !node.tag &&
    !text.slice(from, to).includes("\n")
  );
}

/**
 * A value the rows cannot change, as one muted line: as written from after its
 * key's colon (so an anchor or a `!!tag` shows), lines trimmed.
 */
function sourceLine(node: Node, text: string, after: number): string {
  const to = node.range?.[1] ?? after;
  const from = text.indexOf(":", after) + 1;
  return text
    .slice(from, to)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(", ");
}

const cache = new Map<string, ReadResult>();

/** The properties in a frontmatter block's text, in order. Cached by text. */
export function readProperties(text: string): ReadResult {
  const hit = cache.get(text);
  if (hit) return hit;
  const result = read(text);
  if (cache.size > 64) cache.delete(cache.keys().next().value as string);
  cache.set(text, result);
  return result;
}

function read(text: string): ReadResult {
  const doc = parseDocument(text);
  if (doc.errors.length) return { ok: false, reason: doc.errors[0].message.split("\n")[0] };
  if (doc.contents === null) return { ok: true, props: [] };
  if (!isMap(doc.contents))
    return { ok: false, reason: "The properties aren't a list of names and values." };
  const pairs = doc.contents.items;
  const props: Property[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const { key, value } = pairs[i];
    if (
      !isScalar(key) ||
      typeof key.value !== "string" ||
      key.type !== "PLAIN" ||
      key.value === "<<"
    ) {
      return { ok: false, reason: "A property's name isn't a plain name." };
    }
    const name = key.value;
    const start = lineStart(text, key.range?.[0] ?? 0);
    // The next key's line, less the comments and blank lines above it: they are its.
    let end =
      i + 1 < pairs.length
        ? lineStart(text, (pairs[i + 1].key as Node).range?.[0] ?? 0)
        : text.length;
    while (end > start) {
      const prev = lineStart(text, end - 1);
      const line = text.slice(prev, end).replace(/\n$/, "");
      if (prev <= start || !(line.trim() === "" || line.startsWith("#"))) break;
      end = prev;
    }
    const fixed = (FIXED_KEYS as readonly string[]).includes(name) ? (name as FixedKey) : undefined;
    const base = { key: name, fixed, start, end };
    const keyEnd = key.range?.[1] ?? start;
    if (value === null || (isScalar(value) && value.value === null && plainScalar(value, text))) {
      props.push({ ...base, type: null, editable: true, shown: null });
    } else if (isScalar(value)) {
      const type = scalarType(value);
      const editable = plainScalar(value, text);
      const multiline = !value.anchor && !value.tag && typeof value.value === "string";
      const shown =
        type === "checkbox"
          ? Boolean(value.value)
          : editable
            ? sourceOf(value, text)
            : multiline
              ? (value.value as string).trim().replace(/\s*\n\s*/g, " ")
              : sourceLine(value, text, keyEnd);
      props.push({ ...base, type: editable ? type : "text", editable, shown });
    } else if (isSeq(value)) {
      const scalars = value.items.every(
        (item) => isScalar(item) && plainScalar(item, text) && !item.commentBefore && !item.comment,
      );
      const editable = scalars && !value.anchor && !value.tag && !value.comment;
      const shown = editable
        ? value.items.map((item) => sourceOf(item as Scalar, text))
        : sourceLine(value, text, keyEnd);
      props.push({ ...base, type: editable ? "list" : null, editable, shown });
    } else {
      // A map, an alias, anything else: shown as written, changed only as YAML.
      const node = value as Node;
      props.push({ ...base, type: null, editable: false, shown: sourceLine(node, text, keyEnd) });
    }
  }
  return { ok: true, props };
}

/** A one-line scalar as the row shows it: its text unquoted, a number or date exactly as written. */
function sourceOf(node: Scalar, text: string): string {
  if (node.type === "QUOTE_DOUBLE" || node.type === "QUOTE_SINGLE") return String(node.value);
  const [from, to] = node.range ?? [0, 0];
  return text.slice(from, to);
}

/**
 * One top-level property's value as plain data: a scalar's value, a list's
 * scalar items (`undefined` for anything else in it), or `undefined` when the
 * key is absent, its value is a map, or the YAML does not read.
 */
export function propertyValue(text: string, key: string): unknown {
  if (!text?.includes(key)) return undefined;
  const doc = parseDocument(text);
  if (doc.errors.length || !isMap(doc.contents)) return undefined;
  const node: unknown = doc.contents.get(key, true);
  if (isScalar(node)) return node.value;
  if (isSeq(node)) return node.items.map((item) => (isScalar(item) ? item.value : undefined));
  return undefined;
}

/**
 * A date or date and time as the row shows it, in the app's own English
 * (1 Dec 2026, 20:30), never the file's YYYY-MM-DD, which stays as written.
 * Anything else is shown as it is.
 */
export function shownDate(value: string, locale = "en-GB"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (!m) return value;
  const [, y, mo, d, h, mi] = m;
  const date = new Date(+y, +mo - 1, +d, h ? +h : 0, mi ? +mi : 0);
  if (Number.isNaN(date.getTime()) || date.getMonth() !== +mo - 1) return value;
  const day = date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  return h ? `${day}, ${h}:${mi}` : day;
}
