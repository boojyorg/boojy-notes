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
  ChevronLeft as LuChevronLeft,
  Clock3 as LuClock3,
  Code as LuCode,
  Copy as LuCopy,
  FileText as LuFileText,
  Folder as LuFolder,
  FolderOpen as LuFolderOpen,
  FolderPlus as LuFolderPlus,
  Heading1 as LuHeading1,
  Heading2 as LuHeading2,
  Heading3 as LuHeading3,
  Image as LuImage,
  Info as LuInfo,
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
export const NewFolderIcon = () => <LuFolderPlus {...base} {...navBase} size={ICON_INLINE} />;
/** Sort trigger — glyph reflects the active mode. Section-header tier: 16px, nav stroke. */
export const SortRecentIcon = () => <LuClock3 {...base} {...navBase} size={ICON_INLINE} />;
export const SortAlphaIcon = () => <LuArrowDownAZ {...base} {...navBase} size={ICON_INLINE} />;
/** Menu tick — content tier, so it sits quietly beside a 12.5px label. */
export const PlusIcon = ({ size = ICON_INLINE }) => <LuPlus {...base} size={size} />;
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

export const SlashCommandIcon = ({ name, size = ICON_INLINE }) => {
  const Glyph = SLASH_GLYPHS[name];
  return Glyph ? <Glyph {...base} size={size} /> : null;
};
