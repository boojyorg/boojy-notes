import { useState, useRef, useEffect, useCallback, useLayoutEffect, memo } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../hooks/useTheme";
import { useRhythm } from "../tokens/rhythm";
import { latestBlock, useOwnedField } from "../hooks/useOwnedField";
import { useEmptyMark } from "../hooks/useEmptyMark";
import { useMenuKeys } from "../hooks/useMenuKeys";
import { Z } from "../constants/zIndex";
import { MENU_PAD, MENU_RADIUS, MENU_ROW_RADIUS } from "../constants/layout";
import { inlineMarkdownToHtml, domNodeToMarkdown } from "../utils/inlineFormatting";
import { caretLength, caretRect, getCaretOffset, placeCaret } from "../utils/domHelpers";
import {
  Pencil,
  Info,
  Lightbulb,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  HelpCircle,
  Quote,
  ListChecks,
  Bug,
  FileText,
  XCircle,
  ChevronRight,
} from "lucide-react";
import { registerBlockOpener } from "../utils/blockOpen";
import { fromTouch } from "../utils/touch";
import { withAlpha } from "../utils/selectionBand";
import { fieldTextAfterTyping } from "../utils/typedFormatting";

/* ─── Callout type configuration ─── */

const CALLOUT_TYPES = {
  note: {
    icon: Pencil,
    defaultTitle: "Note",
  },
  info: {
    icon: Info,
    defaultTitle: "Info",
  },
  tip: {
    icon: Lightbulb,
    defaultTitle: "Tip",
  },
  warning: {
    icon: AlertTriangle,
    defaultTitle: "Warning",
  },
  danger: {
    icon: ShieldAlert,
    defaultTitle: "Danger",
  },
  success: {
    icon: CheckCircle2,
    defaultTitle: "Success",
  },
  question: {
    icon: HelpCircle,
    defaultTitle: "Question",
  },
  quote: {
    icon: Quote,
    defaultTitle: "Quote",
  },
  example: {
    icon: ListChecks,
    defaultTitle: "Example",
  },
  bug: {
    icon: Bug,
    defaultTitle: "Bug",
  },
  failure: {
    icon: XCircle,
    defaultTitle: "Failure",
  },
  abstract: {
    icon: FileText,
    defaultTitle: "Abstract",
  },
};

const CALLOUT_TYPE_KEYS = Object.keys(CALLOUT_TYPES);

/**
 * What an empty title shows, as Obsidian shows it: the type word as written,
 * in title case (`[!important]` reads Important, `[!banana]` Banana). It is
 * the placeholder's text, never written to the file.
 */
function shownTitle(block, config) {
  const word = block.calloutTypeRaw || "";
  return word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : config.defaultTitle;
}

/* ─── Type picker dropdown ─── */

function CalloutTypePicker({ activeType, onSelect, anchorRect, onClose }) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;
  const listRef = useRef(null);
  const [focusIdx, setFocusIdx] = useState(() => CALLOUT_TYPE_KEYS.indexOf(activeType));

  // Position: below the anchor, flip up if near bottom
  const style = {};
  if (anchorRect) {
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    if (spaceBelow < 320) {
      style.bottom = window.innerHeight - anchorRect.top + 4;
    } else {
      style.top = anchorRect.bottom + 4;
    }
    style.left = anchorRect.left;
  }

  // The menus' one key rule (useMenuKeys). The picker never takes focus, so
  // it listens in the document's capture phase, ahead of the field under it
  // and the shell, and only for the keys it takes; letters stay typing.
  const menuKeys = useMenuKeys({
    rows: () => CALLOUT_TYPE_KEYS.map((key) => ({ label: CALLOUT_TYPES[key].defaultTitle })),
    active: focusIdx,
    setActive: setFocusIdx,
    choose: (i) => onSelect(CALLOUT_TYPE_KEYS[i]),
    close: onClose,
    suggestion: true,
  });
  useEffect(() => {
    const onKey = (e) => {
      if (menuKeys(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [menuKeys]);

  // Scroll focused item into view (manual to avoid page scroll jump)
  useEffect(() => {
    const container = listRef.current;
    const el = container?.children[focusIdx];
    if (!el || !container) return;
    const elTop = el.offsetTop;
    const elBottom = elTop + el.offsetHeight;
    if (elTop < container.scrollTop) {
      container.scrollTop = elTop;
    } else if (elBottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = elBottom - container.clientHeight;
    }
  }, [focusIdx]);

  return (
    <>
      {/* overlay to catch clicks outside */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          onClose();
        }}
        style={{ position: "fixed", inset: 0, zIndex: Z.CALLOUT_BACKDROP }}
      />
      <div
        ref={listRef}
        className="callout-picker"
        role="listbox"
        aria-label="Callout type"
        style={{
          position: "fixed",
          zIndex: Z.TOAST,
          ...style,
          width: 180,
          maxHeight: 320,
          overflowY: "auto",
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: MENU_RADIUS,
          padding: MENU_PAD,
          boxShadow: theme.modalShadow,
        }}
      >
        {CALLOUT_TYPE_KEYS.map((key, idx) => {
          const cfg = CALLOUT_TYPES[key];
          const Icon = cfg.icon;
          const isFocused = idx === focusIdx;
          const isActive = key === activeType;
          return (
            <div
              key={key}
              id={`callout-option-${key}`}
              role="option"
              aria-selected={isFocused}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(key)}
              onMouseEnter={(e) => {
                if (fromTouch(e)) return;
                setFocusIdx(idx);
              }}
              className="callout-picker-item"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: MENU_ROW_RADIUS,
                cursor: "pointer",
                background: isFocused ? BG.hover : "transparent",
                transition: "background var(--motion-fast)",
              }}
            >
              <Icon size={15} color={theme.callouts[key].colour} strokeWidth={1.8} />
              <span style={{ flex: 1, fontSize: 13, color: TEXT.primary }}>{cfg.defaultTitle}</span>
              {isActive && (
                <span style={{ fontSize: 13, color: theme.callouts[key].colour }}>&#10003;</span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ─── CalloutBlock ─── */

export default memo(function CalloutBlock({
  block,
  noteId,
  blockIndex,
  syncGen,
  noteTitleSet,
  noteDataRef,
  onUpdateBlock,
  onUpdateText,
  onUpdateTitle,
  onBlockNav,
  onDelete,
}) {
  const rootRef = useRef(null);
  const titleRef = useRef(null);
  const bodyRef = useRef(null);
  const iconBtnRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [iconRect, setIconRect] = useState(null);

  const { theme } = useTheme();
  const rhythm = useRhythm();

  const scrollRestoreRef = useRef(null);

  const calloutType = block.calloutType || "note";
  const config = CALLOUT_TYPES[calloutType] || CALLOUT_TYPES.note;

  const saveScroll = useCallback(() => {
    const scrollEl = iconBtnRef.current?.closest(".editor-scroll");
    if (scrollEl) scrollRestoreRef.current = { el: scrollEl, top: scrollEl.scrollTop };
  }, []);

  /* ─── Folding ─── */

  // How the note is viewed, never an edit (Obsidian's `-` and `+`): `-` opens
  // folded, `+` open, no sign never folds. The file's sign rules again
  // whenever the open note changes, or the sign does.
  const foldable = block.calloutFold === "-" || block.calloutFold === "+";
  const [folded, setFolded] = useState(block.calloutFold === "-");
  const foldedRef = useRef(folded);
  foldedRef.current = folded;
  // Set while the body slides, so it clips only then (open, it overflows freely).
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    setFolded(block.calloutFold === "-");
  }, [noteId, block.calloutFold]);

  const setFold = useCallback((next) => {
    if (next === foldedRef.current) return;
    // The caret never stays in hidden text: folding from the body takes it to
    // the title's end, before the body goes inert.
    if (next && bodyRef.current?.contains(document.activeElement)) {
      const t = titleRef.current;
      t?.focus({ preventScroll: true });
      if (t) placeCaret(t, caretLength(t));
    }
    setMoving(true);
    setFolded(next);
  }, []);
  useEffect(() => {
    if (!moving) return undefined;
    // Ends on the slide's end, or at once without one (reduced motion).
    const timer = window.setTimeout(() => setMoving(false), 600);
    return () => window.clearTimeout(timer);
  }, [moving]);

  // The block menu and Find ask by id (blockOpen): "fold", "unfold", "toggle".
  // Only the note's own block answers, never a copy drawn in an embed or a
  // past version (they share its id).
  useLayoutEffect(() => {
    if (!foldable) return undefined;
    const own = rootRef.current
      ?.closest("[data-block-id]")
      ?.parentElement?.matches("[data-editor]");
    if (!own) return undefined;
    return registerBlockOpener(block.id, ({ what }) =>
      setFold(what === "fold" ? true : what === "unfold" ? false : !foldedRef.current),
    );
  }, [block.id, foldable, setFold]);
  const isFolded = foldable && folded;

  /* ─── The two fields ─── */

  // Both are the browser's while typed into and commit on every input at
  // the text grain; state paints them only when they do not already hold
  // its text (useOwnedField). The title is plain text: a newline cannot
  // live in the marker line, so Enter and Shift+Enter move to the body.
  // The body is inline Markdown, read back with the editor's own reader;
  // innerText would lose every `**bold**`, `[[link]]` and backtick.
  const title = block.title || "";
  const text = block.text || "";

  const latest = () => latestBlock(noteDataRef, noteId, block);

  useOwnedField(titleRef, {
    text: title,
    syncGen,
    latest: () => latest()?.title || "",
    read: (el) => el.textContent || "",
    paint: (el, t) => {
      const caret = getCaretOffset(el);
      el.textContent = t;
      if (caret >= 0) placeCaret(el, Math.min(caret, caretLength(el)));
    },
  });

  useOwnedField(bodyRef, {
    text,
    syncGen,
    latest: () => latest()?.text || "",
    read: domNodeToMarkdown,
    paint: (el, t) => {
      const caret = getCaretOffset(el);
      el.innerHTML = t ? inlineMarkdownToHtml(t, noteTitleSet) : "<br>";
      if (caret >= 0) placeCaret(el, Math.min(caret, caretLength(el)));
    },
  });

  // A cleared field keeps a <br>, so the placeholders read the live text.
  useEmptyMark(titleRef);
  useEmptyMark(bodyRef);

  const handleTitleInput = useCallback(() => {
    onUpdateTitle(noteId, blockIndex, titleRef.current?.textContent || "");
  }, [noteId, blockIndex, onUpdateTitle]);

  // A typed closing marker is painted here, as a text block paints it.
  const handleBodyInput = useCallback(
    (e) => {
      onUpdateText(
        noteId,
        blockIndex,
        fieldTextAfterTyping(bodyRef.current, e?.nativeEvent, noteTitleSet),
      );
    },
    [noteId, blockIndex, onUpdateText, noteTitleSet],
  );

  /* ─── Scroll restoration (runs after DOM sync, before paint) ─── */

  // Deps deliberately not exhaustive: intentionally runs every render to restore scroll position before paint
  useLayoutEffect(() => {
    if (!scrollRestoreRef.current) return;
    const { el, top } = scrollRestoreRef.current;
    scrollRestoreRef.current = null;
    el.scrollTop = top;
    if (pickerOpen && iconBtnRef.current) {
      setIconRect(iconBtnRef.current.getBoundingClientRect());
    }
  });

  /* ─── Type picker ─── */

  const openPicker = useCallback(() => {
    saveScroll();
    if (iconBtnRef.current) {
      setIconRect(iconBtnRef.current.getBoundingClientRect());
    }
    setPickerOpen(true);
  }, [saveScroll]);

  const handleTypeSelect = useCallback(
    (newType) => {
      setPickerOpen(false);
      if (newType === calloutType) return;
      saveScroll();
      // The title is left as it is: an empty one shows the new type's name,
      // and writing that name would put a title in the file nobody typed.
      onUpdateBlock(noteId, blockIndex, { calloutType: newType, calloutTypeRaw: newType });
    },
    [calloutType, noteId, blockIndex, onUpdateBlock, saveScroll],
  );

  /* ─── Keyboard: title ─── */

  const handleTitleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        bodyRef.current?.focus();
        return;
      }
      if (e.key === "Backspace") {
        const titleEmpty = !titleRef.current?.textContent;
        const bodyEmpty = !domNodeToMarkdown(bodyRef.current).trim();
        if (titleEmpty && bodyEmpty && onDelete) {
          e.preventDefault();
          onDelete(blockIndex);
          return;
        }
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        onBlockNav?.(blockIndex, "prev");
        return;
      }
      // ↓ on the title's last line: into the body, or past it while folded.
      if (e.key === "ArrowDown" && !e.shiftKey) {
        const sel = window.getSelection();
        const el = titleRef.current;
        if (sel?.rangeCount && el) {
          const rect = caretRect(sel.getRangeAt(0), el);
          if (el.getBoundingClientRect().bottom - rect.bottom < 4) {
            e.preventDefault();
            if (foldable && foldedRef.current) onBlockNav?.(blockIndex, "next");
            else {
              bodyRef.current?.focus({ preventScroll: true });
              if (bodyRef.current) placeCaret(bodyRef.current, 0);
            }
            return;
          }
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onBlockNav?.(blockIndex, "next");
        return;
      }
    },
    [blockIndex, onBlockNav, onDelete, foldable],
  );

  /* ─── Keyboard: body ─── */

  const handleBodyKeyDown = useCallback(
    (e) => {
      if (e.key === "Backspace") {
        const bodyEmpty = !domNodeToMarkdown(bodyRef.current).trim();
        if (bodyEmpty) {
          e.preventDefault();
          titleRef.current?.focus();
          return;
        }
      }
      // Measured with `caretRect`, never the range's own rect: a caret on an
      // empty line has none, and read as the body's top or bottom edge.
      if (e.key === "ArrowUp") {
        // At first line → focus title
        const sel = window.getSelection();
        if (sel.rangeCount) {
          const range = sel.getRangeAt(0);
          const rect = caretRect(range, bodyRef.current);
          const containerRect = bodyRef.current.getBoundingClientRect();
          if (rect.top - containerRect.top < 4) {
            e.preventDefault();
            titleRef.current?.focus();
            return;
          }
        }
      }
      if (e.key === "ArrowDown") {
        // At last line → nav next
        const sel = window.getSelection();
        if (sel.rangeCount) {
          const range = sel.getRangeAt(0);
          const rect = caretRect(range, bodyRef.current);
          const containerRect = bodyRef.current.getBoundingClientRect();
          if (containerRect.bottom - rect.bottom < 4) {
            e.preventDefault();
            onBlockNav?.(blockIndex, "next");
            return;
          }
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onBlockNav?.(blockIndex, "next");
        return;
      }
    },
    [blockIndex, onBlockNav],
  );

  /* ─── Render ─── */

  const Icon = config.icon;

  return (
    <div
      ref={rootRef}
      className="callout-block"
      data-folded={isFolded || undefined}
      style={{
        // The type's ink, faint: part of the note, not a panel over it.
        background: withAlpha(theme.callouts[calloutType].colour, theme.calloutGround),
        borderRadius: 8,
        padding: "14px 18px",
        transition: "background var(--motion-fast), border-color var(--motion-fast)",
      }}
    >
      {/* Header row: icon + title */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          ref={iconBtnRef}
          role="button"
          aria-label="Change callout type"
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
          onClick={openPicker}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            saveScroll();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 4,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
            transition: "background var(--motion-fast)",
          }}
          className="callout-icon-btn"
        >
          <Icon size={17} color={theme.callouts[calloutType].colour} strokeWidth={1.8} />
        </div>
        <div
          ref={titleRef}
          contentEditable
          suppressContentEditableWarning
          data-placeholder={shownTitle(block, config)}
          onInput={handleTitleInput}
          onKeyDown={handleTitleKeyDown}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            // A foldable title is as wide as its words, the chevron after them.
            flex: foldable ? "0 1 auto" : 1,
            minWidth: 0,
            color: theme.callouts[calloutType].colour,
            fontWeight: 600,
            fontSize: rhythm.bodySize,
            outline: "none",
            lineHeight: 1.5,
            minHeight: "1lh",
          }}
          className="callout-title"
        />
        {foldable && (
          <>
            {/* A named button, not a Tab stop: Tab in a note goes to its
                sidebar row; the block menu is the keyboard's way. */}
            <button
              type="button"
              tabIndex={-1}
              className="callout-fold-btn"
              aria-expanded={!isFolded}
              aria-label={isFolded ? "Expand callout" : "Collapse callout"}
              onMouseDown={(e) => {
                // The caret stays where it is (or, folding, goes to the title).
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={() => setFold(!foldedRef.current)}
              style={{ color: theme.callouts[calloutType].colour }}
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
            {/* The rest of the row still edits the title, at its end. */}
            <div
              aria-hidden="true"
              style={{ flex: 1, alignSelf: "stretch", cursor: "text" }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const t = titleRef.current;
                if (!t) return;
                t.focus({ preventScroll: true });
                placeCaret(t, caretLength(t));
              }}
            />
          </>
        )}
      </div>

      {/* Body: folded, it slides shut and is out of reach (inert) from the
          first moment, so no caret, Tab or selection lands in it. */}
      <div
        className="callout-fold"
        data-folded={isFolded || undefined}
        data-moving={moving || undefined}
        inert={isFolded || undefined}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget) setMoving(false);
        }}
      >
        <div className="callout-fold-inner">
          <div
            ref={bodyRef}
            contentEditable
            suppressContentEditableWarning
            data-inline-field="callout-body"
            data-placeholder="Type callout content..."
            onInput={handleBodyInput}
            onKeyDown={handleBodyKeyDown}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              // The note's own words: the title and icon carry the type.
              color: theme.TEXT.primary,
              fontSize: rhythm.bodySize,
              lineHeight: rhythm.lineHeight,
              outline: "none",
              paddingLeft: 0,
              paddingTop: 4,
              minHeight: 20,
            }}
            className="callout-body"
          />
        </div>
      </div>

      {/* Type picker dropdown (portal to avoid scroll jump) */}
      {pickerOpen &&
        createPortal(
          <CalloutTypePicker
            activeType={calloutType}
            anchorRect={iconRect}
            onSelect={handleTypeSelect}
            onClose={() => setPickerOpen(false)}
          />,
          document.body,
        )}
    </div>
  );
});
