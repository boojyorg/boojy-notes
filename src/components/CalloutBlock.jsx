import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { TEXT, BG } from "../constants/colors";
import { inlineMarkdownToHtml } from "../utils/inlineFormatting";
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
    colour: "#7AA2F7",
    bg: "#3f4e74",
    border: "rgba(122,162,247,0.18)",
    defaultTitle: "Note",
  },
  info: {
    icon: Info,
    colour: "#89DDFF",
    bg: "#446277",
    border: "rgba(137,221,255,0.18)",
    defaultTitle: "Info",
  },
  tip: {
    icon: Lightbulb,
    colour: "#9ECE6A",
    bg: "#4c5e43",
    border: "rgba(158,206,106,0.18)",
    defaultTitle: "Tip",
  },
  warning: {
    icon: AlertTriangle,
    colour: "#E0AF68",
    bg: "#635242",
    border: "rgba(224,175,104,0.18)",
    defaultTitle: "Warning",
  },
  danger: {
    icon: ShieldAlert,
    colour: "#F7768E",
    bg: "#6b3d4f",
    border: "rgba(247,118,142,0.18)",
    defaultTitle: "Danger",
  },
  success: {
    icon: CheckCircle2,
    colour: "#9ECE6A",
    bg: "#4c5e43",
    border: "rgba(158,206,106,0.18)",
    defaultTitle: "Success",
  },
  question: {
    icon: HelpCircle,
    colour: "#BB9AF7",
    bg: "#564b74",
    border: "rgba(187,154,247,0.18)",
    defaultTitle: "Question",
  },
  quote: {
    icon: Quote,
    colour: "#9B9EB0",
    bg: "#4c4c5a",
    border: "rgba(155,158,176,0.18)",
    defaultTitle: "Quote",
  },
  example: {
    icon: ListChecks,
    colour: "#BB9AF7",
    bg: "#564b74",
    border: "rgba(187,154,247,0.18)",
    defaultTitle: "Example",
  },
  bug: {
    icon: Bug,
    colour: "#F7768E",
    bg: "#6b3d4f",
    border: "rgba(247,118,142,0.18)",
    defaultTitle: "Bug",
  },
  abstract: {
    icon: FileText,
    colour: "#89DDFF",
    bg: "#446277",
    border: "rgba(137,221,255,0.18)",
    defaultTitle: "Abstract",
  },
};

const CALLOUT_TYPE_KEYS = Object.keys(CALLOUT_TYPES);

/* ─── Type picker dropdown ─── */

function CalloutTypePicker({ activeType, onSelect, anchorRect, onClose }) {
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
        style={{ position: "fixed", inset: 0, zIndex: 9998 }}
      />
      <div
        ref={listRef}
        className="callout-picker"
        style={{
          position: "fixed",
          zIndex: 9999,
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
                background: isFocused ? BG.hover : "transparent",
                transition: "background 0.1s",
              }}
            >
              <Icon size={15} color={cfg.colour} strokeWidth={1.8} />
              <span style={{ flex: 1, fontSize: 13, color: TEXT.primary }}>{cfg.defaultTitle}</span>
              {isActive && <span style={{ fontSize: 13, color: cfg.colour }}>&#10003;</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ─── CalloutBlock ─── */

export default function CalloutBlock({
  block,
  noteId,
  blockIndex,
  onUpdateCallout,
  onBlockNav,
  onDelete,
}) {
  const titleRef = useRef(null);
  const bodyRef = useRef(null);
  const iconBtnRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [iconRect, setIconRect] = useState(null);

  const scrollRestoreRef = useRef(null);

  const calloutType = block.calloutType || "note";
  const config = CALLOUT_TYPES[calloutType] || CALLOUT_TYPES.note;

  const saveScroll = useCallback(() => {
    const scrollEl = iconBtnRef.current?.closest(".editor-scroll");
    if (scrollEl) scrollRestoreRef.current = { el: scrollEl, top: scrollEl.scrollTop };
  }, []);

  /* ─── Sync contentEditable from block data ─── */

  useLayoutEffect(() => {
    if (titleRef.current) {
      const titleText = block.title || "";
      if (titleRef.current.textContent !== titleText) {
        titleRef.current.textContent = titleText;
      }
    }
  }, [block.title]);

  useLayoutEffect(() => {
    if (bodyRef.current) {
      const html = block.text ? inlineMarkdownToHtml(block.text) : "";
      if (bodyRef.current.innerHTML !== html) {
        bodyRef.current.innerHTML = html || "<br>";
      }
    }
  }, [block.text]);

  /* ─── Scroll restoration (runs after DOM sync, before paint) ─── */

  useLayoutEffect(() => {
    if (!scrollRestoreRef.current) return;
    const { el, top } = scrollRestoreRef.current;
    scrollRestoreRef.current = null;
    el.scrollTop = top;
    if (pickerOpen && iconBtnRef.current) {
      setIconRect(iconBtnRef.current.getBoundingClientRect());
    }
  });

  /* ─── Commit helpers ─── */

  const commitTitle = useCallback(() => {
    if (!titleRef.current) return;
    const val = titleRef.current.textContent || "";
    if (val !== (block.title || "")) {
      onUpdateCallout(noteId, blockIndex, { title: val });
    }
  }, [noteId, blockIndex, block.title, onUpdateCallout]);

  const commitBody = useCallback(() => {
    if (!bodyRef.current) return;
    const val = bodyRef.current.innerText || "";
    if (val !== (block.text || "")) {
      onUpdateCallout(noteId, blockIndex, { text: val });
    }
  }, [noteId, blockIndex, block.text, onUpdateCallout]);

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
        commitTitle();
        bodyRef.current?.focus();
        return;
      }
      if (e.key === "Backspace") {
        const titleEmpty = !titleRef.current?.textContent;
        const bodyEmpty = !bodyRef.current?.innerText?.trim();
        if (titleEmpty && bodyEmpty && onDelete) {
          e.preventDefault();
          onDelete(blockIndex);
          return;
        }
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        commitTitle();
        onBlockNav?.(blockIndex, "prev");
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        commitTitle();
        onBlockNav?.(blockIndex, "next");
        return;
      }
    },
    [blockIndex, commitTitle, onBlockNav, onDelete],
  );

  /* ─── Keyboard: body ─── */

  const handleBodyKeyDown = useCallback(
    (e) => {
      if (e.key === "Backspace") {
        const bodyEmpty = !bodyRef.current?.innerText?.trim();
        if (bodyEmpty) {
          e.preventDefault();
          commitBody();
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
            commitBody();
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
            commitBody();
            onBlockNav?.(blockIndex, "next");
            return;
          }
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        commitBody();
        onBlockNav?.(blockIndex, "next");
        return;
      }
    },
    [blockIndex, commitBody, onBlockNav],
  );

  /* ─── Render ─── */

  const Icon = config.icon;

  return (
    <div
      className="callout-block"
      style={{
        background: config.bg,
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
          <Icon size={17} color={config.colour} strokeWidth={1.8} />
        </div>
        <div
          ref={titleRef}
          contentEditable
          suppressContentEditableWarning
          data-placeholder={config.defaultTitle}
          onBlur={commitTitle}
          onKeyDown={handleTitleKeyDown}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            color: config.colour,
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
        onBlur={commitBody}
        onKeyDown={handleBodyKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          color: "rgba(232,234,240,0.7)",
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
}
