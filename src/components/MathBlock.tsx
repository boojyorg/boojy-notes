import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { latestBlock, useOwnedField } from "../hooks/useOwnedField";
import { useExitGhost } from "../hooks/useExitGhost";
import { Tooltip, useTooltip } from "./Tooltip";
import { SlashCommandIcon } from "./Icons";
import { registerMathOpener } from "../utils/mathOpen";
import { renderFormula } from "../utils/katexRender";
import { bandFill, BAND_REACH } from "../utils/selectionBand";
import { MENU_RADIUS } from "../constants/layout";
import { Z } from "../constants/zIndex";
import { isMac } from "../utils/platform";
import { cssZoom, revealInNote } from "../utils/domHelpers";
import { useLatexCompletion } from "../hooks/useLatexCompletion";
import LatexMenu from "./LatexMenu";

const SHIFT_ENTER = isMac ? "⇧↵" : "Shift+Enter";
const MONO = "'SF Mono', 'Fira Code', 'Cascadia Code', monospace";

interface MathBlockProps {
  block: { id: string; type: "math"; text?: string };
  noteId: string;
  blockIndex: number;
  syncGen: number;
  noteDataRef: unknown;
  isSelected: boolean;
  accentColor: string;
  onUpdateText: (noteId: string, blockIndex: number, text: string) => void;
  onBlockNav: (blockIndex: number, direction: "prev" | "next") => void;
  onSelect: () => void;
  onDelete: (blockIndex: number) => void;
}

/**
 * A `$$` block: the formula drawn where it sits, never moving. A click (or
 * Enter on the selected block) opens its source in a panel underneath, over
 * the text below, and the drawing follows every keystroke. Enter is a new
 * line; Shift+Enter, Escape, Done or a click away finishes, leaving the block
 * selected; ↑ on the first line and ↓ on the last walk out of it.
 *
 * The panel lives inside the block's root, so it scrolls with the note and
 * its keys reach the app as the editor's (Cmd+Z is the note's undo). Every
 * input commits through the text grain, like a code block's; finishing
 * commits nothing.
 */
export default memo(function MathBlock({
  block,
  noteId,
  blockIndex,
  syncGen,
  noteDataRef,
  isSelected,
  accentColor,
  onUpdateText,
  onBlockNav,
  onSelect,
  onDelete,
}: MathBlockProps) {
  const { theme } = useTheme();
  const { BG, TEXT, SEMANTIC } = theme;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // What the field holds while it is ahead of the note's ref: the drawing follows it.
  const [draft, setDraft] = useState<string | null>(null);

  // An undo, a redo or an outside change: the note's text is the truth again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the generation is the signal
  useEffect(() => setDraft(null), [syncGen]);

  const committed =
    (latestBlock(noteDataRef, noteId, block) as { text?: string } | undefined)?.text ??
    block.text ??
    "";
  const source = draft ?? committed;
  const rendered = useMemo(() => renderFormula(source), [source]);
  // The last formula that drew: shown, faded, while the source can't be.
  const lastGood = useRef("");
  if ("html" in rendered) lastGood.current = rendered.html;
  const error = "error" in rendered ? rendered.error : null;

  const openSource = useCallback(() => setOpen(true), []);
  useLayoutEffect(() => registerMathOpener(block.id, openSource), [block.id, openSource]);

  /** Close, leaving the block selected and the editor holding the keys. */
  const finish = useCallback(() => {
    setOpen(false);
    setDraft(null);
    onSelect();
    const editor = rootRef.current?.closest<HTMLElement>("[data-editor]");
    editor?.focus({ preventScroll: true });
  }, [onSelect]);

  const leave = useCallback(
    (direction: "prev" | "next") => {
      // The field is about to go, focus with it: the editor takes the keys
      // first, so a neighbour that is only selected (another formula, a
      // divider) still hears the next Enter; a text neighbour then places its caret.
      rootRef.current?.closest<HTMLElement>("[data-editor]")?.focus({ preventScroll: true });
      setOpen(false);
      setDraft(null);
      onBlockNav(blockIndex, direction);
    },
    [blockIndex, onBlockNav],
  );

  // A press anywhere else closes, and is not swallowed: it lands where it was aimed.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setDraft(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const empty = !source.trim();
  const shown = "html" in rendered ? rendered.html : lastGood.current;

  return (
    <div
      ref={rootRef}
      className={`math-block${open ? " math-block-open" : ""}`}
      // No `data-selection-surface`: a press on the formula opens it, and like
      // any press off a selected block's surface it clears the selection.
      onInput={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      style={{
        position: "relative",
        margin: `0 -${BAND_REACH}px`,
        padding: `6px ${BAND_REACH + 4}px`,
        borderRadius: 8,
        background: isSelected ? bandFill(accentColor, theme.name) : undefined,
      }}
    >
      <div
        role="button"
        tabIndex={-1}
        aria-label="Edit formula"
        onMouseDown={(e) => {
          // The editor would put a caret here; the formula is not text.
          if (e.button === 0) e.preventDefault();
        }}
        onClick={() => setOpen(true)}
        style={{ cursor: "text", overflowX: "auto", overflowY: "hidden", color: TEXT.primary }}
      >
        {empty ? (
          // An invitation, not a state: the slash menu's Σ and what a click does.
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              color: TEXT.muted,
              fontSize: 14,
              padding: "6px 0",
            }}
          >
            <SlashCommandIcon name="sigma" />
            Add a LaTeX formula
          </div>
        ) : shown ? (
          <div
            className="math-render"
            style={{ opacity: error ? 0.45 : 1 }}
            dangerouslySetInnerHTML={{ __html: shown }}
          />
        ) : null}
        {error && (
          <div
            role="status"
            style={{
              display: "flex",
              gap: 7,
              alignItems: "baseline",
              justifyContent: "center",
              fontSize: 12.5,
              color: TEXT.muted,
              padding: "2px 0",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: SEMANTIC.error,
                flex: "none",
                transform: "translateY(-1px)",
              }}
            />
            {shown ? `Showing the last version that worked. ${error}` : error}
          </div>
        )}
      </div>
      {open && (
        <SourcePanel
          block={block}
          noteId={noteId}
          syncGen={syncGen}
          noteDataRef={noteDataRef}
          text={committed}
          surface={{ bg: BG.elevated, border: BG.divider, shadow: theme.modalShadow }}
          ink={TEXT.primary}
          onChange={(value) => {
            setDraft(value);
            onUpdateText(noteId, blockIndex, value);
          }}
          onFinish={finish}
          onLeave={leave}
          onDeleteEmpty={() => {
            setOpen(false);
            onDelete(blockIndex);
          }}
        />
      )}
    </div>
  );
});

interface SourcePanelProps {
  block: { id: string; text?: string };
  noteId: string;
  syncGen: number;
  noteDataRef: unknown;
  text: string;
  surface: { bg: string; border: string; shadow: string };
  ink: string;
  onChange: (value: string) => void;
  onFinish: () => void;
  onLeave: (direction: "prev" | "next") => void;
  onDeleteEmpty: () => void;
}

/** The source under the formula: its own field, mounted while open. */
function SourcePanel({
  block,
  noteId,
  syncGen,
  noteDataRef,
  text,
  surface,
  ink,
  onChange,
  onFinish,
  onLeave,
  onDeleteEmpty,
}: SourcePanelProps) {
  const { theme } = useTheme();
  const panelRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const tip = useTooltip();
  useExitGhost(panelRef);

  /**
   * The whole panel on screen, the note scrolled by the least it must. Its
   * resting height, not the rect: it arrives growing in (`motion-pop`).
   */
  const reveal = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const { top } = panel.getBoundingClientRect();
    revealInNote({ top, bottom: top + panel.offsetHeight * (cssZoom(panel) || 1) });
  }, []);

  const fitHeight = useCallback(() => {
    const ta = fieldRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  // Painted the way every special field is (useOwnedField): on mount and on
  // an undo, from the note's ref, never from a render behind the field.
  useOwnedField(fieldRef, {
    text,
    syncGen,
    latest: () =>
      (latestBlock(noteDataRef, noteId, block) as { text?: string } | undefined)?.text ?? "",
    read: (el: HTMLTextAreaElement) => el.value,
    paint: (el: HTMLTextAreaElement, value: string) => {
      el.value = value;
      fitHeight();
    },
  });

  // Opened with the caret at the end of the source, nothing selected.
  useLayoutEffect(() => {
    const ta = fieldRef.current;
    if (!ta) return;
    ta.focus({ preventScroll: true });
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    fitHeight();
    reveal();
  }, [fitHeight, reveal]);

  /** What the field holds now, committed and shown. */
  const commitField = () => {
    const ta = fieldRef.current;
    if (!ta) return;
    fitHeight();
    reveal();
    onChange(ta.value);
  };
  const latex = useLatexCompletion(fieldRef, commitField);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    // Undo and redo are the note's, at the grain the field commits at.
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && (k === "z" || k === "y")) return;
    e.stopPropagation();
    // The `\` menu first, while it is offering.
    if (latex.onKeyDown(e)) return;
    const collapsed = ta.selectionStart === ta.selectionEnd;
    if (e.key === "Escape" || (e.key === "Enter" && e.shiftKey)) {
      e.preventDefault();
      onFinish();
    } else if (
      e.key === "ArrowUp" &&
      collapsed &&
      !e.shiftKey &&
      !ta.value.slice(0, ta.selectionStart).includes("\n")
    ) {
      e.preventDefault();
      onLeave("prev");
    } else if (
      e.key === "ArrowDown" &&
      collapsed &&
      !e.shiftKey &&
      !ta.value.slice(ta.selectionEnd).includes("\n")
    ) {
      e.preventDefault();
      onLeave("next");
    } else if (e.key === "Backspace" && ta.value === "") {
      e.preventDefault();
      onDeleteEmpty();
    }
  };

  return (
    <div
      ref={panelRef}
      className="motion-pop motion-from-top math-source"
      style={{
        position: "absolute",
        zIndex: Z.ELEMENT_OVERLAY,
        top: "calc(100% + 6px)",
        left: 0,
        right: 0,
        display: "flex",
        alignItems: "flex-start",
        background: surface.bg,
        border: `1px solid ${surface.border}`,
        borderRadius: MENU_RADIUS,
        boxShadow: surface.shadow,
      }}
    >
      <textarea
        ref={fieldRef}
        aria-label="Formula source"
        placeholder={"Try x^2 or \\frac{a}{b}"}
        rows={1}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        onChange={() => {
          commitField();
          latex.refresh();
        }}
        onSelect={latex.refresh}
        onKeyDown={onKeyDown}
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          border: 0,
          outline: "none",
          resize: "none",
          overflow: "hidden",
          background: "transparent",
          color: ink,
          font: `13.5px/1.6 ${MONO}`,
          padding: "10px 14px",
          margin: 0,
        }}
      />
      {/* Centred on the first line of source: 10px of padding and half a 21.6px line. */}
      <button
        ref={doneRef}
        type="button"
        className="settings-button math-done"
        aria-keyshortcuts="Shift+Enter"
        {...tip.handlers}
        onMouseDown={(e) => {
          // The field keeps focus until Done has acted.
          e.preventDefault();
          tip.handlers.onMouseDown();
        }}
        onClick={onFinish}
        style={{
          flex: "none",
          height: 28,
          margin: "7px 6px 6px 0",
          padding: "0 10px",
          borderRadius: 8,
          border: `1px solid ${theme.button.border}`,
          background: theme.button.bg,
          color: ink,
          fontSize: 12.5,
          fontWeight: 500,
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        Done
      </button>
      {tip.shown && <Tooltip label="Done" shortcut={SHIFT_ENTER} anchor={doneRef.current} />}
      <LatexMenu completion={latex} />
    </div>
  );
}
