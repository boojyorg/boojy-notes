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
  | { kind: "name"; name: string; type: PropType | null; label: string }
  | { kind: "custom"; name: string }
  | { kind: "type"; type: PropType };

/**
 * What the picker offers for what is typed: tags when the note has none, the
 * names other notes use (with the type this device remembers for them, else
 * none), then a property of one's own. Pure, so the rule can be read alone.
 */
export function pickRows(
  query: string,
  have: ReadonlySet<string>,
  names: readonly string[],
  types: Record<string, PropType>,
): PickRow[] {
  const q = query.trim().toLowerCase();
  const has = (n: string) => have.has(n.toLowerCase());
  const matches = (n: string) => !q || n.toLowerCase().includes(q);
  const rows: PickRow[] = [];
  if (!has("tags") && matches("tags"))
    rows.push({ kind: "name", name: "tags", type: "list", label: "tags" });
  for (const n of names.filter((n) => !has(n) && matches(n)).slice(0, MAX_NAMES)) {
    rows.push({ kind: "name", name: n, type: types[n] ?? null, label: n });
  }
  const exact = q === "tags" || names.some((n) => n.toLowerCase() === q);
  if (!q) rows.push({ kind: "custom", name: "" });
  else if (!exact && !has(q)) rows.push({ kind: "custom", name: query.trim() });
  return rows;
}

interface PropertyPickerProps {
  anchor: MenuAnchor;
  /** The note's own property names, lower-cased. */
  have: ReadonlySet<string>;
  names: readonly string[];
  types: Record<string, PropType>;
  onChoose: (name: string, type: PropType) => void;
  onClose: () => void;
}

/**
 * Add property: a field and a list in one small surface, the menus' own. A
 * name first (tags, one other notes use, or one's own), then its type when
 * that isn't already known. Keys: arrows, Enter, Escape; a press outside
 * closes it.
 */
export default function PropertyPicker({
  anchor,
  have,
  names,
  types,
  onChoose,
  onClose,
}: PropertyPickerProps) {
  const { theme } = useTheme();
  const { TEXT, BG } = theme;
  const [query, setQuery] = useState("");
  /** The name whose type is being chosen: the second step. */
  const [naming, setNaming] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  const rows: PickRow[] = useMemo(
    () =>
      naming === null
        ? pickRows(query, have, names, types)
        : TYPES.map((type) => ({ kind: "type" as const, type })),
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
    if (row.kind === "type") {
      const name = (naming ?? "").trim();
      if (!name) {
        fieldRef.current?.focus();
        return;
      }
      onChoose(name, row.type);
    } else if (row.kind === "name" && row.type) {
      onChoose(row.name, row.type);
    } else {
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
        placeholder={naming === null ? "Find or name a property" : "Name it"}
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
            {typedName.trim() ? `Type for “${typedName.trim()}”` : "Name it, then choose a type"}
          </div>
        )}
        {rows.map((row, i) => {
          const active = i === selected;
          const icon =
            row.kind === "type"
              ? row.type
              : row.kind === "name"
                ? row.name === "tags"
                  ? "tags"
                  : (row.type ?? "untyped")
                : null;
          const label =
            row.kind === "type"
              ? TYPE_LABEL[row.type]
              : row.kind === "name"
                ? row.label
                : row.name
                  ? `Add “${row.name}”`
                  : "Custom property";
          // The other notes' names under their heading, which tags (offered to every note) stays above.
          const firstOther =
            row.kind === "name" &&
            row.name !== "tags" &&
            rows.findIndex((r) => r.kind === "name" && r.name !== "tags") === i;
          return (
            <Fragment key={row.kind === "type" ? row.type : `${row.kind}:${row.name}`}>
              {firstOther && (
                <div style={{ padding: "6px 8px 2px", fontSize: 12, color: TEXT.muted }}>
                  Used in other notes
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
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {label}
                </span>
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
