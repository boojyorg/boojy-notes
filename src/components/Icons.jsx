/**
 * UI icons — Lucide, wrapped so call sites keep their existing names and props.
 *
 * House rules (Phase 1 UI pass):
 *   size 16    inline: sidebar rows, menu items, breadcrumbs
 *   size 20    standalone controls: panel toggle, note actions
 *   stroke 1.5 everywhere — Lucide's default 2 reads busy at 16px in a writing app
 *
 * Everything here inherits `currentColor`, so colour comes from the themed text
 * colour of the parent. Brand marks (the Notes wordmark) are image assets, not icons.
 */
import {
  ChevronDown as LuChevronDown,
  ChevronLeft as LuChevronLeft,
  ChevronRight as LuChevronRight,
  Code as LuCode,
  FileText as LuFileText,
  Folder as LuFolder,
  FolderOpen as LuFolderOpen,
  FolderPlus as LuFolderPlus,
  Heading1 as LuHeading1,
  Heading2 as LuHeading2,
  Heading3 as LuHeading3,
  HelpCircle as LuHelpCircle,
  Image as LuImage,
  Info as LuInfo,
  Link as LuLink,
  List as LuList,
  ListOrdered as LuListOrdered,
  Menu as LuMenu,
  Minus as LuMinus,
  MoreHorizontal as LuMoreHorizontal,
  PanelLeft as LuPanelLeft,
  Paperclip as LuPaperclip,
  Plus as LuPlus,
  Redo2 as LuRedo2,
  Search as LuSearch,
  Settings as LuSettings,
  SquareCheck as LuSquareCheck,
  SquarePen as LuSquarePen,
  Table as LuTable,
  TextQuote as LuTextQuote,
  Trash2 as LuTrash2,
  Undo2 as LuUndo2,
  X as LuX,
} from "lucide-react";

export const ICON_INLINE = 16;
export const ICON_CONTROL = 20;
export const ICON_STROKE = 1.5;

const base = { strokeWidth: ICON_STROKE };

// ── Disclosure ────────────────────────────────────────────────────────────
export const ChevronRight = ({ color = "currentColor", size = ICON_INLINE }) => (
  <LuChevronRight {...base} size={size} color={color} />
);
export const ChevronDown = ({ color = "currentColor", size = ICON_INLINE }) => (
  <LuChevronDown {...base} size={size} color={color} />
);
export const ChevronLeftIcon = ({ size = ICON_INLINE }) => <LuChevronLeft {...base} size={size} />;
// Breadcrumb separators sit inside 12px text, so they run a step smaller.
export const BreadcrumbChevron = () => <LuChevronRight {...base} size={14} />;

// ── Tree items ────────────────────────────────────────────────────────────
export const FolderIcon = ({ open, color, size: sz }) => {
  const Cmp = open ? LuFolderOpen : LuFolder;
  return <Cmp {...base} size={sz || ICON_INLINE} color={color || "currentColor"} />;
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
export const SearchIcon = ({ size = ICON_INLINE }) => <LuSearch {...base} size={size} />;
export const CloseIcon = () => <LuX {...base} size={14} />;
export const UndoIcon = ({ size = ICON_INLINE }) => <LuUndo2 {...base} size={size} />;
export const RedoIcon = ({ size = ICON_INLINE }) => <LuRedo2 {...base} size={size} />;
export const NewNoteIcon = ({ size = ICON_INLINE }) => <LuSquarePen {...base} size={size} />;
export const NewFolderIcon = () => <LuFolderPlus {...base} size={ICON_INLINE} />;
export const PlusIcon = ({ size = ICON_INLINE }) => <LuPlus {...base} size={size} />;
export const TrashIcon = () => <LuTrash2 {...base} size={ICON_INLINE} />;
export const SettingsIcon = ({ size = ICON_INLINE }) => <LuSettings {...base} size={size} />;
export const HelpIcon = () => <LuHelpCircle {...base} size={ICON_INLINE} />;
export const HamburgerIcon = ({ size = ICON_INLINE }) => <LuMenu {...base} size={size} />;

// ── Standalone controls (20px) ────────────────────────────────────────────
export const SidebarToggleIcon = ({ size = ICON_CONTROL }) => <LuPanelLeft {...base} size={size} />;
export const MoreHorizontalIcon = ({ size = ICON_CONTROL }) => (
  <LuMoreHorizontal {...base} size={size} />
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
