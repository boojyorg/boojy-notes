import { useState, useRef, useEffect, useCallback, useLayoutEffect, memo } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../hooks/useTheme";
import { latestBlock, useOwnedField } from "../hooks/useOwnedField";
import { Z } from "../constants/zIndex";
import { inlineMarkdownToHtml, domNodeToMarkdown } from "../utils/inlineFormatting";
import { caretLength, getCaretOffset, placeCaret } from "../utils/domHelpers";
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
} from "lucide-react";

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
  abstract: {
    icon: FileText,
    defaultTitle: "Abstract",
  },
};

const CALLOUT_TYPE_KEYS = Object.keys(CALLOUT_TYPES);

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

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((p) => Math.min(p + 1, CALLOUT_TYPE_KEYS.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((p) => Math.max(p - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onSelect(CALLOUT_TYPE_KEYS[focusIdx]);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusIdx, onSelect, onClose]);

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
        aria-label="Callout type picker"
        style={{
          position: "fixed",
          zIndex: Z.TOAST,
          ...style,
          width: 180,
          maxHeight: 320,
          overflowY: "auto",
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: 8,
          padding: "4px 0",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
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
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(key)}
              onMouseEnter={() => setFocusIdx(idx)}
              className="callout-picker-item"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                cursor: "pointer",
                background: isFocused ? BG.surface : "transparent",
                transition: "background 0.1s",
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
  onUpdateCallout,
  onUpdateText,
  onUpdateTitle,
  onBlockNav,
  onDelete,
}) {
  const titleRef = useRef(null);
  const bodyRef = useRef(null);
  const iconBtnRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [iconRect, setIconRect] = useState(null);

  const { theme } = useTheme();

  const scrollRestoreRef = useRef(null);

  const calloutType = block.calloutType || "note";
  const config = CALLOUT_TYPES[calloutType] || CALLOUT_TYPES.note;

  const saveScroll = useCallback(() => {
    const scrollEl = iconBtnRef.current?.closest(".editor-scroll");
    if (scrollEl) scrollRestoreRef.current = { el: scrollEl, top: scrollEl.scrollTop };
  }, []);

  /* ─── The two fields ─── */

  // Both are the browser's while typed into and commit on every input at
  // the text grain; state paints them only when they do not already hold
  // its text (useOwnedField). The title is plain text: a newline cannot
  // live in the marker line, so Enter and Shift+Enter move to the body.
  // The body is inline Markdown, read back with the editor's own reader;
  // read as innerText it lost every `**bold**`, `[[link]]` and backtick on
  // the first click in and out (review 2026-09-07, §3.2).
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

  const handleTitleInput = useCallback(() => {
    onUpdateTitle(noteId, blockIndex, titleRef.current?.textContent || "");
  }, [noteId, blockIndex, onUpdateTitle]);

  const handleBodyInput = useCallback(() => {
    onUpdateText(noteId, blockIndex, domNodeToMarkdown(bodyRef.current));
  }, [noteId, blockIndex, onUpdateText]);

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
      const oldConfig = CALLOUT_TYPES[calloutType] || CALLOUT_TYPES.note;
      const newConfig = CALLOUT_TYPES[newType] || CALLOUT_TYPES.note;
      const updates = { calloutType: newType, calloutTypeRaw: newType };
      // If title matches the old default, update to new default
      const currentTitle = block.title || "";
      if (!currentTitle || currentTitle === oldConfig.defaultTitle) {
        updates.title = newConfig.defaultTitle;
      }
      onUpdateCallout(noteId, blockIndex, updates);
    },
    [calloutType, block.title, noteId, blockIndex, onUpdateCallout, saveScroll],
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
      if (e.key === "Escape") {
        e.preventDefault();
        onBlockNav?.(blockIndex, "next");
        return;
      }
    },
    [blockIndex, onBlockNav, onDelete],
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
      if (e.key === "ArrowUp") {
        // At first line → focus title
        const sel = window.getSelection();
        if (sel.rangeCount) {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
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
          const rect = range.getBoundingClientRect();
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
      className="callout-block"
      style={{
        background: theme.callouts[calloutType].bg,
        borderRadius: 8,
        padding: "14px 18px",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      {/* Header row: icon + title */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          ref={iconBtnRef}
          role="button"
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
            transition: "background 0.15s",
          }}
          className="callout-icon-btn"
        >
          <Icon size={17} color={theme.callouts[calloutType].colour} strokeWidth={1.8} />
        </div>
        <div
          ref={titleRef}
          contentEditable
          suppressContentEditableWarning
          data-placeholder={config.defaultTitle}
          onInput={handleTitleInput}
          onKeyDown={handleTitleKeyDown}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            color: theme.callouts[calloutType].colour,
            fontWeight: 600,
            fontSize: 14,
            outline: "none",
            lineHeight: 1.5,
            minHeight: 21,
          }}
          className="callout-title"
        />
      </div>

      {/* Body */}
      <div
        ref={bodyRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Type callout content..."
        onInput={handleBodyInput}
        onKeyDown={handleBodyKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          color: theme.TEXT.secondary,
          fontSize: 14,
          lineHeight: 1.7,
          outline: "none",
          paddingLeft: 0,
          marginTop: 4,
          minHeight: 20,
        }}
        className="callout-body"
      />

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
