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
  | { kind: "type"; type: PropType }
  | { kind: "custom"; name: string };

/**
 * What the picker offers. Empty, the same rows in every note: tags (when the
 * note has none), then the six types, each a new property of its own. Typed
 * into, the names other notes use that match (with the type they write and
 * how many use them), the types whose label matches, and the typed name as a
 * new one. Pure, so the rule can be read alone.
 */
export function pickRows(
  query: string,
  have: ReadonlySet<string>,
  names: readonly VaultName[],
  types: Record<string, PropType>,
): PickRow[] {
  const q = query.trim().toLowerCase();
  const has = (n: string) => have.has(n.toLowerCase());
  const matches = (n: string) => !q || n.toLowerCase().includes(q);
  const rows: PickRow[] = [];
  if (!has("tags") && matches("tags")) rows.push({ kind: "tags" });
  if (q) {
    for (const n of names.filter((n) => !has(n.name) && matches(n.name)).slice(0, MAX_NAMES))
      rows.push({
        kind: "name",
        name: n.name,
        type: n.type ?? types[n.name] ?? null,
        count: n.count,
      });
  }
  for (const type of TYPES) if (matches(TYPE_LABEL[type])) rows.push({ kind: "type", type });
  const exact = q === "tags" || names.some((n) => n.name.toLowerCase() === q);
  if (q && !exact && !has(q)) rows.push({ kind: "custom", name: query.trim() });
  return rows;
}

interface PropertyPickerProps {
  anchor: MenuAnchor;
  /** The note's own property names, lower-cased. */
  have: ReadonlySet<string>;
  names: readonly VaultName[];
  types: Record<string, PropType>;
  /** A property by name and type: tags, a name other notes use, or a typed name once typed. */
  onChoose: (name: string, type: PropType) => void;
  /** A new property of this type, its name still to give (the section's draft row). */
  onPickType: (type: PropType) => void;
  onClose: () => void;
}

/**
 * Add property: a field and a list in one small surface, the menus' own. A
 * type first (the property is named in its row), or a name found by typing;
 * a typed name nobody uses then asks its type. Keys: arrows, Enter, Escape;
 * a press outside closes it.
 */
export default function PropertyPicker({
  anchor,
  have,
  names,
  types,
  onChoose,
  onPickType,
  onClose,
}: PropertyPickerProps) {
  const { theme } = useTheme();
  const { TEXT, BG } = theme;
  const [query, setQuery] = useState("");
  /** A typed name nobody uses, whose type is being chosen: the second step. */
  const [naming, setNaming] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  const rows: PickRow[] = useMemo(
    () =>
      naming === null
        ? pickRows(query, have, names, types)
        : TYPES.map((type): PickRow => ({ kind: "type", type })),
    [naming, query, have, names, types],
  );
  const pos = useMenuPosition(menuRef, true, anchor, { gapY: 4, reflowKey: rows.length });
  useExitGhost(menuRef);

  useLayoutEffect(() => {
    fieldRef.current?.focus({ preventScroll: true });
  }, []);
  // A new query or step starts at the first row.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the query and the step are the signal
  useEffect(() => setSelected(0), [query, naming]);

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
    if (!row) return;
    if (row.kind === "tags") onChoose("tags", "list");
    else if (row.kind === "type") {
      if (naming === null) onPickType(row.type);
      else onChoose(naming.trim(), row.type);
    } else if (row.kind === "name" && row.type) onChoose(row.name, row.type);
    else {
      // A name with no type yet (or a typed one): its type next.
      setNaming(row.name);
      requestAnimationFrame(() => fieldRef.current?.focus());
    }
  };

  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // The field's keys are the picker's: the editor's own handler is an ancestor.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(rows[selected]);
    } else if (e.key === "ArrowDown" && rows.length) {
      e.preventDefault();
      setSelected((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp" && rows.length) {
      e.preventDefault();
      setSelected((i) => Math.max(0, i - 1));
    }
  };

  const typedName = naming ?? "";
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
        value={naming === null ? query : typedName}
        placeholder={naming === null ? "Find or name a property" : "Name"}
        aria-label={naming === null ? "Find or name a property" : "Property name"}
        spellCheck={false}
        autoComplete="off"
        enterKeyHint="done"
        onChange={(e) => (naming === null ? setQuery(e.target.value) : setNaming(e.target.value))}
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
      <div role="listbox" aria-label="Properties to add" style={{ padding: MENU_PAD }}>
        {naming !== null && (
          <div style={{ padding: "4px 8px 2px", fontSize: 12, color: TEXT.muted }}>
            Type for “{typedName.trim()}”
          </div>
        )}
        {rows.map((row, i) => {
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
          const key =
            row.kind === "type" || row.kind === "tags"
              ? `${row.kind}:${row.kind === "type" ? row.type : ""}`
              : `${row.kind}:${row.name}`;
          // The names other notes use, under their heading; the types under theirs once both show.
          const firstOfKind = rows.findIndex((r) => r.kind === row.kind) === i;
          const heading =
            firstOfKind && naming === null && row.kind === "name"
              ? "In other notes"
              : firstOfKind && naming === null && row.kind === "type" && query.trim()
                ? "New"
                : null;
          return (
            <Fragment key={key}>
              {heading && (
                <div style={{ padding: "6px 8px 2px", fontSize: 12, color: TEXT.muted }}>
                  {heading}
                </div>
              )}
              <div
                role="option"
                aria-selected={active}
                data-testid={`pick-${row.kind}`}
                onMouseMove={(e) => {
                  if (!fromTouch(e) && !active) setSelected(i);
                }}
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
              </div>
            </Fragment>
          );
        })}
        {rows.length === 0 && (
          <div style={{ padding: "6px 8px 8px", fontSize: 12, color: TEXT.muted }}>
            This note already has that property
          </div>
        )}
      </div>
    </div>
  );
}
