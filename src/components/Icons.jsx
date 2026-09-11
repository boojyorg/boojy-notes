/**
 * UI icons — Lucide, wrapped so call sites keep their existing names and props.
 *
 * House rules (Phase 1 UI pass):
 *   size 16    inline list glyphs: folder rows, search results, menu items
 *   size 18    navigation tier (judged live 2026-08-19, "icon system C"):
 *              New note / Search action glyphs (explicit at call sites) and
 *              standalone controls — panel toggle, note actions ··· (ICON_CONTROL)
 *   size 20    mobile top-bar controls (explicit at call sites)
 *   stroke 1.5 editor/content icons — Lucide's default 2 reads busy at 16px
 *              among prose in a writing app
 *   stroke 2   navigation chrome (ICON_STROKE_NAV) — judged live 2026-08-19
 *              against 1.5/1.75: the heavier stroke balances the nav icons
 *              against their 14px labels
 *
 * Everything here inherits `currentColor`, so colour comes from the themed text
 * colour of the parent. Brand marks (the Notes wordmark) are image assets, not icons.
 */
import {
  ArrowDownToLine as LuArrowDownToLine,
  ArrowLeftToLine as LuArrowLeftToLine,
  ArrowRightToLine as LuArrowRightToLine,
  ArrowUpToLine as LuArrowUpToLine,
  Bold as LuBold,
  ChevronLeft as LuChevronLeft,
  Code as LuCode,
  Copy as LuCopy,
  FileText as LuFileText,
  Folder as LuFolder,
  FolderOpen as LuFolderOpen,
  FolderPlus as LuFolderPlus,
  GripVertical as LuGripVertical,
  Highlighter as LuHighlighter,
  Heading1 as LuHeading1,
  Heading2 as LuHeading2,
  Heading3 as LuHeading3,
  Heading4 as LuHeading4,
  Heading5 as LuHeading5,
  Heading6 as LuHeading6,
  Image as LuImage,
  Info as LuInfo,
  Italic as LuItalic,
  Link as LuLink,
  List as LuList,
  ListOrdered as LuListOrdered,
  Minus as LuMinus,
  MoreHorizontal as LuMoreHorizontal,
  PanelLeft as LuPanelLeft,
  Paperclip as LuPaperclip,
  Pencil as LuPencil,
  Plus as LuPlus,
  Search as LuSearch,
  SquareCheck as LuSquareCheck,
  SquarePen as LuSquarePen,
  Strikethrough as LuStrikethrough,
  Table as LuTable,
  TextQuote as LuTextQuote,
  Trash2 as LuTrash2,
} from "lucide-react";

const ICON_INLINE = 16;
const ICON_CONTROL = 18;
const ICON_STROKE = 1.5;
const ICON_STROKE_NAV = 2;

const base = { strokeWidth: ICON_STROKE };
/** Sidebar navigation icons run one step heavier than content icons. */
const navBase = { strokeWidth: ICON_STROKE_NAV };

// ── Disclosure ────────────────────────────────────────────────────────────
export const ChevronLeftIcon = ({ size = ICON_INLINE }) => <LuChevronLeft {...base} size={size} />;

// ── Tree items ────────────────────────────────────────────────────────────
export const FolderIcon = ({ open, color, size: sz }) => {
  const Cmp = open ? LuFolderOpen : LuFolder;
  return <Cmp {...base} {...navBase} size={sz || ICON_INLINE} color={color || "currentColor"} />;
};
export const FileIcon = ({ active, color, size: sz }) => (
  <LuFileText
    {...base}
    size={sz || ICON_INLINE}
    color={color || "currentColor"}
    // Preserves the previous active/inactive weighting without a second colour.
    opacity={color ? 1 : active ? 0.9 : 0.65}
  />
);

// ── Actions ───────────────────────────────────────────────────────────────
export const SearchIcon = ({ size = ICON_INLINE }) => (
  <LuSearch {...base} {...navBase} size={size} />
);
export const NewNoteIcon = ({ size = ICON_INLINE }) => (
  <LuSquarePen {...base} {...navBase} size={size} />
);
export const NewFolderIcon = ({ size = ICON_INLINE }) => (
  <LuFolderPlus {...base} {...navBase} size={size} />
);
/** Menu tick — content tier, so it sits quietly beside a 12.5px label. */
/** Block drag handle — content tier: 16px, stroke 1.5, dots FILLED. Lucide draws
 *  the six dots as r=1 stroked rings, which at 16px read as soft grey smudges;
 *  filling them gives crisp ~2.3px discs (judged live 2026-09-03). */
export const GripVerticalIcon = ({ size = ICON_INLINE }) => (
  <LuGripVertical {...base} size={size} fill="currentColor" />
);
/** `nav` takes the navigation stroke: a standalone control (the table's add boxes). */
export const PlusIcon = ({ size = ICON_INLINE, nav = false }) => (
  <LuPlus {...(nav ? navBase : base)} size={size} />
);
/** The table cell menu's insert glyphs: the direction is the meaning (nav stroke, as
 *  every context-menu glyph). */
export const ArrowUpToLineIcon = ({ size = ICON_INLINE }) => (
  <LuArrowUpToLine {...base} {...navBase} size={size} />
);
export const ArrowDownToLineIcon = ({ size = ICON_INLINE }) => (
  <LuArrowDownToLine {...base} {...navBase} size={size} />
);
export const ArrowLeftToLineIcon = ({ size = ICON_INLINE }) => (
  <LuArrowLeftToLine {...base} {...navBase} size={size} />
);
export const ArrowRightToLineIcon = ({ size = ICON_INLINE }) => (
  <LuArrowRightToLine {...base} {...navBase} size={size} />
);
/** Context-menu action glyphs — nav stroke: 1.5 read too light beside the
 *  12.5px menu labels (judged live 2026-08-23). */
export const TrashIcon = () => <LuTrash2 {...base} {...navBase} size={ICON_INLINE} />;
export const PencilIcon = ({ size = ICON_INLINE }) => (
  <LuPencil {...base} {...navBase} size={size} />
);
export const CopyIcon = ({ size = ICON_INLINE }) => <LuCopy {...base} {...navBase} size={size} />;

// ── Standalone controls (20px) ────────────────────────────────────────────
export const SidebarToggleIcon = ({ size = ICON_CONTROL }) => (
  <LuPanelLeft {...base} {...navBase} size={size} />
);
export const MoreHorizontalIcon = ({ size = ICON_CONTROL }) => (
  <LuMoreHorizontal {...base} {...navBase} size={size} />
);

// ── Slash menu ────────────────────────────────────────────────────────────
// One glyph per block type, keyed by the `icon` name in SLASH_COMMANDS. These
// replaced a column of unicode characters ("H1", "\u2610", "\u25A6", "\u2293") set in
// bordered 24px chips — the characters rendered differently on every platform and
// the chips read as a stack of buttons. Bare glyph, inherits the row's colour.
const SLASH_GLYPHS = {
  "heading-1": LuHeading1,
  "heading-2": LuHeading2,
  "heading-3": LuHeading3,
  "heading-4": LuHeading4,
  "heading-5": LuHeading5,
  "heading-6": LuHeading6,
  list: LuList,
  "list-ordered": LuListOrdered,
  "square-check": LuSquareCheck,
  table: LuTable,
  image: LuImage,
  code: LuCode,
  "text-quote": LuTextQuote,
  minus: LuMinus,
  info: LuInfo,
  paperclip: LuPaperclip,
  link: LuLink,
};

/**
 * Navigation stroke, not content: the row's glyph is the block's identity beside a
 * 13px/500 label and a mono hint, and at 1.5 it read thin against both (judged
 * live 2026-09-07). Same tier as the sidebar's chrome, same 16px as its rows.
 */
export const SlashCommandIcon = ({ name, size = ICON_INLINE }) => {
  const Glyph = SLASH_GLYPHS[name];
  return Glyph ? <Glyph {...navBase} size={size} /> : null;
};

// ── Formatting toolbar ────────────────────────────────────────────────────
// One glyph per inline format, keyed by the format name `applyFormat` takes.
// These replaced styled text glyphs (a bold "B", an italic "I", "</>" in mono)
// that read as a different family from every other control (2026-09-10).
const FORMAT_GLYPHS = {
  bold: LuBold,
  italic: LuItalic,
  strikethrough: LuStrikethrough,
  highlight: LuHighlighter,
  code: LuCode,
  link: LuLink,
};

/**
 * Heavier than the navigation stroke: these glyphs stand alone in a pill with
 * no label beside them, and at 2 the B and I read faint against the accent
 * (judged 2026-09-10 against Notion's toolbar). The one stroke tier above nav,
 * for this toolbar only.
 */
const ICON_STROKE_TOOLBAR = 2.5;
export const FormatIcon = ({ name, size = ICON_INLINE }) => {
  const Glyph = FORMAT_GLYPHS[name];
  return Glyph ? <Glyph strokeWidth={ICON_STROKE_TOOLBAR} size={size} /> : null;
};
