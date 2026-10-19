import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTheme } from "../hooks/useTheme";
import { TOUCH } from "../constants/layout";
import { headingStyle, useRhythm } from "../tokens/rhythm";
import { sendCommand } from "../phone/commands";
import { drifted, HOLD_MS } from "../utils/holdGesture";
import { INLINE_FIELD_SELECTOR, TYPING_STYLE_MOVED } from "../utils/inlineFormatCommands";
import {
  CloseIcon,
  FormatIcon,
  HeadingIcon,
  IndentIcon,
  ListsIcon,
  MoreBlocksIcon,
  OutdentIcon,
  RedoIcon,
  SlashCommandIcon,
  TextStyleIcon,
  UndoIcon,
} from "./Icons";
import { Tooltip } from "./Tooltip";
import {
  type BarMode,
  barModeAfterSelection,
  barReach,
  type Caret,
  headingCommand,
  isListKind,
  keyboardUp,
  kindCommand,
  litFormats,
  notHere,
  type Pending,
  promise,
  type Reach,
  rowContents,
  shownRow,
} from "../phone/keyBar";

/**
 * The phone's bar above the keyboard: what the desktop does with keys and its
 * selection toolbar, in one row of touch targets. Five rows share the place:
 *
 *   blocks   ↶ ↷ H ≡ Aa       ⊞      while typing
 *   list     ↶ ↷ • 1. ☐ ⇤ ⇥   ✕      ≡, or the caret in a list item (by itself)
 *   format   ↶ ↷ B I S ▮ <> ⛓ ✕      Aa, or a selection (by itself)
 *   heading  ↶ ↷ H1 … H6      ✕      H
 *   more     ↶ ↷ ⊞ ❝ <> —     ✕      ⊞: the blocks the other rows lack
 *
 * Every button takes one of `SLOTS` equal slots, so nothing moves from row to
 * row; the right end is more or close (⊞, or ✕). The kind a line already has
 * is lit; tapping it makes the line text again. ⇤ ⇥ are Tab and Shift+Tab,
 * greyed where Tab would move nothing. The list row's ✕ puts it away until
 * the caret leaves the list. In a block with its own field, what cannot act
 * there greys (`barReach`). A typed `/` is still the slash menu's.
 *
 * Tap acts, hold explains: a finger kept on a button names it in a chip
 * above (a button that opens a row, with what it holds), and lifting after a
 * hold does nothing (`useHoldToExplain`). A greyed button says why.
 *
 * Every button sends the desktop menu bar's command (`sendCommand`), so it
 * does what its key does; table, code and divider are the slash menu's
 * (`onInsert`). A press never
 * takes the focus, so the caret and the keyboard stay. Shown only while the
 * keyboard is up with the caret in the note's text; the window shrinks above
 * the keyboard, so the bar's place at the foot of the note is on top of it.
 * `always` drops the wait for the keyboard (the web build's `?keybar`).
 */
export default function PhoneKeyBar({
  editorRef,
  onInsert,
  canIndent,
  always = false,
}: {
  editorRef: RefObject<HTMLElement | null>;
  onInsert: (command: "table" | "code" | "divider") => void;
  canIndent: (delta: 1 | -1) => boolean;
  always?: boolean;
}) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;
  const rhythm = useRhythm();
  const keyboardUp = useKeyboardUp();
  // The row opened by hand; "blocks" leaves it to the caret (`shownRow`).
  const [mode, setMode] = useState<BarMode>("blocks");
  // Aa was pressed: the format row stays after the selection collapses.
  const held = useRef(false);
  // The list row's ✕, until the caret leaves the list.
  const [dismissed, setDismissed] = useState(false);
  const [inText, setInText] = useState(false);
  // Bold or italic pressed with nothing selected (see `litFormats`).
  const pending = useRef<Pending | null>(null);
  const [active, setActive] = useState<Active>({
    formats: new Set(),
    kind: null,
    reach: barReach(null, false),
    indent: false,
    outdent: false,
  });
  const indentable = useRef(canIndent);
  indentable.current = canIndent;
  // What the caret is in now: run on every selection change and after each press.
  const read = useRef(() => {});

  useEffect(() => {
    read.current = () => {
      const sel = window.getSelection();
      const root = editorRef.current;
      const node = sel?.anchorNode ?? null;
      const inside = !!(sel && root && node && root.contains(node));
      setInText(inside);
      if (!inside || !sel) return;
      const now = readActive(sel, pending);
      const inList = isListKind(now.kind);
      if (!inList) setDismissed(false);
      setMode((m) => barModeAfterSelection(m, !sel.isCollapsed, held.current, inList));
      setActive({
        ...now,
        indent: inList && indentable.current(1),
        outdent: inList && indentable.current(-1),
      });
    };
    const onSelection = () => read.current();
    // The editor moved a promised style with the caret (a space typed first
    // after bold was turned on goes before the bold): the promise moves too.
    const follow = () => {
      const sel = window.getSelection();
      if (pending.current && sel)
        pending.current = { ...pending.current, node: sel.anchorNode, offset: sel.anchorOffset };
    };
    document.addEventListener("selectionchange", onSelection);
    document.addEventListener(TYPING_STYLE_MOVED, follow);
    return () => {
      document.removeEventListener("selectionchange", onSelection);
      document.removeEventListener(TYPING_STYLE_MOVED, follow);
    };
  }, [editorRef]);

  const explain = useHoldToExplain();
  const refuseTouches = useCallback((bar: HTMLDivElement | null) => {
    if (!bar) return;
    // The bar takes its touches whole: left to Android, a long press focused
    // the button, which closed the keyboard and the bar with it, and opened
    // the system's menu. A tap acts at its lift instead (`holdFor`).
    const refuse = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    bar.addEventListener("touchstart", refuse, { passive: false });
    return () => bar.removeEventListener("touchstart", refuse);
  }, []);

  // Each time the keyboard comes up the bar starts on its block buttons.
  const shown = (keyboardUp || always) && inText;
  const hideChip = explain.hide;
  useEffect(() => {
    if (shown) return;
    held.current = false;
    setMode("blocks");
    setDismissed(false);
    hideChip();
  }, [shown, hideChip]);

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
      read.current();
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
    {
      lit = false,
      disabled = false,
      look,
      mark,
    }: { lit?: boolean; disabled?: boolean; look?: CSSProperties; mark?: ReactNode } = {},
  ) => (
    <button
      key={key}
      type="button"
      aria-label={label}
      aria-pressed={lit || undefined}
      // Not `disabled`: a press on that falls through and the editor loses the keyboard.
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      // The caret, the selection and the keyboard stay where they are.
      onMouseDown={(e) => e.preventDefault()}
      {...explain.holdFor(
        disabled
          ? { key, label, note: notHere(active.kind) }
          : { key, label, detail: rowContents(key), look, mark },
        disabled ? undefined : onPress,
      )}
      className="press"
      style={{
        flex: `0 0 calc(100% / ${SLOTS})`,
        minWidth: 0,
        height: TOUCH,
        border: 0,
        borderRadius: 8,
        background: "none",
        color: lit ? ACCENT.text : disabled ? TEXT.muted : TEXT.secondary,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        fontFamily: "inherit",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        // A hold is the bar's: no selection, no system menu.
        userSelect: "none",
        WebkitTouchCallout: "none",
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
  const inList = isListKind(active.kind);
  const kinds = !active.reach.kinds;
  // A hold's label is drawn as what the button makes: a heading at its size,
  // Bold in bold, a list item with the editor's marker before it.
  const mono = "'SF Mono', 'Fira Code', monospace";
  const looks: Record<string, CSSProperties> = {
    bold: { fontWeight: 700 },
    italic: { fontStyle: "italic" },
    strikethrough: { textDecoration: "line-through" },
    highlight: { background: theme.mark.bg, borderRadius: 2, padding: "0 2px" },
    code: {
      fontFamily: mono,
      background: theme.inlineCode.bg,
      border: `1px solid ${theme.inlineCode.border}`,
      borderRadius: 3,
      padding: "0 4px",
    },
    link: { color: theme.link.color, textDecoration: "underline" },
  };
  const headingLook = (n: number): CSSProperties => {
    const { fontSize, fontWeight, letterSpacing } = headingStyle(
      `h${n}` as "h1",
      rhythm,
    ) as CSSProperties;
    return { fontSize, fontWeight, letterSpacing };
  };
  // A new task is unticked, so its box is empty: the label shows what the tap makes.
  const listMarks: Record<string, ReactNode> = {
    bullet: <span style={{ width: 6, height: 6, borderRadius: "50%", background: TEXT.primary }} />,
    numbered: <span style={{ color: TEXT.secondary }}>1.</span>,
    checkbox: (
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 3.5,
          border: `1.5px solid ${TEXT.muted}`,
          boxSizing: "border-box",
        }}
      />
    ),
  };
  const kind = (k: string, label: string, glyph: ReactNode) =>
    button(k, label, glyph, run(kindCommand(k, active.kind)), {
      lit: active.kind === k,
      disabled: kinds,
      mark: listMarks[k],
    });
  // A choice in a row opened for one choice closes it.
  const once = (onPress: () => void) => () => {
    onPress();
    setMode("blocks");
  };
  const insert = (
    command: "table" | "code" | "divider",
    label: string,
    glyph: string,
    look?: CSSProperties,
  ) =>
    button(
      command,
      label,
      <SlashCommandIcon name={glyph} size={20} />,
      once(() => onInsert(command)),
      { look },
    );

  // Each row: the buttons from the left, then its last group at the right end.
  const rows: Record<BarMode, [ReactNode[], ReactNode[]]> = {
    blocks: [
      [
        ...history,
        button("heading", "Headings", <HeadingIcon />, show("heading"), {
          lit: /^h[1-6]$/.test(active.kind ?? ""),
          disabled: kinds,
        }),
        button("lists", "Lists", <ListsIcon />, show("list"), { lit: inList, disabled: kinds }),
        button("format", "Text style", <TextStyleIcon />, show("format", true), {
          disabled: !active.reach.styles,
        }),
      ],
      [button("more", "More blocks", <MoreBlocksIcon />, show("more"))],
    ],
    more: [
      [
        ...history,
        insert("table", "Table", "table"),
        button(
          "blockquote",
          "Quote",
          <SlashCommandIcon name="text-quote" size={20} />,
          once(run(kindCommand("blockquote", active.kind))),
          {
            lit: active.kind === "blockquote",
            disabled: kinds,
            look: { borderLeft: `3px solid ${ACCENT.primary}`, paddingLeft: 8 },
          },
        ),
        insert("code", "Code block", "code", { fontFamily: mono }),
        insert("divider", "Divider", "minus"),
      ],
      [close],
    ],
    list: [
      [
        ...history,
        kind("bullet", "Bullet list", <SlashCommandIcon name="list" size={20} />),
        kind("numbered", "Numbered list", <SlashCommandIcon name="list-ordered" size={20} />),
        kind("checkbox", "To-do list", <SlashCommandIcon name="square-check" size={20} />),
        button("outdent", "Outdent", <OutdentIcon />, run("outdent"), {
          disabled: !active.outdent,
        }),
        button("indent", "Indent", <IndentIcon />, run("indent"), { disabled: !active.indent }),
      ],
      [
        button("close", "Close", <CloseIcon size={18} />, () => {
          setMode("blocks");
          if (inList) setDismissed(true);
        }),
      ],
    ],
    format: [
      [
        ...history,
        ...(["bold", "italic", "strikethrough", "highlight", "code", "link"] as const).map((f) =>
          button(f, FORMAT_LABELS[f], <FormatIcon name={f} size={18} />, run(f), {
            lit: active.formats.has(f),
            disabled: f === "link" ? !active.reach.link : !active.reach.styles,
            look: looks[f],
          }),
        ),
      ],
      [close],
    ],
    heading: [
      [
        ...history,
        ...[1, 2, 3, 4, 5, 6].map((n) =>
          button(`h${n}`, `Heading ${n}`, `H${n}`, once(run(headingCommand(n, active.kind))), {
            lit: active.kind === `h${n}`,
            disabled: kinds,
            look: headingLook(n),
          }),
        ),
      ],
      [close],
    ],
  };
  const [lead, end] = rows[shownRow(mode, inList, dismissed)];

  return (
    <div
      ref={refuseTouches}
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
      {lead}
      <span aria-hidden style={{ flex: 1 }} />
      {end}
      {explain.chip && (
        // One chip for a whole hold: a slide changes its words and place, not the lift-in.
        <Tooltip
          label={explain.chip.label}
          detail={explain.chip.detail}
          look={explain.chip.look}
          lead={explain.chip.mark}
          note={explain.chip.note}
          anchor={explain.chip.anchor}
          touch
          testId="key-bar-chip"
        />
      )}
    </div>
  );
}

/** The longest row's buttons: each button's share of the bar, in every row. */
const SLOTS = 9;

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

/** What is on at the caret, what the bar can act on there, and whether ⇥ and ⇤ would move anything. */
interface Active {
  formats: Set<string>;
  kind: string | null;
  reach: Reach;
  indent: boolean;
  outdent: boolean;
}

/** What is on at the caret: the text styles around it (and any it was promised), and its block's kind. */
function readActive(
  sel: Selection,
  pending: { current: Pending | null },
): { formats: Set<string>; kind: string | null; reach: Reach } {
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
  return {
    formats: lit.formats,
    kind,
    reach: barReach(kind, !!el?.closest(INLINE_FIELD_SELECTOR)),
  };
}

/** The keyboard is up when the window has shrunk well below its tallest at this width. */
function useKeyboardUp() {
  const tallest = useRef(new Map<number, number>());
  const [up, setUp] = useState(false);
  useEffect(() => {
    const read = () => setUp(keyboardUp(tallest.current, window.innerWidth, window.innerHeight));
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return up;
}

/** What a hold on a bar button says, and the button it names. */
interface Explained {
  key: string;
  label: string;
  /** What a button that opens a row holds, muted after its name (`rowContents`). */
  detail?: string;
  /** The label drawn as what the button makes (Heading 1 at its size, Bold in bold). */
  look?: CSSProperties;
  /** The editor's marker before a list button's label. */
  mark?: ReactNode;
  /** Why a greyed button does nothing here, muted under its name. */
  note?: string;
  anchor: HTMLElement;
}

/**
 * Tap acts, hold explains. A finger kept still on a button for HOLD_MS (the
 * block hold's time) shows its chip above the fingertip, read while the
 * finger stays and gone the moment it lifts, as a keyboard's key preview is.
 * Moving before then is no hold. Once a hold shows, the chip follows the
 * finger from button to button at once (sliding off the bar hides it, coming
 * back shows it), and lifting anywhere still does nothing. A finger's tap
 * acts at its lift: the bar refuses the touch, so Android sends no click (and
 * never focuses the button). A mouse acts on its click, except the click that
 * ends a recognised hold. The caret, selection and keyboard stay put. The
 * finger that pressed first owns the gesture until it lifts: another is
 * ignored, as on a held block, so it can never turn a hold into a tap.
 */
function useHoldToExplain() {
  const [chip, setChip] = useState<Explained | null>(null);
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  // A hold is showing, until the finger lifts: moves take the chip along.
  const sliding = useRef(false);
  // The button under the finger while sliding, wearing the press.
  const under = useRef<HTMLElement | null>(null);
  // The button whose hold was recognised: a mouse's click after it does nothing.
  const explained = useRef<string | null>(null);
  // The pointer whose press this is; null between gestures.
  const owner = useRef<number | null>(null);
  // Each button's words, by key, for the one a slide reaches.
  const words = useRef(new Map<string, Omit<Explained, "anchor">>());

  const stop = useCallback(() => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  }, []);
  const settle = useCallback(() => {
    if (under.current) delete under.current.dataset.pressed;
    under.current = null;
    sliding.current = false;
    setChip(null);
  }, []);
  const hide = useCallback(() => {
    stop();
    settle();
    explained.current = null;
    owner.current = null;
  }, [stop, settle]);
  /** Whether this event is another finger's, while one already owns the gesture. */
  const another = (e: PointerEvent<HTMLElement>) =>
    owner.current !== null && e.pointerId !== owner.current;
  useEffect(() => hide, [hide]);

  /** The chip moves to the button under the finger; off the bar, it hides. */
  const slideTo = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-explain]") ?? null;
    if (el === under.current) return;
    if (under.current) delete under.current.dataset.pressed;
    under.current = el;
    const what = el && words.current.get(el.dataset.explain ?? "");
    if (!el || !what) {
      setChip(null);
      return;
    }
    el.dataset.pressed = "";
    setChip({ ...what, anchor: el });
  };

  const holdFor = (what: Omit<Explained, "anchor">, act: (() => void) | undefined) => {
    words.current.set(what.key, what);
    return {
      "data-explain": what.key,
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (another(e)) return;
        hide();
        owner.current = e.pointerId;
        const anchor = e.currentTarget;
        anchor.dataset.pressed = "";
        under.current = anchor;
        press.current = {
          x: e.clientX,
          y: e.clientY,
          timer: setTimeout(() => {
            press.current = null;
            sliding.current = true;
            explained.current = what.key;
            setChip({ ...what, anchor });
          }, HOLD_MS),
        };
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        if (another(e)) return;
        if (sliding.current) slideTo(e.clientX, e.clientY);
        else if (press.current && drifted(press.current, { x: e.clientX, y: e.clientY })) stop();
      },
      onPointerUp: (e: PointerEvent<HTMLElement>) => {
        if (another(e)) return;
        owner.current = null;
        delete e.currentTarget.dataset.pressed;
        // Still pending: neither held nor moved, so a tap.
        const tap = !!press.current;
        const held = sliding.current;
        stop();
        settle();
        if (!held && tap && e.pointerType === "touch") act?.();
      },
      onPointerCancel: (e: PointerEvent<HTMLElement>) => {
        if (another(e)) return;
        owner.current = null;
        delete e.currentTarget.dataset.pressed;
        stop();
        settle();
      },
      onPointerLeave: (e: PointerEvent<HTMLElement>) => {
        // A mouse sliding a hold keeps the press on the button under it.
        if (!sliding.current) delete e.currentTarget.dataset.pressed;
      },
      onClick: () => {
        if (explained.current === what.key) {
          explained.current = null;
          return;
        }
        act?.();
      },
      // A mouse's right-click, or a long press that got past the refusal.
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    };
  };

  return { chip, holdFor, hide };
}
