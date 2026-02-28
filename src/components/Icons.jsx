import { TEXT, FINDER } from "../constants/colors";

const Icon = ({ children, size = 14, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }} {...props}>
    {children}
  </svg>
);

export const ChevronRight = ({ color = TEXT.muted }) => (
  <Icon size={14}><path d="M5.5 3L10 8L5.5 13" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></Icon>
);
export const ChevronDown = ({ color = TEXT.secondary }) => (
  <Icon size={14}><path d="M3 5.5L8 10L13 5.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></Icon>
);
export const FolderIcon = ({ open, color, size: sz }) => (
  <Icon size={sz || 17}>
    <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.17C6.44 3 6.69 3.11 6.88 3.29L7.71 4.12C7.89 4.31 8.15 4.41 8.41 4.41H12.5C13.33 4.41 14 5.08 14 5.91V12C14 12.55 13.55 13 13 13H3C2.45 13 2 12.55 2 12V4.5Z"
      fill={color || FINDER.folderBlue}/>
  </Icon>
);
export const FileIcon = ({ active, color, size: sz }) => (
  <Icon size={sz || 17}>
    <path d="M4.5 2C3.95 2 3.5 2.45 3.5 3V13C3.5 13.55 3.95 14 4.5 14H11.5C12.05 14 12.5 13.55 12.5 13V6L9 2H4.5Z"
      fill={color || (active ? TEXT.primary : FINDER.docIcon)} opacity={color ? "1" : (active ? "0.7" : "0.55")}/>
    <path d="M9 2V5.5H12.5" stroke={color || (active ? TEXT.primary : FINDER.docIcon)} strokeWidth="0.8" opacity={color ? "1" : (active ? "0.7" : "0.55")} strokeLinejoin="round"/>
  </Icon>
);
export const SearchIcon = () => (
  <svg width="15.4" height="15.4" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="7" cy="7" r="4.5" stroke={TEXT.muted} strokeWidth="1.5"/>
    <path d="M10.5 10.5L14 14" stroke={TEXT.muted} strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
export const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);
export const UndoIcon = () => (
  <Icon size={16.5}>
    <path d="M4 6H10C11.66 6 13 7.34 13 9C13 10.66 11.66 12 10 12H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M6.5 3.5L4 6L6.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </Icon>
);
export const RedoIcon = () => (
  <Icon size={16.5}>
    <path d="M12 6H6C4.34 6 3 7.34 3 9C3 10.66 4.34 12 6 12H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M9.5 3.5L12 6L9.5 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </Icon>
);
export const NewNoteIcon = () => (
  <Icon size={18}>
    <path d="M4 2C3.45 2 3 2.45 3 3V13C3 13.55 3.45 14 4 14H12C12.55 14 13 13.55 13 13V6L9.5 2H4Z"
      stroke="currentColor" strokeWidth="1.8" fill="none"/>
    <path d="M8 7V11M6 9H10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </Icon>
);
export const NewFolderIcon = () => (
  <Icon size={18}>
    <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.17C6.44 3 6.69 3.11 6.88 3.29L7.71 4.12C7.89 4.31 8.15 4.41 8.41 4.41H12.5C13.33 4.41 14 5.08 14 5.91V12C14 12.55 13.55 13 13 13H3C2.45 13 2 12.55 2 12V4.5Z"
      stroke="currentColor" strokeWidth="1.8" fill="none"/>
    <path d="M8 7.5V10.5M6.5 9H9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </Icon>
);
export const SidebarToggleIcon = () => (
  <svg width="16.5" height="16.5" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M6 2.5V13.5" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
);
export const BreadcrumbChevron = () => (
  <svg width="7" height="7" viewBox="0 0 7 7" fill="none" style={{ flexShrink: 0 }}>
    <path d="M2 1L5 3.5L2 6" stroke={TEXT.muted} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
export const TrashIcon = () => (
  <svg width="16.2" height="16.2" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
    <path d="M3 4.5H13M6 4.5V3.5C6 3.22 6.22 3 6.5 3H9.5C9.78 3 10 3.22 10 3.5V4.5M4.5 4.5V12.5C4.5 13.05 4.95 13.5 5.5 13.5H10.5C11.05 13.5 11.5 13.05 11.5 12.5V4.5"
      stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
