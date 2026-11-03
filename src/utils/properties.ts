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
  /** Where its name is written, and the colon after it. */
  keyRange: [number, number];
  colon: number;
  /** Where its value is written; empty, the point just after the colon. */
  valueRange: [number, number];
  /** The quote a text value is written in, kept when it is rewritten. */
  quote?: '"' | "'";
  /** An editable list: `[a, b]` (flow) or `- a` lines, each item's source span and line prefix. */
  list?: { flow: boolean; items: Array<{ from: number; to: number }>; prefix: string };
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
  // Parsed is not enough: an alias whose anchor is gone (`*x` with no `&x`)
  // parses, but does not resolve, so no reader can take it.
  try {
    doc.toJS();
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message.split("\n")[0] : "The YAML doesn't resolve.",
    };
  }
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
    const keyEnd = key.range?.[1] ?? start;
    const colon = text.indexOf(":", keyEnd);
    const node = value as Node | null;
    const [vFrom, vTo] = node?.range ?? [colon + 1, colon + 1];
    const base = {
      key: name,
      fixed,
      start,
      end,
      keyRange: [key.range?.[0] ?? start, keyEnd] as [number, number],
      colon,
      valueRange: (vTo > vFrom ? [vFrom, vTo] : [colon + 1, colon + 1]) as [number, number],
    };
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
      const quote =
        value.type === "QUOTE_DOUBLE" ? '"' : value.type === "QUOTE_SINGLE" ? "'" : undefined;
      props.push({ ...base, type: editable ? type : "text", editable, shown, quote });
    } else if (isSeq(value)) {
      const scalars = value.items.every(
        (item) => isScalar(item) && plainScalar(item, text) && !item.commentBefore && !item.comment,
      );
      const editable = scalars && !value.anchor && !value.tag && !value.comment;
      const shown = editable
        ? value.items.map((item) => sourceOf(item as Scalar, text))
        : sourceLine(value, text, keyEnd);
      const items = value.items.map((item) => {
        const [from, to] = (item as Node).range ?? [0, 0];
        return { from, to };
      });
      const first = items[0];
      const list = {
        flow: !!value.flow,
        items,
        prefix: !value.flow && first ? text.slice(lineStart(text, first.from), first.from) : "  - ",
      };
      const valueRange: [number, number] =
        value.flow || !items.length ? base.valueRange : [colon + 1, items[items.length - 1].to];
      props.push({
        ...base,
        valueRange,
        type: editable ? "list" : null,
        editable,
        shown,
        list: editable ? list : undefined,
      });
    } else {
      // A map, an alias, anything else: shown as written, changed only as YAML.
      props.push({
        ...base,
        type: null,
        editable: false,
        shown: sourceLine(value as Node, text, keyEnd),
      });
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

// ---------------------------------------------------------------------------
// Changing properties. Never through the library's own writer, which would
// reformat the whole block: each change splices one property's own text, and
// is read back before it may stand (`runChange`).

const NUMBER_RE = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;
/** Words YAML 1.1 (Obsidian's reader) takes for true, false or nothing: never written bare as text. */
const YAML11_WORD_RE = /^(y|n|yes|no|on|off|true|false|null|~)$/i;

/** True when `s` is a number as YAML reads one. */
export const isNumber = (s: string) => NUMBER_RE.test(s.trim());

/** `s` written bare reads back as exactly `s`, as text, in YAML and in Obsidian. */
function plainSafe(s: string, inFlow: boolean): boolean {
  if (!s || s !== s.trim() || YAML11_WORD_RE.test(s)) return false;
  if (inFlow && /[,[\]{}]/.test(s)) return false;
  if (DATE_RE.test(s) || DATETIME_RE.test(s)) return false;
  const doc = parseDocument(`k: ${s}`);
  if (doc.errors.length || !isMap(doc.contents) || doc.contents.items.length !== 1) return false;
  const v = doc.contents.items[0].value;
  return isScalar(v) && v.type === "PLAIN" && v.value === s && !v.comment;
}

/** Text as YAML writes it: bare when that reads back the same, else in its quotes. */
export function yamlText(s: string, quote?: '"' | "'", inFlow = false): string {
  if (!quote && plainSafe(s, inFlow)) return s;
  if (quote === "'") return `'${s.replace(/'/g, "''")}'`;
  return JSON.stringify(s);
}

/** A property's value, rewritten: `out` empty clears it, a leading newline is a block list. */
function writeValue(text: string, p: Property, out: string): string {
  const fromColon =
    out === "" || out.startsWith("\n") || p.type === null || (p.list && !p.list.flow);
  const from = fromColon ? p.colon + 1 : p.valueRange[0];
  const lead = fromColon && out !== "" && !out.startsWith("\n") ? " " : "";
  return text.slice(0, from) + lead + out + text.slice(p.valueRange[1]);
}

/** A list's value as written: untouched items keep their spelling; empty is `[]`. */
function listOut(text: string, p: Property, items: string[]): string {
  if (!items.length) return "[]";
  // An item already in the list keeps its own spelling, once.
  const kept = (p.list?.items ?? []).map((it) => ({
    src: text.slice(it.from, it.to),
    used: false,
  }));
  const shown = Array.isArray(p.shown) ? p.shown : [];
  const spell = (v: string, inFlow: boolean) => {
    const i = shown.findIndex((s, j) => s === v && !kept[j]?.used);
    if (i >= 0 && kept[i]) {
      kept[i].used = true;
      return kept[i].src;
    }
    return yamlText(v, undefined, inFlow);
  };
  if (p.list?.flow) return `[${items.map((v) => spell(v, true)).join(", ")}]`;
  const prefix = p.list?.prefix ?? "  - ";
  return items.map((v) => `\n${prefix}${spell(v, false)}`).join("");
}

/** One change to a frontmatter block: what it does, and what the property must read as after it. */
export interface Change {
  key: string;
  /** A new property: there is none by this name yet, and `apply` is given none. */
  adds?: true;
  /** The property's name after the change (a rename). */
  newKey?: string;
  apply: (text: string, p: Property) => string | null;
  /** For a change that adds: the text with the new property in it. */
  add?: (text: string) => string | null;
  /** The changed property as it must read back; absent for Remove. */
  expect?: (p: Property) => boolean;
}

/**
 * A change run on the latest text: the new text, null when there is nothing
 * to do (the property is gone, or not one the rows can change), or false when
 * the result would not be safe to write. Safe is: it still reads as
 * properties, the changed one reads as intended, every other property reads
 * as it did, and every byte outside the property's own lines is unchanged.
 */
export function runChange(text: string, change: Change): string | null | false {
  const before = readProperties(text);
  if (!before.ok) return null;
  if (change.adds) return runAdd(text, before.props, change);
  const p = before.props.find((q) => q.key === change.key);
  if (!p) return null;
  const after = change.apply(text, p);
  if (after === null || after === text) return null;
  const read = readProperties(after);
  if (!read.ok) return false;
  const head = text.slice(0, lastWithoutNewline(text, p) ? p.start - 1 : p.start);
  if (!after.startsWith(head) || !after.endsWith(text.slice(p.end))) return false;
  const others = (props: Property[], skip: string) =>
    JSON.stringify(props.filter((q) => q.key !== skip).map((q) => [q.key, q.type, q.shown]));
  const newKey = change.newKey ?? change.key;
  if (others(before.props, change.key) !== others(read.props, newKey)) return false;
  const changed = read.props.find((q) => q.key === newKey);
  if (change.expect ? !changed || !change.expect(changed) : changed) return false;
  return after;
}

/** `runChange` for a new property: everything before it stays, byte for byte. */
function runAdd(text: string, props: Property[], change: Change): string | null | false {
  if (props.some((q) => q.key.toLowerCase() === change.key.toLowerCase())) return null;
  const after = change.add?.(text) ?? null;
  if (after === null) return null;
  const read = readProperties(after);
  if (!read.ok || !after.startsWith(text)) return false;
  const shape = (ps: Property[]) => JSON.stringify(ps.map((q) => [q.key, q.type, q.shown]));
  if (shape(read.props.filter((q) => q.key !== change.key)) !== shape(props)) return false;
  const added = read.props.find((q) => q.key === change.key);
  return added && (!change.expect || change.expect(added)) ? after : false;
}

/**
 * A new property, last, in its type's empty form: an unticked box, an empty
 * list, else nothing after the colon (the type is this device's to remember).
 */
export const addProperty = (key: string, type: PropType | null): Change => ({
  key: key.trim(),
  adds: true,
  apply: () => null,
  add: (text) => {
    if (nameProblem(text, "", key)) return null;
    const value = type === "checkbox" ? " false" : type === "list" ? " []" : "";
    const line = `${key.trim()}:${value}`;
    if (text === "") return line;
    return `${text}${text.endsWith("\n") ? "" : "\n"}${line}`;
  },
  expect: (p) =>
    type === "checkbox"
      ? p.shown === false
      : type === "list"
        ? p.type === "list"
        : p.shown === null,
});

const sameItems = (a: unknown, b: string[]) =>
  Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);

/** The property's text value. */
export const setText = (key: string, s: string): Change => ({
  key,
  apply: (text, p) =>
    p.editable ? writeValue(text, p, s === "" ? "" : yamlText(s, p.quote)) : null,
  expect: (p) => (s === "" ? p.shown === null : p.type === "text" && p.shown === s),
});

/** A value of another type, written as it reads: a number, a date, a date and time. */
export const setTyped = (key: string, type: "number" | "date" | "datetime", s: string): Change => ({
  key,
  apply: (text, p) => (p.editable ? writeValue(text, p, s) : null),
  expect: (p) => (s === "" ? p.shown === null : p.type === type && p.shown === s),
});

/** A value whose type the writing doesn't decide: it is what it reads as. */
export const setUntyped = (key: string, s: string): Change => ({
  key,
  apply: (text, p) =>
    p.editable
      ? writeValue(text, p, s === "" ? "" : plainSafe(s, false) || isNumber(s) ? s : yamlText(s))
      : null,
  expect: (p) => (s === "" ? p.shown === null : p.shown === s),
});

export const setCheckbox = (key: string, on: boolean): Change => ({
  key,
  apply: (text, p) => (p.editable ? writeValue(text, p, String(on)) : null),
  expect: (p) => p.type === "checkbox" && p.shown === on,
});

/** The list's items: untouched ones keep their spelling, flow stays flow, block stays block. */
export const setList = (key: string, items: string[]): Change => ({
  key,
  apply: (text, p) => (p.editable ? writeValue(text, p, listOut(text, p, items)) : null),
  expect: (p) => p.type === "list" && sameItems(p.shown, items),
});

/*
 * One item of a list, changed by splicing its own bytes: every other item, the
 * separators between them, blank lines, a flow list's spacing and line breaks
 * stay exactly as written. Each names the item by its place and the text it
 * held, so a change made on a list that has changed since is refused.
 */

/** The item at `i` as the change saw it, in a list the rows can change; else null. */
function listItem(p: Property, i: number, was: string) {
  if (!p.editable || !p.list || !Array.isArray(p.shown) || p.shown[i] !== was) return null;
  return { list: p.list, items: p.shown, at: p.list.items[i] };
}

/** Item `i`, which read `was`, now reads `v`, in the quote its old spelling used, if any. */
export const replaceItem = (key: string, i: number, was: string, v: string): Change => {
  let after: string[] = [];
  return {
    key,
    apply: (text, p) => {
      const it = listItem(p, i, was);
      if (!it) return null;
      after = it.items.map((s, j) => (j === i ? v : s));
      const q = text[it.at.from];
      const spelled = yamlText(v, q === '"' || q === "'" ? q : undefined, it.list.flow);
      return text.slice(0, it.at.from) + spelled + text.slice(it.at.to);
    },
    expect: (p) => p.type === "list" && sameItems(p.shown, after),
  };
};

/** Item `i`, which read `was`, goes: with its separator in a flow list, its own line in a block one. */
export const removeItem = (key: string, i: number, was: string): Change => {
  let after: string[] = [];
  return {
    key,
    apply: (text, p) => {
      const it = listItem(p, i, was);
      if (!it) return null;
      after = it.items.filter((_, j) => j !== i);
      const ranges = it.list.items;
      // A list's only item leaves `[]`: a key with nothing after it would read as empty, not a list.
      if (ranges.length === 1) return writeValue(text, p, "[]");
      if (it.list.flow) {
        const [from, to] =
          i < ranges.length - 1 ? [it.at.from, ranges[i + 1].from] : [ranges[i - 1].to, it.at.to];
        return text.slice(0, from) + text.slice(to);
      }
      // The item's own line, newline and all.
      const from = lineStart(text, it.at.from);
      const nl = text.indexOf("\n", it.at.to);
      if (nl >= 0) return text.slice(0, from) + text.slice(nl + 1);
      // The text's last line: the newline before it goes instead.
      return text.slice(0, from - 1) + text.slice(it.at.to);
    },
    expect: (p) => p.type === "list" && sameItems(p.shown, after),
  };
};

/**
 * A new item at place `at` (the end when `at` is the length or more), written
 * as the list writes its own: after the separator its neighbours share in a
 * flow list (`, ` when it has one item), on a line with its neighbour's prefix
 * in a block one.
 */
export const insertItem = (key: string, at: number, v: string): Change => {
  let after: string[] = [];
  return {
    key,
    apply: (text, p) => {
      if (!p.editable || (p.type !== "list" && p.type !== null)) return null;
      const items = Array.isArray(p.shown) ? p.shown : [];
      const ranges = p.list?.items ?? [];
      const i = Math.min(Math.max(at, 0), ranges.length);
      after = [...items.slice(0, i), v, ...items.slice(i)];
      if (!p.list || !ranges.length) {
        if (p.list?.flow) {
          // `[]` or `[ ]`: just inside the bracket.
          const open = text.indexOf("[", p.valueRange[0]) + 1;
          return text.slice(0, open) + yamlText(v, undefined, true) + text.slice(open);
        }
        return writeValue(text, p, listOut(text, p, after));
      }
      const n = ranges.length;
      if (p.list.flow) {
        const spelled = yamlText(v, undefined, true);
        // The separator beside the new item: its left neighbours', else the first pair's.
        const pair = i > 0 && i < n ? i - 1 : i === n ? n - 2 : 0;
        const sep = n > 1 ? text.slice(ranges[pair].to, ranges[pair + 1].from) : ", ";
        if (i === n)
          return text.slice(0, ranges[n - 1].to) + sep + spelled + text.slice(ranges[n - 1].to);
        return text.slice(0, ranges[i].from) + spelled + sep + text.slice(ranges[i].from);
      }
      const spelled = yamlText(v, undefined, false);
      // Right under the item before it (a blank line after that one stays after the new one).
      if (i > 0) {
        const prev = ranges[i - 1];
        const prefix = text.slice(lineStart(text, prev.from), prev.from);
        return `${text.slice(0, prev.to)}\n${prefix}${spelled}${text.slice(prev.to)}`;
      }
      const ls = lineStart(text, ranges[0].from);
      const prefix = text.slice(ls, ranges[0].from);
      return `${text.slice(0, ls)}${prefix}${spelled}\n${text.slice(ls)}`;
    },
    expect: (p) => p.type === "list" && sameItems(p.shown, after),
  };
};

/** A new last item. */
export const appendItem = (key: string, v: string): Change => insertItem(key, Infinity, v);

/** Removing the last property, when no newline ends the text, takes the newline before it too. */
const lastWithoutNewline = (text: string, p: Property) =>
  p.end === text.length && p.start > 0 && !text.endsWith("\n");

export const removeProperty = (key: string): Change => ({
  key,
  apply: (text, p) =>
    text.slice(0, lastWithoutNewline(text, p) ? p.start - 1 : p.start) + text.slice(p.end),
});

/** Whether `name` can be a property's name here: plain, and not another's. */
export function nameProblem(text: string, from: string, name: string): string | null {
  const n = name.trim();
  if (!n) return "A property needs a name.";
  if (!plainSafe(n, false) || /[:#]/.test(n) || n === "<<")
    return "Use letters, numbers, spaces, - or _.";
  const read = readProperties(text);
  if (
    read.ok &&
    read.props.some((q) => q.key !== from && q.key.toLowerCase() === n.toLowerCase())
  ) {
    return `Another property is already called “${n}”.`;
  }
  return null;
}

export const renameProperty = (from: string, to: string): Change => ({
  key: from,
  newKey: to.trim(),
  apply: (text, p) =>
    nameProblem(text, from, to)
      ? null
      : text.slice(0, p.keyRange[0]) + to.trim() + text.slice(p.keyRange[1]),
  expect: () => true,
});

/** What a type change keeps, or what it loses: `loss` is null when nothing is lost. */
export interface Conversion {
  change: Change;
  loss: string | null;
}

const quoted = (s: string) => `“${s}”`;

/** Changing a property's type: the value converted where it fits, else cleared, and what that costs. */
export function conversion(p: Property, to: PropType): Conversion {
  const k = p.key;
  const items = Array.isArray(p.shown) ? p.shown : null;
  const s =
    typeof p.shown === "string" ? p.shown : typeof p.shown === "boolean" ? String(p.shown) : null;
  const what = items
    ? items.length === 1
      ? quoted(items[0])
      : `The ${items.length} items`
    : s !== null
      ? quoted(s)
      : "";
  const plural = !!items && items.length !== 1;
  const isnt = plural ? "aren't" : "isn't";
  const cleared = (as: string): Conversion => ({
    change: clearAs(k, to),
    loss: `${what} ${isnt} ${as}, so ${plural ? "they" : "it"} will be cleared.`,
  });
  const empty = p.shown === null || (items !== null && items.length === 0);
  if (empty) return { change: clearAs(k, to), loss: null };
  const one = items?.length === 1 ? items[0] : s;
  switch (to) {
    case "text": {
      if (items) {
        const joined = items.join(", ");
        const loss = items.some((i) => i.includes(","))
          ? `Joined, they read ${quoted(joined)}, which can't be split back into the same items.`
          : null;
        return { change: setText(k, joined), loss };
      }
      return { change: setText(k, s as string), loss: null };
    }
    case "list":
      return { change: setList(k, items ?? [s as string]), loss: null };
    case "number": {
      if (
        p.type === "checkbox" ||
        p.type === "date" ||
        p.type === "datetime" ||
        one === null ||
        !isNumber(one)
      ) {
        return cleared("a number");
      }
      const n = String(Number(one));
      return {
        change: setTyped(k, "number", n),
        loss: n === one ? null : `${quoted(one)} will become ${n}.`,
      };
    }
    case "checkbox":
      if (one !== null && /^(true|false)$/i.test(one) && !plural) {
        return { change: setCheckbox(k, one.toLowerCase() === "true"), loss: null };
      }
      return {
        change: setCheckbox(k, false),
        loss: `${what} ${isnt} true or false, so ${plural ? "they" : "it"} will be cleared and the box left unticked.`,
      };
    case "date":
      if (one !== null && DATE_RE.test(one))
        return { change: setTyped(k, "date", one), loss: null };
      if (one !== null && DATETIME_RE.test(one)) {
        return {
          change: setTyped(k, "date", one.slice(0, 10)),
          loss: `The time ${one.slice(11, 16)} will be dropped.`,
        };
      }
      return cleared("a date");
    case "datetime":
      if (one !== null && DATETIME_RE.test(one))
        return { change: setTyped(k, "datetime", one), loss: null };
      if (one !== null && DATE_RE.test(one))
        return { change: setTyped(k, "datetime", `${one}T00:00`), loss: null };
      return cleared("a date and time");
  }
}

/** A property emptied in a type's own empty form: an unticked box, an empty list, else nothing. */
function clearAs(key: string, to: PropType): Change {
  if (to === "checkbox") return setCheckbox(key, false);
  if (to === "list") return setList(key, []);
  return {
    key,
    apply: (text, p) => (p.editable ? writeValue(text, p, "") : null),
    expect: (p) => p.shown === null,
  };
}
