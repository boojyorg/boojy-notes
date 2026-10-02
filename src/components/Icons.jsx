/**
 * UI icons — Lucide, wrapped so call sites keep their existing names and props.
 *
 * House rules:
 *   size 16    inline list glyphs: folder rows, search results, menu items
 *   size 18    navigation tier: New note / Search action glyphs (explicit at
 *              call sites) and standalone controls — panel toggle, note
 *              actions ··· (ICON_CONTROL)
 *   stroke 1.5 editor/content icons — Lucide's default 2 reads busy at 16px
 *              among prose in a writing app
 *   stroke 2   navigation chrome (ICON_STROKE_NAV): the heavier stroke
 *              balances the nav icons against their 14px labels
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
  CircleAlert as LuCircleAlert,
  Clock as LuClock,
  Cloud as LuCloud,
  CloudDownload as LuCloudDownload,
  Code as LuCode,
  CodeXml as LuCodeXml,
  ClipboardPaste as LuClipboardPaste,
  Columns3 as LuColumns3,
  Copy as LuCopy,
  Clipboard as LuClipboard,
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
  FileX as LuFileX,
  FolderSearch as LuFolderSearch,
  ImageOff as LuImageOff,
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
  Repeat2 as LuRepeat2,
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

/** A Lucide glyph at the navigation stroke, `size` defaulting to the list tier. */
const navIcon =
  (Glyph, defaultSize = ICON_INLINE) =>
  ({ size = defaultSize }) => <Glyph {...navBase} size={size} />;
/** The same at the content stroke. */
const contentIcon =
  (Glyph) =>
  ({ size = ICON_INLINE }) => <Glyph {...base} size={size} />;

// ── Disclosure ────────────────────────────────────────────────────────────
export const ChevronDownIcon = contentIcon(LuChevronDown);
export const ChevronRightIcon = contentIcon(LuChevronRight);

// ── Tree items ────────────────────────────────────────────────────────────
export const FolderIcon = ({ open = false, color = "currentColor", size: sz = ICON_INLINE }) => {
  const Cmp = open ? LuFolderOpen : LuFolder;
  return <Cmp {...navBase} size={sz} color={color} />;
};

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
  return <Cmp {...navBase} size={size} />;
};
/** The attachment store's row: what notes embed, not one of the user's folders. */
export const AttachmentsIcon = navIcon(LuPaperclip);

// ── Vaults ────────────────────────────────────────────────────────────────
/** A vault in the vault menu: a folder, a cloud when it syncs, crossed when missing. */
export const VaultIcon = ({ cloud = false, missing = false, size = ICON_INLINE }) => {
  const Cmp = missing ? LuFolderX : cloud ? LuCloud : LuFolder;
  return <Cmp {...navBase} size={size} />;
};
/** An attachment a note links to that is not in the vault: a picture or a file. */
export const MissingAttachmentIcon = ({ image = false, size = ICON_INLINE }) => {
  const Cmp = image ? LuImageOff : LuFileX;
  return <Cmp {...navBase} size={size} />;
};
/** A note whose text a sync service keeps online until it is opened. */
export const OffloadedIcon = navIcon(LuCloudDownload);
/** Show in Finder, for a vault or a file. */
export const RevealIcon = navIcon(LuFolderSearch);

// ── Actions ───────────────────────────────────────────────────────────────
export const SearchIcon = navIcon(LuSearch);
export const NewNoteIcon = navIcon(LuSquarePen);
export const NewFolderIcon = navIcon(LuFolderPlus);
/** The Notes row's Sort control: one glyph whatever the mode, since
 *  the row is hidden at rest and the menu is what says which mode is on. */
export const SortIcon = navIcon(LuArrowUpDown);
/** Menu tick — the chosen sort mode's mark; nav stroke like every menu glyph. */
export const CheckIcon = navIcon(LuCheck);
/** The sort menu's item glyphs: a clock for Most recent, A→Z for Alphabetical. */
export const ClockIcon = navIcon(LuClock);
export const SortAlphaIcon = navIcon(LuArrowDownAZ);
/** Block drag handle — content tier: 16px, stroke 1.5, dots FILLED. Lucide draws
 *  the six dots as r=1 stroked rings, which at 16px read as soft grey smudges;
 *  filling them gives crisp ~2.3px discs. */
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
export const MinusIcon = contentIcon(LuMinus);
/** The table cell menu's insert glyphs: the direction is the meaning (nav stroke, as
 *  every context-menu glyph). */
export const ArrowUpToLineIcon = navIcon(LuArrowUpToLine);
export const ArrowDownToLineIcon = navIcon(LuArrowDownToLine);
export const ArrowLeftToLineIcon = navIcon(LuArrowLeftToLine);
export const ArrowRightToLineIcon = navIcon(LuArrowRightToLine);
/** Context-menu action glyphs — nav stroke: 1.5 reads too light beside the
 *  12.5px menu labels. Also Recently Deleted's row. */
export const TrashIcon = navIcon(LuTrash);
/** Restore a version (Version History, Recently Deleted), and an image's Original size. */
export const RestoreIcon = navIcon(LuRotateCcw);
/** Version History: the ··· item, the list's header and the past-version pill. */
export const HistoryIcon = navIcon(LuHistory);
export const PencilIcon = navIcon(LuPencil);
export const CopyIcon = navIcon(LuCopy);
/** Copy to the clipboard (a note's or blocks' Copy); Duplicate keeps the two sheets. */
export const ClipboardIcon = navIcon(LuClipboard);
export const TurnIntoIcon = navIcon(LuRepeat2);
/** Tidy table: lines a table's columns up. */
export const TidyTableIcon = navIcon(LuColumns3);
/** A table column's alignment: the three text-align glyphs. */
export const AlignStartIcon = navIcon(LuTextAlignStart);
export const AlignCenterIcon = navIcon(LuTextAlignCenter);
export const AlignEndIcon = navIcon(LuTextAlignEnd);
/** An image's full-size view: the hover bar's glyph (content stroke) and the
 *  menu's (`nav`, like every context-menu glyph). */
export const ExpandIcon = ({ size = ICON_INLINE, nav = false }) => (
  <LuMaximize2 {...(nav ? navBase : base)} size={size} />
);
/** The editor's right-click menu: Cut, Paste, Open link, Remove link. */
export const CutIcon = navIcon(LuScissors);
export const PasteIcon = navIcon(LuClipboardPaste);
export const OpenLinkIcon = navIcon(LuExternalLink);
export const OpenNoteIcon = navIcon(LuFileText);
export const UnlinkIcon = navIcon(LuUnlink);
/** The link picker's address row. */
export const LinkIcon = navIcon(LuLink);
/** Move to…: a folder with an arrow going in, beside the menu's Pencil and Copy. */
export const MoveToIcon = navIcon(LuFolderInput);
// ── Settings and setup ────────────────────────────────────────────────────
/** The three appearance pills: content stroke at 16px, beside 14px labels. */
export const SunIcon = contentIcon(LuSun);
export const MoonIcon = contentIcon(LuMoon);
export const MonitorIcon = contentIcon(LuMonitor);
/** Before `Change folder…` and `Choose folder…`: another step follows the button. */
export const FolderOpenIcon = contentIcon(LuFolderOpen);
/** A dialog's close, in a chrome button: navigation stroke like the other controls. */
export const CloseIcon = navIcon(LuX, ICON_CONTROL);
export const SettingsIcon = navIcon(LuSettings);

// ── Standalone controls (ICON_CONTROL) ────────────────────────────────────
export const SidebarToggleIcon = navIcon(LuPanelLeft, ICON_CONTROL);
export const MoreHorizontalIcon = navIcon(LuMoreHorizontal, ICON_CONTROL);

// ── The Markdown view ─────────────────────────────────────────────────────
/** Show Markdown, and the lit corner control while the Markdown view is on.
 *  `</>` rather than `< >`, which is inline code's glyph in the toolbar. */
export const SourceViewIcon = navIcon(LuCodeXml, ICON_CONTROL);
/** Show Formatted: the glyph names what the item gives you back. */
export const FormattedViewIcon = navIcon(LuType);

// ── Slash menu ────────────────────────────────────────────────────────────
// One glyph per block type, keyed by the `icon` name in SLASH_COMMANDS. These
// replaced a column of unicode characters ("H1", "\u2610", "\u25A6", "\u2293") set in
// bordered 24px chips — the characters rendered differently on every platform and
// the chips read as a stack of buttons. Bare glyph, inherits the row's colour.
const SLASH_GLYPHS = {
  type: LuType,
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
 * 13px/500 label and a mono hint, and at 1.5 it reads thin against both. Same
 * tier as the sidebar's chrome, same 16px as its rows.
 */
export const SlashCommandIcon = ({ name, size = ICON_INLINE }) => {
  const Glyph = SLASH_GLYPHS[name];
  return Glyph ? <Glyph {...navBase} size={size} /> : null;
};

// ── Formatting toolbar ────────────────────────────────────────────────────
// One glyph per inline format, keyed by the format name `applyFormat` takes,
// never styled text glyphs (a bold "B"), which read as a different family.
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
 * no label beside them, and at 2 the B and I read faint against the accent.
 * The one stroke tier above nav,
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
