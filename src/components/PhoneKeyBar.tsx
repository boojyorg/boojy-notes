import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { TOUCH } from "../constants/layout";
import { sendCommand } from "../phone/commands";
import {
  CloseIcon,
  FormatIcon,
  HeadingIcon,
  RedoIcon,
  SlashCommandIcon,
  TextStyleIcon,
  UndoIcon,
} from "./Icons";
import {
  type BarMode,
  barModeAfterSelection,
  type Caret,
  headingCommand,
  kindCommand,
  litFormats,
  type Pending,
  promise,
} from "../phone/keyBar";

/**
 * The phone's bar above the keyboard: what the desktop does with keys and its
 * selection toolbar, in one row of touch targets. Three rows share the place:
 *
 *   blocks   ↶ ↷ H • 1. ☐ ⊞ / Aa   while typing
 *   format   ↶ ↷ B I S ▮ <> ⛓ ✕    Aa, or a selection (which opens it itself)
 *   heading  ↶ ↷ H1 … H6 ✕          H
 *
 * Undo and redo never move, and the ✕ that closes a row stands where Aa
 * opened it. The level a line already has is lit; tapping it makes the line
 * text again, as a lit list button does.
 *
 * Every button sends the desktop menu bar's command (`sendCommand`), so it
 * does what its key does; table and `/` are the slash menu's. A press never
 * takes the focus, so the caret and the keyboard stay. Shown only while the
 * keyboard is up with the caret in the note's text; the window shrinks above
 * the keyboard, so the bar's place at the foot of the note is on top of it.
 */
export default function PhoneKeyBar({
  editorRef,
  onTable,
  onSlash,
}: {
  editorRef: RefObject<HTMLElement | null>;
  onTable: () => void;
  onSlash: () => void;
}) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;
  const keyboardUp = useKeyboardUp();
  const [mode, setMode] = useState<BarMode>("blocks");
  // Aa was pressed: the format row stays after the selection collapses.
  const held = useRef(false);
  const [inText, setInText] = useState(false);
  // Bold or italic pressed with nothing selected (see `litFormats`).
  const pending = useRef<Pending | null>(null);
  const [active, setActive] = useState<{ formats: Set<string>; kind: string | null }>({
    formats: new Set(),
    kind: null,
  });

  useEffect(() => {
    const read = () => {
      const sel = window.getSelection();
      const root = editorRef.current;
      const node = sel?.anchorNode ?? null;
      const inside = !!(sel && root && node && root.contains(node));
      setInText(inside);
      if (!inside || !sel) return;
      setMode((m) => barModeAfterSelection(m, !sel.isCollapsed, held.current));
      setActive(readActive(sel, pending));
    };
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
  }, [editorRef]);

  // Each time the keyboard comes up the bar starts on its block buttons.
  const shown = keyboardUp && inText;
  useEffect(() => {
    if (shown) return;
    held.current = false;
    setMode("blocks");
  }, [shown]);

  if (!shown) return null;

  const run = (command: string) => () => {
    const sel = window.getSelection();
    const promised = (command === "bold" || command === "italic") && !!sel?.isCollapsed;
    const turnOn = !active.formats.has(command);
    sendCommand(command);
    // The command changed the text under the caret, or promised the next
    // letters a style; read what is on now.
    requestAnimationFrame(() => {
      const now = window.getSelection();
      if (promised && now)
        pending.current = promise(pending.current, caretOf(now), command, turnOn);
      if (now) setActive(readActive(now, pending));
    });
  };
  const show =
    (next: BarMode, hold = false) =>
    () => {
      held.current = hold;
      setMode(next);
    };

  const button = (
    key: string,
    label: string,
    glyph: ReactNode,
    onPress: () => void,
    lit = false,
  ) => (
    <button
      key={key}
      type="button"
      aria-label={label}
      aria-pressed={lit || undefined}
      tabIndex={-1}
      // The caret, the selection and the keyboard stay where they are.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className="press"
      style={{
        flex: "1 1 0",
        minWidth: 0,
        height: TOUCH,
        border: 0,
        borderRadius: 8,
        background: "none",
        color: lit ? ACCENT.text : TEXT.secondary,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        fontFamily: "inherit",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {glyph}
    </button>
  );

  const history = [
    button("undo", "Undo", <UndoIcon />, run("undo")),
    button("redo", "Redo", <RedoIcon />, run("redo")),
  ];
  const close = button("close", "Close", <CloseIcon size={18} />, show("blocks"));
  const kind = (k: string, label: string, glyph: ReactNode) =>
    button(k, label, glyph, run(kindCommand(k, active.kind)), active.kind === k);

  const rows: Record<BarMode, ReactNode[]> = {
    blocks: [
      ...history,
      button(
        "heading",
        "Heading",
        <HeadingIcon />,
        show("heading"),
        /^h[1-6]$/.test(active.kind ?? ""),
      ),
      kind("bullet", "Bulleted list", <SlashCommandIcon name="list" size={20} />),
      kind("numbered", "Numbered list", <SlashCommandIcon name="list-ordered" size={20} />),
      kind("checkbox", "Task", <SlashCommandIcon name="square-check" size={20} />),
      button("table", "Table", <SlashCommandIcon name="table" size={20} />, onTable),
      button(
        "slash",
        "More blocks",
        <span style={{ fontSize: 19, fontWeight: 400 }}>/</span>,
        onSlash,
      ),
      button("format", "Text style", <TextStyleIcon />, show("format", true)),
    ],
    format: [
      ...history,
      ...(["bold", "italic", "strikethrough", "highlight", "code", "link"] as const).map((f) =>
        button(
          f,
          FORMAT_LABELS[f],
          <FormatIcon name={f} size={18} />,
          run(f),
          active.formats.has(f),
        ),
      ),
      close,
    ],
    heading: [
      ...history,
      ...[1, 2, 3, 4, 5, 6].map((n) =>
        button(
          `h${n}`,
          `Heading ${n}`,
          `H${n}`,
          () => {
            run(headingCommand(n, active.kind))();
            setMode("blocks");
          },
          active.kind === `h${n}`,
        ),
      ),
      close,
    ],
  };

  return (
    <div
      data-testid="phone-key-bar"
      role="toolbar"
      aria-label="Formatting"
      style={{
        display: "flex",
        alignItems: "center",
        padding: "2px 4px",
        background: BG.standard,
        borderTop: `1px solid ${BG.divider}`,
        flexShrink: 0,
      }}
    >
      {rows[mode]}
    </div>
  );
}

const FORMAT_LABELS = {
  bold: "Bold",
  italic: "Italic",
  strikethrough: "Strikethrough",
  highlight: "Highlight",
  code: "Inline code",
  link: "Link",
};

const caretOf = (sel: Selection): Caret => ({
  node: sel.anchorNode,
  offset: sel.anchorOffset,
  collapsed: sel.isCollapsed,
});

/** What is on at the caret: the text styles around it (and any it was promised), and its block's kind. */
function readActive(
  sel: Selection,
  pending: { current: Pending | null },
): { formats: Set<string>; kind: string | null } {
  const node = sel.anchorNode;
  const el = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement;
  const around = new Set<string>();
  if (el) {
    if (el.closest("strong, b")) around.add("bold");
    if (el.closest("em, i")) around.add("italic");
    if (el.closest("s, del")) around.add("strikethrough");
    if (el.closest("mark")) around.add("highlight");
    if (el.closest("code")) around.add("code");
    if (el.closest("a")) around.add("link");
  }
  const lit = litFormats(around, pending.current, caretOf(sel));
  pending.current = lit.pending;
  const kind = el?.closest("[data-block-type]")?.getAttribute("data-block-type") ?? null;
  return { formats: lit.formats, kind };
}

/** The keyboard is up when the window has shrunk well below its tallest. */
function useKeyboardUp() {
  const tallest = useRef(window.innerHeight);
  const [up, setUp] = useState(false);
  useEffect(() => {
    const read = () => {
      tallest.current = Math.max(tallest.current, window.innerHeight);
      setUp(window.innerHeight < tallest.current - 150);
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return up;
}
