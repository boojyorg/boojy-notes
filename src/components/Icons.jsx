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
  ArrowDownAZ as LuArrowDownAZ,
  ArrowDownToLine as LuArrowDownToLine,
  ArrowLeftToLine as LuArrowLeftToLine,
  ArrowRightToLine as LuArrowRightToLine,
  ArrowUpDown as LuArrowUpDown,
  ArrowUpToLine as LuArrowUpToLine,
  Bold as LuBold,
  Check as LuCheck,
  ChevronDown as LuChevronDown,
  ChevronRight as LuChevronRight,
  ChevronLeft as LuChevronLeft,
  CircleAlert as LuCircleAlert,
  Clock as LuClock,
  Cloud as LuCloud,
  Code as LuCode,
  CodeXml as LuCodeXml,
  ClipboardPaste as LuClipboardPaste,
  Columns3 as LuColumns3,
  Copy as LuCopy,
  ExternalLink as LuExternalLink,
  File as LuFile,
  FileArchive as LuFileArchive,
  FileImage as LuFileImage,
  FileMusic as LuFileMusic,
  FileSpreadsheet as LuFileSpreadsheet,
  FileVideoCamera as LuFileVideoCamera,
  FileText as LuFileText,
  Folder as LuFolder,
  FolderInput as LuFolderInput,
  FolderOpen as LuFolderOpen,
  FolderPlus as LuFolderPlus,
  FolderSearch as LuFolderSearch,
  FolderX as LuFolderX,
  GripHorizontal as LuGripHorizontal,
  GripVertical as LuGripVertical,
  Highlighter as LuHighlighter,
  Heading1 as LuHeading1,
  Heading2 as LuHeading2,
  Heading3 as LuHeading3,
  Heading4 as LuHeading4,
  Heading5 as LuHeading5,
  Heading6 as LuHeading6,
  History as LuHistory,
  Image as LuImage,
  Info as LuInfo,
  Italic as LuItalic,
  Scissors as LuScissors,
  Unlink as LuUnlink,
  Link as LuLink,
  List as LuList,
  Maximize2 as LuMaximize2,
  ListOrdered as LuListOrdered,
  Minus as LuMinus,
  Monitor as LuMonitor,
  Moon as LuMoon,
  MoreHorizontal as LuMoreHorizontal,
  PanelLeft as LuPanelLeft,
  Paperclip as LuPaperclip,
  Pencil as LuPencil,
  Plus as LuPlus,
  Presentation as LuPresentation,
  Redo2 as LuRedo2,
  RotateCcw as LuRotateCcw,
  Search as LuSearch,
  Settings as LuSettings,
  SquareCheck as LuSquareCheck,
  SquarePen as LuSquarePen,
  Strikethrough as LuStrikethrough,
  Sun as LuSun,
  Table as LuTable,
  TextQuote as LuTextQuote,
  Trash as LuTrash,
  TriangleAlert as LuTriangleAlert,
  Type as LuType,
  Undo2 as LuUndo2,
  X as LuX,
  TextAlignCenter as LuTextAlignCenter,
  TextAlignEnd as LuTextAlignEnd,
  TextAlignStart as LuTextAlignStart,
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
export const ChevronDownIcon = ({ size = ICON_INLINE }) => <LuChevronDown {...base} size={size} />;
export const ChevronRightIcon = ({ size = ICON_INLINE }) => (
  <LuChevronRight {...base} size={size} />
);

// ── Tree items ────────────────────────────────────────────────────────────
export const FolderIcon = ({ open = false, color = "currentColor", size: sz = ICON_INLINE }) => {
  const Cmp = open ? LuFolderOpen : LuFolder;
  return <Cmp {...base} {...navBase} size={sz} color={color} />;
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

/** A file that is not a note: the kind its extension names (`utils/otherFiles.ts`). */
const OTHER_FILE_GLYPHS = {
  image: LuFileImage,
  audio: LuFileMusic,
  video: LuFileVideoCamera,
  slides: LuPresentation,
  sheet: LuFileSpreadsheet,
  archive: LuFileArchive,
  file: LuFile,
};
export const OtherFileIcon = ({ kind = "file", size = ICON_INLINE }) => {
  const Cmp = OTHER_FILE_GLYPHS[kind] ?? LuFile;
  return <Cmp {...base} {...navBase} size={size} />;
};
/** The attachment store's row: what notes embed, not one of the user's folders. */
export const AttachmentsIcon = ({ size = ICON_INLINE }) => (
  <LuPaperclip {...base} {...navBase} size={size} />
);
/** Recently Deleted: the sidebar's footer row and its menu. */
export const RecentlyDeletedIcon = ({ size = ICON_INLINE }) => (
  <LuTrash {...base} {...navBase} size={size} />
);

// ── Vaults ────────────────────────────────────────────────────────────────
/** A vault in the vault menu: a folder, a cloud when it syncs, crossed when missing. */
export const VaultIcon = ({ cloud = false, missing = false, size = ICON_INLINE }) => {
  const Cmp = missing ? LuFolderX : cloud ? LuCloud : LuFolder;
  return <Cmp {...base} {...navBase} size={size} />;
};
/** Show in Finder, for a vault or a file. */
export const RevealIcon = ({ size = ICON_INLINE }) => (
  <LuFolderSearch {...base} {...navBase} size={size} />
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
/** The Notes row's Sort control (2026-09-16): one glyph whatever the mode, since
 *  the row is hidden at rest and the menu is what says which mode is on. */
export const SortIcon = ({ size = ICON_INLINE }) => (
  <LuArrowUpDown {...base} {...navBase} size={size} />
);
/** History, in the editor header. Lucide's curved pair, navigation tier: they
 *  stand as controls beside the note's name, not as glyphs inside prose. A
 *  straight arrow would read as navigation (Back), which undo is not. */
export const UndoIcon = ({ size = ICON_CONTROL }) => <LuUndo2 {...base} {...navBase} size={size} />;
export const RedoIcon = ({ size = ICON_CONTROL }) => <LuRedo2 {...base} {...navBase} size={size} />;
/** Menu tick — the chosen sort mode's mark; nav stroke like every menu glyph. */
export const CheckIcon = ({ size = ICON_INLINE }) => <LuCheck {...base} {...navBase} size={size} />;
/** The sort menu's item glyphs: a clock for Most recent, A→Z for Alphabetical. */
export const ClockIcon = ({ size = ICON_INLINE }) => <LuClock {...base} {...navBase} size={size} />;
export const SortAlphaIcon = ({ size = ICON_INLINE }) => (
  <LuArrowDownAZ {...base} {...navBase} size={size} />
);
/** Block drag handle — content tier: 16px, stroke 1.5, dots FILLED. Lucide draws
 *  the six dots as r=1 stroked rings, which at 16px read as soft grey smudges;
 *  filling them gives crisp ~2.3px discs (judged live 2026-09-03). */
export const GripVerticalIcon = ({ size = ICON_INLINE }) => (
  <LuGripVertical {...base} size={size} fill="currentColor" />
);
/** Its sideways twin, for a table column's grip. */
export const GripHorizontalIcon = ({ size = ICON_INLINE }) => (
  <LuGripHorizontal {...base} size={size} fill="currentColor" />
);
/** `nav` takes the navigation stroke: a standalone control (the table's add boxes). */
export const PlusIcon = ({ size = ICON_INLINE, nav = false }) => (
  <LuPlus {...(nav ? navBase : base)} size={size} />
);
/** Its pair, for a stepper (Settings → Interface size). */
export const MinusIcon = ({ size = ICON_INLINE }) => <LuMinus {...base} size={size} />;
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
export const TrashIcon = () => <LuTrash {...base} {...navBase} size={ICON_INLINE} />;
/** Restore a version (Version History's rows, Recently Deleted). */
export const RestoreIcon = ({ size = ICON_INLINE }) => (
  <LuRotateCcw {...base} {...navBase} size={size} />
);
/** Version History: the ··· item, the list's header and the past-version pill. */
export const HistoryIcon = ({ size = ICON_INLINE }) => (
  <LuHistory {...base} {...navBase} size={size} />
);
export const PencilIcon = ({ size = ICON_INLINE }) => (
  <LuPencil {...base} {...navBase} size={size} />
);
export const CopyIcon = ({ size = ICON_INLINE }) => <LuCopy {...base} {...navBase} size={size} />;
/** Tidy table: lines a table's columns up. */
export const TidyTableIcon = ({ size = ICON_INLINE }) => (
  <LuColumns3 {...base} {...navBase} size={size} />
);
/** A table column's alignment: the three text-align glyphs. */
export const AlignStartIcon = ({ size = ICON_INLINE }) => (
  <LuTextAlignStart {...base} {...navBase} size={size} />
);
export const AlignCenterIcon = ({ size = ICON_INLINE }) => (
  <LuTextAlignCenter {...base} {...navBase} size={size} />
);
export const AlignEndIcon = ({ size = ICON_INLINE }) => (
  <LuTextAlignEnd {...base} {...navBase} size={size} />
);
/** An image's full-size view: the hover bar's glyph (content stroke) and the
 *  menu's (`nav`, like every context-menu glyph). */
export const ExpandIcon = ({ size = ICON_INLINE, nav = false }) => (
  <LuMaximize2 {...(nav ? navBase : base)} size={size} />
);
/** Original size: the width set by hand taken back off the picture. */
export const ResetSizeIcon = ({ size = ICON_INLINE }) => (
  <LuRotateCcw {...base} {...navBase} size={size} />
);
/** The editor's right-click menu: Cut, Paste, Open link, Remove link. */
export const CutIcon = ({ size = ICON_INLINE }) => (
  <LuScissors {...base} {...navBase} size={size} />
);
export const PasteIcon = ({ size = ICON_INLINE }) => (
  <LuClipboardPaste {...base} {...navBase} size={size} />
);
export const OpenLinkIcon = ({ size = ICON_INLINE }) => (
  <LuExternalLink {...base} {...navBase} size={size} />
);
export const OpenNoteIcon = ({ size = ICON_INLINE }) => (
  <LuFileText {...base} {...navBase} size={size} />
);
export const UnlinkIcon = ({ size = ICON_INLINE }) => (
  <LuUnlink {...base} {...navBase} size={size} />
);
/** The link picker's address row. */
export const LinkIcon = ({ size = ICON_INLINE }) => <LuLink {...base} {...navBase} size={size} />;
/** Move to…: a folder with an arrow going in, beside the menu's Pencil and Copy. */
export const MoveToIcon = ({ size = ICON_INLINE }) => (
  <LuFolderInput {...base} {...navBase} size={size} />
);
// ── Settings and setup ────────────────────────────────────────────────────
/** The three appearance pills: content stroke at 16px, beside 14px labels. */
export const SunIcon = ({ size = ICON_INLINE }) => <LuSun {...base} size={size} />;
export const MoonIcon = ({ size = ICON_INLINE }) => <LuMoon {...base} size={size} />;
export const MonitorIcon = ({ size = ICON_INLINE }) => <LuMonitor {...base} size={size} />;
/** Before `Change folder…` and `Choose folder…`: another step follows the button. */
export const FolderOpenIcon = ({ size = ICON_INLINE }) => <LuFolderOpen {...base} size={size} />;
/** A dialog's close, in a chrome button: navigation stroke like the other controls. */
export const CloseIcon = ({ size = ICON_CONTROL }) => <LuX {...base} {...navBase} size={size} />;
export const SettingsIcon = ({ size = ICON_INLINE }) => (
  <LuSettings {...base} {...navBase} size={size} />
);

// ── Standalone controls (20px) ────────────────────────────────────────────
export const SidebarToggleIcon = ({ size = ICON_CONTROL }) => (
  <LuPanelLeft {...base} {...navBase} size={size} />
);
export const MoreHorizontalIcon = ({ size = ICON_CONTROL }) => (
  <LuMoreHorizontal {...base} {...navBase} size={size} />
);

// ── The Markdown view ─────────────────────────────────────────────────────
/** Show Markdown, and the lit corner control while the Markdown view is on.
 *  `</>` rather than `< >`, which is inline code's glyph in the toolbar. */
export const SourceViewIcon = ({ size = ICON_CONTROL }) => (
  <LuCodeXml {...base} {...navBase} size={size} />
);
/** Show Formatted: the glyph names what the item gives you back. */
export const FormattedViewIcon = ({ size = ICON_INLINE }) => (
  <LuType {...base} {...navBase} size={size} />
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

// ── Notifications ─────────────────────────────────────────────────────────
// One glyph per toast, keyed by the name `useToast` carries: the kind's own
// mark, or the one the message asks for (a trashed note says Trash, which is
// more use than a tick). Content stroke at 16px: a toast is a line of prose
// with a mark beside it, not a control.
const TOAST_GLYPHS = {
  check: LuCheck,
  history: LuHistory,
  trash: LuTrash,
  info: LuInfo,
  warning: LuTriangleAlert,
  error: LuCircleAlert,
};

export const ToastIcon = ({ name, size = ICON_INLINE }) => {
  const Glyph = TOAST_GLYPHS[name];
  return Glyph ? <Glyph {...base} size={size} /> : null;
};
