import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MENU_PAD, MENU_ROW_RADIUS } from "../constants/layout";
import { Z } from "../constants/zIndex";
import { useExitGhost } from "../hooks/useExitGhost";
import { useMenuPosition } from "../hooks/useMenuPosition";
import { useTheme } from "../hooks/useTheme";
import type { PropType } from "../utils/properties";
import type { VaultName } from "../utils/propertyTypes";
import { fromTouch } from "../utils/touch";
import { PlusIcon, PropertyTypeIcon } from "./Icons";
import { type MenuAnchor, menuSurface } from "./Menu";

const PICKER_W = 248;
const ROW_H = 30;
const MAX_NAMES = 6;
/** The list's most, under the field, before it scrolls: about nine rows. */
const LIST_MAX_H = 296;
const TYPES: PropType[] = ["text", "list", "number", "checkbox", "date", "datetime"];
const TYPE_LABEL: Record<PropType, string> = {
  text: "Text",
  list: "List",
  number: "Number",
  checkbox: "Checkbox",
  date: "Date",
  datetime: "Date & time",
};

export type PickRow =
  | { kind: "tags" }
  | { kind: "name"; name: string; type: PropType | null; count: number }
  | { kind: "add"; name: string }
  | { kind: "type"; type: PropType; name: string }
  | { kind: "note"; text: string };

/**
 * What the picker offers. Empty, the same rows in every note: tags (when the
 * note has none), then the six types, each a new property named in its row.
 * Typed into: tags if it matches, the names other notes use that match (with
 * the type they write and how many use them), then the typed name itself,
 * added with no type (its value decides) or, below, as one of the six. A name
 * that can't be one says why. Pure, so the rule can be read alone.
 */
export function pickRows(
  query: string,
  have: ReadonlySet<string>,
  names: readonly VaultName[],
  types: Record<string, PropType>,
  problem: (name: string) => string | null = () => null,
): PickRow[] {
  const typed = query.trim();
  const q = typed.toLowerCase();
  const has = (n: string) => have.has(n.toLowerCase());
  // A name matches at its start or a word's: `c` finds cast, not source.
  const matches = (n: string) => {
    const l = n.toLowerCase();
    return !q || l.startsWith(q) || l.split(/[\s_\-/.]+/).some((w) => w.startsWith(q));
  };
  const rows: PickRow[] = [];
  if (!q) {
    if (!has("tags")) rows.push({ kind: "tags" });
    for (const type of TYPES) rows.push({ kind: "type", type, name: "" });
    return rows;
  }
  const vault = names.filter((n) => !has(n.name) && matches(n.name));
  const exact = vault.find((n) => n.name.toLowerCase() === q);
  const nameRow = (n: VaultName): PickRow => ({
    kind: "name",
    name: n.name,
    type: n.type ?? types[n.name] ?? null,
    count: n.count,
  });
  const why = q === "tags" || has(q) ? null : problem(typed);
  // First, what Enter does: the name other notes use, if it is exactly that; else the typed one.
  if (exact) rows.push(nameRow(exact));
  else if (q !== "tags" && !has(q) && !why) rows.push({ kind: "add", name: typed });
  if (!has("tags") && matches("tags")) rows.push({ kind: "tags" });
  for (const n of vault.filter((n) => n !== exact).slice(0, MAX_NAMES)) rows.push(nameRow(n));
  if (has(q)) rows.push({ kind: "note", text: "This note already has that property" });
  else if (why) rows.push({ kind: "note", text: why });
  else if (q !== "tags") for (const type of TYPES) rows.push({ kind: "type", type, name: typed });
  return rows;
}

interface PropertyPickerProps {
  anchor: MenuAnchor;
  /** The note's own property names, lower-cased. */
  have: ReadonlySet<string>;
  names: readonly VaultName[];
  types: Record<string, PropType>;
  /** Why a typed name can't be a property's (`nameProblem`), or null. */
  problem?: (name: string) => string | null;
  /** A property by name: its type, or null for one its value will decide. */
  onChoose: (name: string, type: PropType | null) => void;
  /** A new property of this type, its name still to give (the section's draft row). */
  onPickType: (type: PropType) => void;
  onClose: () => void;
}

/**
 * Add property: a field and a list in one small surface, the menus' own. A
 * type first (the property is named in its row), or a name typed: added as
 * it is, its value deciding its type, or with one picked below. Nothing is
 * picked until the arrows or the pointer pick it; Enter on a typed name adds
 * it. A press outside closes it.
 */
export default function PropertyPicker({
  anchor,
  have,
  names,
  types,
  problem,
  onChoose,
  onPickType,
  onClose,
}: PropertyPickerProps) {
  const { theme } = useTheme();
  const { TEXT, BG } = theme;
  const [query, setQuery] = useState("");
  // Nothing is picked until the arrows or the pointer pick it.
  const [selected, setSelected] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const rows: PickRow[] = useMemo(
    () => pickRows(query, have, names, types, problem),
    [query, have, names, types, problem],
  );
  const pickable = (r: PickRow | undefined) => !!r && r.kind !== "note";
  const pos = useMenuPosition(menuRef, true, anchor, { gapY: 4, reflowKey: rows.length });
  useExitGhost(menuRef);

  useLayoutEffect(() => {
    fieldRef.current?.focus({ preventScroll: true });
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the query is the signal
  useEffect(() => setSelected(-1), [query]);

  // A press outside closes it; one that began before it opened is the press that opened it.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const openedAt = performance.now();
    const onPress = (e: MouseEvent) => {
      if (e.timeStamp <= openedAt) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      close.current();
    };
    document.addEventListener("mousedown", onPress, true);
    return () => document.removeEventListener("mousedown", onPress, true);
  }, []);

  const choose = (row: PickRow | undefined) => {
    if (!row || row.kind === "note") return;
    if (row.kind === "tags") onChoose("tags", "list");
    else if (row.kind === "type") {
      if (row.name) onChoose(row.name, row.type);
      else onPickType(row.type);
    } else onChoose(row.name, row.kind === "name" ? row.type : null);
  };

  const step = (by: 1 | -1) => {
    const n = rows.length;
    if (!rows.some(pickable)) return;
    let i = selected;
    do i = i < 0 ? (by > 0 ? 0 : n - 1) : (i + by + n) % n;
    while (!pickable(rows[i]));
    setSelected(i);
    // The list scrolls under the field: the picked row is kept in view.
    requestAnimationFrame(() =>
      listRef.current?.querySelector(`#property-pick-${i}`)?.scrollIntoView({ block: "nearest" }),
    );
  };

  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // The field's keys are the picker's: the editor's own handler is an ancestor.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Nothing picked: Enter does the first row, once something is typed (the typed name,
      // or the name other notes use that it is exactly).
      choose(selected >= 0 ? rows[selected] : query.trim() ? rows.find(pickable) : undefined);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      step(-1);
    }
  };

  const typed = query.trim();
  return (
    <div
      ref={menuRef}
      role="dialog"
      aria-label="Add property"
      className="motion-pop"
      data-testid="property-picker"
      onInput={(e) => e.stopPropagation()}
      onBeforeInput={(e) => e.stopPropagation()}
      style={{
        ...menuSurface(theme),
        padding: 0,
        top: pos?.top,
        left: pos?.left,
        width: PICKER_W,
        zIndex: Z.DROPDOWN,
        boxSizing: "border-box",
        fontFamily: "inherit",
      }}
    >
      <input
        ref={fieldRef}
        value={query}
        placeholder="Find or name a property"
        aria-label="Find or name a property"
        aria-activedescendant={selected >= 0 ? `property-pick-${selected}` : undefined}
        spellCheck={false}
        autoComplete="off"
        enterKeyHint="done"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
        style={{
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          border: 0,
          outline: "none",
          background: "transparent",
          font: "inherit",
          fontSize: 13,
          color: TEXT.primary,
          padding: "9px 12px 8px",
        }}
      />
      <div style={{ height: 1, background: BG.divider, margin: "0 6px" }} />
      <div
        ref={listRef}
        role="listbox"
        aria-label="Properties to add"
        style={{ padding: MENU_PAD, maxHeight: LIST_MAX_H, overflowY: "auto" }}
      >
        {rows.map((row, i) => {
          if (row.kind === "note")
            return (
              <div key="note" style={{ padding: "6px 8px 8px", fontSize: 12, color: TEXT.muted }}>
                {row.text}
              </div>
            );
          const active = i === selected;
          const icon =
            row.kind === "tags"
              ? "tags"
              : row.kind === "type"
                ? row.type
                : row.kind === "name"
                  ? (row.type ?? "untyped")
                  : null;
          const label =
            row.kind === "tags"
              ? "Tags"
              : row.kind === "type"
                ? TYPE_LABEL[row.type]
                : row.kind === "name"
                  ? row.name
                  : `Add “${row.name}”`;
          // What a screen reader hears: a type row under a typed name adds that name as it.
          const spoken =
            row.kind === "type" && row.name
              ? `Add “${row.name}” as ${TYPE_LABEL[row.type]}`
              : undefined;
          const key =
            row.kind === "type"
              ? `type:${row.type}`
              : `${row.kind}:${"name" in row ? row.name : ""}`;
          const firstOfKind = rows.findIndex((r) => r.kind === row.kind) === i;
          const heading =
            firstOfKind && row.kind === "name"
              ? "In other notes"
              : firstOfKind && row.kind === "type" && typed
                ? "Or pick its type"
                : null;
          return (
            <Fragment key={key}>
              {heading && (
                <div style={{ padding: "6px 8px 2px", fontSize: 12, color: TEXT.muted }}>
                  {heading}
                </div>
              )}
              <div
                id={`property-pick-${i}`}
                role="option"
                aria-selected={active}
                aria-label={spoken}
                data-testid={`pick-${row.kind}`}
                onMouseMove={(e) => {
                  if (!fromTouch(e) && !active) setSelected(i);
                }}
                onMouseLeave={() => setSelected(-1)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(row)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  height: ROW_H,
                  padding: "0 8px",
                  borderRadius: MENU_ROW_RADIUS,
                  cursor: "pointer",
                  fontSize: 13,
                  color: TEXT.primary,
                  background: active ? BG.hover : "transparent",
                }}
              >
                <span style={{ display: "flex", color: TEXT.secondary }}>
                  {icon ? <PropertyTypeIcon type={icon} size={16} /> : <PlusIcon />}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </span>
                {row.kind === "name" && (
                  <span style={{ flex: "none", fontSize: 12, color: TEXT.muted }}>
                    {row.count === 1 ? "1 note" : `${row.count} notes`}
                  </span>
                )}
                {i === rows.findIndex(pickable) && typed && (selected < 0 || active) && (
                  <span
                    aria-hidden="true"
                    style={{ flex: "none", fontSize: 12, color: TEXT.muted }}
                  >
                    ↵
                  </span>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
