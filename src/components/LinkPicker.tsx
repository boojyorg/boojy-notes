import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTheme } from "../hooks/useTheme";
import { useMenuPosition } from "../hooks/useMenuPosition";
import { Z } from "../constants/zIndex";
import { MENU_PAD, MENU_RADIUS, MENU_ROW_RADIUS } from "../constants/layout";
import { cssZoom } from "../utils/domHelpers";
import { readAddress, shownAddress } from "../utils/linkDestination";
import { LinkIcon, PlusIcon } from "./Icons";

/**
 * The link picker (2026-09-20): one popover for a web address and a note
 * alike, opened by Cmd+K, the toolbar's Link glyph, a typed `[[`, a
 * right-click's Edit link, and a click on a link that names no note or two.
 * Judged on a prototype before it was built.
 *
 * Creating is one field, `Paste a link or search notes…`. What is typed
 * decides what it is: an address (with or without its scheme,
 * `utils/linkDestination`) is the first row, `Link to youtube.com`; notes
 * whose title holds the letters follow, each with its folder muted at the
 * right so namesakes are told apart; and a name no note has ends the list
 * with `Create note “…”`, under the address row when there is one, never in
 * its place. A click on a row or Enter applies; Escape or a press outside
 * cancels. The `[[` route is the same picker with `notesOnly`: no address
 * row, whatever is typed.
 *
 * Editing is two fields, Text and Destination, and no list until the
 * destination is changed: then the same rows, for what has been typed. Enter
 * or a press outside commits a valid change; Escape cancels; Tab moves
 * between the fields and commits nothing; a destination that is neither an
 * address nor a note is refused on Enter (the field goes to the error ink)
 * and a press outside then closes without touching the link. A link that
 * names no note, or two, opens in this mode with the list showing at once
 * (`searchAtOpen`): the candidates, or a Create row.
 *
 * What is written is the caller's (`useLinkPicker`); this component answers
 * with a destination and, when editing, the text. Width is the path popup's
 * less a tenth (288); rows are the tree's grammar at 30px; the surface is
 * every menu's; placement is `useMenuPosition` under the anchor, divided by
 * the UI scale as every measured placement is.
 */

export interface LinkPickerNote {
  id: string;
  title: string;
  folder: string | null;
}

export type LinkDest =
  | { kind: "url"; url: string }
  /** `keep`: an edit that changed only the text; the link's own target stands. */
  | { kind: "note"; id: string | null; title: string; create?: boolean; keep?: boolean };

export interface LinkPickerProps {
  /** Viewport rect the popover hangs under: the selection, the link, or the caret's line. */
  anchor: { top: number; bottom: number; left: number; right: number };
  mode: "create" | "edit";
  /** The `[[` route: never an address row. */
  notesOnly?: boolean;
  /** Editing: the link's current text. */
  initialText?: string;
  /** Editing: the link's current destination, a URL or `[[target]]`. Creating: what was typed after `[[`. */
  initialDest?: string;
  /** Editing a link that resolves to nothing or to several notes: list at once. */
  searchAtOpen?: boolean;
  notes: LinkPickerNote[];
  /** The ids a broken or ambiguous link could mean, listed first while `searchAtOpen`. */
  candidateIds?: string[];
  onApply: (result: { dest: LinkDest; text: string | null }) => void;
  onRemove?: () => void;
  onClose: () => void;
}

export const PICKER_W = 288;
const ROW_H = 30;
const MAX_ROWS = 7;

type Row =
  | { kind: "url"; url: string }
  | { kind: "note"; note: LinkPickerNote }
  | { kind: "create"; title: string };

export default function LinkPicker({
  anchor,
  mode,
  notesOnly = false,
  initialText = "",
  initialDest = "",
  searchAtOpen = false,
  notes,
  candidateIds,
  onApply,
  onRemove,
  onClose,
}: LinkPickerProps) {
  const { theme } = useTheme() as {
    theme: Record<string, Record<string, string>> & { modalShadow: string };
  };
  const { BG, TEXT, ACCENT, SEMANTIC } = theme;
  const editing = mode === "edit";

  const [text, setText] = useState(initialText);
  const [dest, setDest] = useState(initialDest);
  const [searching, setSearching] = useState(!editing || searchAtOpen);
  const [invalid, setInvalid] = useState(false);
  const [selected, setSelected] = useState(0);

  const menuRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const destRef = useRef<HTMLInputElement>(null);

  const query = dest.trim();
  const rows: Row[] = useMemo(() => {
    if (!searching) return [];
    const q = query.replace(/^\[\[/, "").replace(/\]\]$/, "");
    const ql = q.toLowerCase();
    const out: Row[] = [];
    const address = notesOnly ? null : readAddress(q);
    if (address) out.push({ kind: "url", url: address });
    // A link that could mean several notes lists those first, whatever the
    // field says, until the field is typed in.
    const fromCandidates =
      searchAtOpen &&
      candidateIds &&
      candidateIds.length > 0 &&
      q === initialDest.replace(/^\[\[/, "").replace(/\]\]$/, "")
        ? notes.filter((n) => candidateIds.includes(n.id))
        : null;
    const matches =
      fromCandidates ??
      (q === ""
        ? editing
          ? []
          : notes.slice(0, MAX_ROWS)
        : notes.filter((n) => n.title.toLowerCase().includes(ql)));
    for (const note of matches) out.push({ kind: "note", note });
    if (q !== "" && !matches.some((n) => n.title.toLowerCase() === ql)) {
      out.push({ kind: "create", title: q });
    }
    return out;
  }, [searching, query, notesOnly, notes, editing, searchAtOpen, candidateIds, initialDest]);

  // Placement: under the anchor, flipped or clamped into the viewport, then
  // divided by the UI scale before it becomes a style.
  const pos = useMenuPosition(menuRef, true, anchor, { gapY: 4, reflowKey: rows.length }) as {
    top: number;
    left: number;
  } | null;
  const zoom = cssZoom(document.documentElement);

  // Focus at once, not a frame later: Cmd+K then a letter typed in the
  // same breath lost the letter to the note while the field waited.
  useLayoutEffect(() => {
    if (editing) {
      textRef.current?.focus();
      textRef.current?.select();
    } else destRef.current?.focus();
  }, [editing]);

  useLayoutEffect(() => {
    setSelected(0);
  }, [query]);

  // The `[[` route: letters typed before the field took focus arrive as a
  // new initial query, and the field takes them.
  useEffect(() => {
    if (notesOnly && !editing) setDest(initialDest);
  }, [notesOnly, editing, initialDest]);

  /** The destination the popover currently means, or null when it is not one. */
  const resolveDest = useCallback((): LinkDest | null => {
    const row = rows[selected];
    if (row) {
      if (row.kind === "url") return { kind: "url", url: row.url };
      if (row.kind === "note") return { kind: "note", id: row.note.id, title: row.note.title };
      return { kind: "note", id: null, title: row.title, create: true };
    }
    if (editing && !searching) {
      // Unchanged: the link's own destination stands.
      const address = readAddress(initialDest);
      if (address) return { kind: "url", url: address };
      const target = initialDest.replace(/^\[\[/, "").replace(/\]\]$/, "");
      const exact = notes.find((n) => n.title.toLowerCase() === target.toLowerCase());
      return { kind: "note", id: exact?.id ?? null, title: target, keep: true };
    }
    const address = notesOnly ? null : readAddress(query);
    if (address) return { kind: "url", url: address };
    return null;
  }, [rows, selected, editing, searching, initialDest, notes, notesOnly, query]);

  const commit = useCallback(
    (how: "enter" | "outside" | "click") => {
      const chosen = resolveDest();
      if (!chosen) {
        if (editing) {
          setInvalid(true);
          if (how === "outside") onClose();
        }
        return;
      }
      onApply({ dest: chosen, text: editing ? text.trim() : null });
    },
    [resolveDest, editing, text, onApply, onClose],
  );

  const changed = editing && (text.trim() !== initialText.trim() || searching);

  // A press outside: creation cancels; editing commits a valid change. The
  // listener arms a frame later, because the toolbar's Link glyph opens the
  // picker on its own mousedown and that press would otherwise close it at once.
  useEffect(() => {
    const onPress = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (t && menuRef.current?.contains(t)) return;
      if (editing && changed) commit("outside");
      else onClose();
    };
    let armed = false;
    const raf = requestAnimationFrame(() => {
      armed = true;
      document.addEventListener("mousedown", onPress, true);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (armed) document.removeEventListener("mousedown", onPress, true);
    };
  }, [editing, changed, commit, onClose]);

  // Escape closes the picker wherever focus is: in a field, or still in the
  // note for the frame before the field takes it. Capture phase, so the
  // editor's own Escape never runs underneath an open picker.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const onFieldKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // The fields' keys are the fields': the editor's own handler is an ancestor.
    e.stopPropagation();
    if (e.key === "Escape") {
      // The document's capture listener has already closed the picker.
      e.preventDefault();
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit("enter");
    } else if (e.key === "ArrowDown" && rows.length > 0) {
      e.preventDefault();
      setSelected((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp" && rows.length > 0) {
      e.preventDefault();
      setSelected((i) => Math.max(0, i - 1));
    } else if (e.key === "Tab" && editing) {
      e.preventDefault();
      (e.currentTarget === textRef.current ? destRef : textRef).current?.focus();
    }
  };

  const rowBase: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: ROW_H,
    padding: "0 8px",
    borderRadius: MENU_ROW_RADIUS,
    cursor: "pointer",
    fontSize: 13,
    color: TEXT.secondary,
  };
  const fieldStyle: CSSProperties = {
    width: "100%",
    minWidth: 0,
    border: 0,
    outline: "none",
    background: "transparent",
    font: "inherit",
    fontSize: 13,
    color: TEXT.primary,
    padding: "4px 0",
  };
  const labelStyle: CSSProperties = { fontSize: 12, color: TEXT.muted };

  return (
    <div
      ref={menuRef}
      role="dialog"
      aria-label={editing ? "Edit link" : "Link"}
      className="link-picker"
      data-testid="link-picker"
      style={{
        position: "fixed",
        top: (pos?.top ?? anchor.bottom + 4) / zoom,
        left: (pos?.left ?? anchor.left) / zoom,
        width: PICKER_W,
        zIndex: Z.DROPDOWN,
        boxSizing: "border-box",
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        borderRadius: MENU_RADIUS,
        boxShadow: theme.modalShadow,
        animation: "fadeIn 0.1s ease",
        fontFamily: "inherit",
      }}
    >
      {editing && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "74px 1fr",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px 2px",
          }}
        >
          <label htmlFor="link-picker-text" style={labelStyle}>
            Text
          </label>
          <input
            id="link-picker-text"
            ref={textRef}
            value={text}
            placeholder="Link text"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onFieldKey}
            style={fieldStyle}
          />
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: editing ? "74px 1fr" : "1fr",
          alignItems: "center",
          gap: 8,
          padding: editing ? "2px 10px 6px" : "8px 12px",
        }}
      >
        {editing && (
          <label htmlFor="link-picker-dest" style={labelStyle}>
            Destination
          </label>
        )}
        <input
          id="link-picker-dest"
          ref={destRef}
          value={dest}
          placeholder={notesOnly ? "Search notes…" : "Paste a link or search notes…"}
          aria-label={editing ? undefined : "Paste a link or search notes"}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setDest(e.target.value);
            setInvalid(false);
            if (editing) setSearching(e.target.value.trim() !== initialDest.trim());
          }}
          onKeyDown={onFieldKey}
          style={{ ...fieldStyle, color: invalid ? SEMANTIC.error : TEXT.primary }}
        />
      </div>
      {(searching || editing) && (
        <div style={{ height: 1, background: BG.divider, margin: "0 6px" }} />
      )}
      {searching && (
        <div
          role="listbox"
          aria-label="Link suggestions"
          style={{ padding: MENU_PAD, maxHeight: MAX_ROWS * (ROW_H + 2) + 8, overflowY: "auto" }}
        >
          {rows.length === 0 && (
            <div style={{ padding: "6px 8px 8px", fontSize: 12, color: TEXT.muted }}>
              {query ? "No note by that name" : "Type a web address or a note's name"}
            </div>
          )}
          {rows.map((row, i) => {
            const active = i === selected;
            const common = {
              role: "option" as const,
              "aria-selected": active,
              onMouseMove: () => {
                if (!active) setSelected(i);
              },
              // The press keeps the field's focus; the click chooses, so no
              // click is left over for whatever lies under the popover once
              // it has gone (it put the caret there, 2026-09-20).
              onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
              onClick: () => {
                setSelected(i);
                // The row is the choice; resolveDest reads `selected` on the
                // next render, so choose from the row itself.
                const chosen: LinkDest =
                  row.kind === "url"
                    ? { kind: "url", url: row.url }
                    : row.kind === "note"
                      ? { kind: "note", id: row.note.id, title: row.note.title }
                      : { kind: "note", id: null, title: row.title, create: true };
                onApply({ dest: chosen, text: editing ? text.trim() : null });
              },
              style: { ...rowBase, background: active ? BG.hover : "transparent" },
            };
            if (row.kind === "url")
              return (
                <div key="url" data-testid="link-row-url" {...common}>
                  <span style={{ display: "flex", color: TEXT.muted }}>
                    <LinkIcon />
                  </span>
                  <span style={{ ...ellipsis, color: ACCENT.text }}>
                    Link to {shownAddress(row.url)}
                  </span>
                </div>
              );
            if (row.kind === "note")
              return (
                <div
                  key={row.note.id}
                  data-testid="link-row-note"
                  data-note-id={row.note.id}
                  {...common}
                >
                  <span style={{ ...ellipsis, color: TEXT.primary }}>{row.note.title}</span>
                  <span
                    style={{
                      flex: "0 1 auto",
                      maxWidth: "42%",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      direction: "rtl",
                      textAlign: "left",
                      fontSize: 12,
                      color: TEXT.muted,
                    }}
                    title={row.note.folder || "Notes"}
                  >
                    {row.note.folder || "Notes"}
                  </span>
                </div>
              );
            return (
              <div key="create" data-testid="link-row-create" {...common}>
                <span style={{ display: "flex", color: TEXT.muted }}>
                  <PlusIcon />
                </span>
                <span style={{ ...ellipsis, color: TEXT.secondary }}>
                  Create note “{row.title}”
                </span>
              </div>
            );
          })}
        </div>
      )}
      {editing && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 6px 6px",
            fontSize: 12,
            color: TEXT.muted,
          }}
        >
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onRemove?.();
            }}
            style={{
              border: 0,
              background: "transparent",
              font: "inherit",
              fontSize: 12,
              color: TEXT.secondary,
              cursor: "pointer",
              padding: "4px 6px",
              borderRadius: 6,
            }}
          >
            Remove link
          </button>
          <span style={{ paddingRight: 6 }}>↵ apply · esc cancel</span>
        </div>
      )}
    </div>
  );
}

const ellipsis: CSSProperties = {
  flex: "1 1 auto",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
