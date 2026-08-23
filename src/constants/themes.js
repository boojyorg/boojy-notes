export const NIGHT = {
  name: "night",
  BG: {
    darkest: "#13151C",
    dark: "#2C2C32",
    standard: "#272A38",
    editor: "#040412",
    elevated: "#292B36",
    surface: "#353845",
    divider: "#3A3D4A",
    hover: "#4A4D5A",
  },
  TEXT: {
    primary: "#E8EAF0",
    secondary: "#9B9EB0",
    muted: "#646880",
  },
  ACCENT: {
    primary: "#A4CACE",
    hover: "#B8D8DB",
    onAccent: "#13151C", // text/icon on an accent fill — dark, since the accent is pale here
  },
  SEMANTIC: {
    success: "#4CAF50",
    warning: "#FFC107",
    error: "#FF5722",
  },
  BRAND: {
    orange: "#D4820A",
  },
  FINDER: {
    folderBlue: "#38BDF8",
    folderDark: "#2DA8E0",
    selectBg: "#1E3A5F",
    selectBgHover: "#254A73",
    docIcon: "#9CA3AF",
  },
  scrollbar: {
    thumb: "#3A3D4A",
    thumbHover: "#4A4D5A",
    thumbActive: "#5A5D6A",
    track: "transparent",
  },
  // Sidebar resize handle. Neutral by rule — the accent is identity, not a
  // surface, and a full-height accent bar was the loudest violation in the app.
  // Mirrors the scrollbar's rest/hover steps on purpose: both are draggable
  // chrome, so they should speak one neutral language.
  sidebarHandle: {
    hover: "#3A3D4A",
    active: "#4A4D5A",
  },
  starField: true,
  codeBlockBg: "#03030D",
  codeBlockBorder: "rgba(255,255,255,0.10)",
  codeBlockBorderFocus: "rgba(255,255,255,0.18)",
  transitionMs: 400,
  callouts: {
    note: { colour: "#7AA2F7", bg: "#3f4e74", border: "rgba(122,162,247,0.18)" },
    info: { colour: "#89DDFF", bg: "#446277", border: "rgba(137,221,255,0.18)" },
    tip: { colour: "#9ECE6A", bg: "#4c5e43", border: "rgba(158,206,106,0.18)" },
    warning: { colour: "#E0AF68", bg: "#635242", border: "rgba(224,175,104,0.18)" },
    danger: { colour: "#F7768E", bg: "#6b3d4f", border: "rgba(247,118,142,0.18)" },
    success: { colour: "#9ECE6A", bg: "#4c5e43", border: "rgba(158,206,106,0.18)" },
    question: { colour: "#BB9AF7", bg: "#564b74", border: "rgba(187,154,247,0.18)" },
    quote: { colour: "#9B9EB0", bg: "#4c4c5a", border: "rgba(155,158,176,0.18)" },
    example: { colour: "#BB9AF7", bg: "#564b74", border: "rgba(187,154,247,0.18)" },
    bug: { colour: "#F7768E", bg: "#6b3d4f", border: "rgba(247,118,142,0.18)" },
    abstract: { colour: "#89DDFF", bg: "#446277", border: "rgba(137,221,255,0.18)" },
  },
  overlay: (a) => `rgba(255,255,255,${a})`,
  resizeHandle: { bg: "#fff", border: "#A4CACE" },
  // Inline formatting colors
  inlineCode: { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.1)" },
  link: { color: "#6ea8d8", underline: "rgba(110,168,216,0.3)", hoverBg: "rgba(110,168,216,0.06)" },
  wikilink: { color: "#A4CACE", underline: "rgba(164,202,206,0.3)" },
  wikilinkBroken: {
    color: "rgba(255,255,255,0.4)",
    underline: "rgba(255,255,255,0.2)",
    hoverColor: "rgba(255,255,255,0.6)",
    hoverUnderline: "rgba(255,255,255,0.3)",
  },
  mark: { bg: "rgba(164, 202, 206, 0.35)" },
  calloutIconHover: "rgba(255,255,255,0.06)",
  tableToolbar: "rgba(255,255,255,0.03)",
  frontmatter: "rgba(255,255,255,0.02)",
  codeCopy: {
    bg: "rgba(0,0,0,0.5)",
    color: "rgba(255,255,255,0.45)",
    hoverBg: "rgba(255,255,255,0.08)",
    hoverColor: "rgba(255,255,255,0.8)",
    border: "rgba(255,255,255,0.08)",
  },
  codeLang: { color: "rgba(255,255,255,0.2)", hoverColor: "rgba(255,255,255,0.45)" },
  codeLangOption: { hoverBg: "rgba(255,255,255,0.06)" },
  codeSelection: "rgba(255,255,255,0.12)",
  caretColor: "#fff",
  searchInputBg: "#18191E",
  modalBg: "rgba(20,22,35,0.95)",
  modalShadow: "0 24px 48px rgba(0,0,0,0.4), 0 8px 16px rgba(0,0,0,0.2)",
  splitDivider: "#3A3D4A",
  splitActiveBorder: "#A4CACE",
  splitDropZone: "rgba(164, 202, 206, 0.10)",
  syntax: {
    comment: "#636980",
    punctuation: "#9B9EB0",
    property: "#FF9E64",
    string: "#9ECE6A",
    operator: "#89DDFF",
    keyword: "#BB9AF7",
    function: "#7AA2F7",
    variable: "#E0AF68",
  },
};

export const DAY = {
  name: "day",
  // Phase 1 light palette: neutral, warm-biased ramp. Surfaces are ordered
  // ground -> chrome -> sheet, with two interaction tiers:
  //   surface (#F4F4F5) = content hover
  //   hover   (#ECECEC) = row/tab hover AND selected (hover previews selection)
  // `elevated` and `editor` share #FFFFFF in light; they stay split for dark.
  BG: {
    darkest: "#FCFCFC", // app ground
    dark: "#F9F9F9", // chrome: top bar, mobile toolbar
    standard: "#F9F9F9", // sidebar
    editor: "#FFFFFF", // writing sheet
    elevated: "#FFFFFF", // raised: menus, popovers, modals
    surface: "#F4F4F5", // content hover
    divider: "#E9E9E9", // border, ink @ 8%
    hover: "#ECECEC", // row/tab hover + selected
  },
  TEXT: {
    primary: "#14110F", // 18.3:1 on ground
    secondary: "#47403A", // 9.9:1
    muted: "#7A736C", // 4.6:1
  },
  ACCENT: {
    primary: "#2A737D", // 5.3:1 on ground, 4.6:1 on selected row
    hover: "#1F6B75",
    onAccent: "#FFFFFF", // text/icon on an accent fill (5.5:1)
  },
  SEMANTIC: {
    success: "#2E8B3C",
    warning: "#D4920A",
    error: "#D43030",
  },
  BRAND: {
    orange: "#D4820A",
  },
  FINDER: {
    folderBlue: "#2A737D",
    folderDark: "#1F6B75",
    selectBg: "#ECECEC",
    selectBgHover: "#E4E4E4",
    docIcon: "#7A736C",
  },
  scrollbar: {
    // thumb matches BG.divider on purpose — that is the resting grey the app has
    // actually been rendering, and it is the one being kept.
    thumb: "#E9E9E9",
    thumbHover: "#C9C7C5",
    thumbActive: "#A8A5A2",
    track: "transparent",
  },
  // See NIGHT.sidebarHandle. Note DAY's BG.hover (#ECECEC) is *lighter* than
  // BG.divider (#E9E9E9), so the two-step ramp is spelled out rather than
  // borrowed from the BG roles.
  sidebarHandle: {
    hover: "#E9E9E9",
    active: "#C9C7C5",
  },
  starField: false,
  codeBlockBg: "#F4F4F5",
  codeBlockBorder: "rgba(0,0,0,0.08)",
  codeBlockBorderFocus: "rgba(0,0,0,0.15)",
  transitionMs: 400,
  callouts: {
    note: { colour: "#4A6CF7", bg: "#D8E0F4", border: "rgba(122,162,247,0.25)" },
    info: { colour: "#2896C8", bg: "#D4E8F4", border: "rgba(137,221,255,0.25)" },
    tip: { colour: "#5A8A30", bg: "#DCE8D4", border: "rgba(158,206,106,0.25)" },
    warning: { colour: "#A07830", bg: "#F0E4D0", border: "rgba(224,175,104,0.25)" },
    danger: { colour: "#C04060", bg: "#F0D4D8", border: "rgba(247,118,142,0.25)" },
    success: { colour: "#5A8A30", bg: "#DCE8D4", border: "rgba(158,206,106,0.25)" },
    question: { colour: "#7B5AC0", bg: "#E0D8F0", border: "rgba(187,154,247,0.25)" },
    quote: { colour: "#6A6D80", bg: "#E0E0E8", border: "rgba(155,158,176,0.25)" },
    example: { colour: "#7B5AC0", bg: "#E0D8F0", border: "rgba(187,154,247,0.25)" },
    bug: { colour: "#C04060", bg: "#F0D4D8", border: "rgba(247,118,142,0.25)" },
    abstract: { colour: "#2896C8", bg: "#D4E8F4", border: "rgba(137,221,255,0.25)" },
  },
  overlay: (a) => `rgba(0,0,0,${a})`,
  resizeHandle: { bg: "#14110F", border: "#2A737D" },
  inlineCode: { bg: "rgba(0,0,0,0.06)", border: "rgba(0,0,0,0.1)" },
  link: { color: "#2266AA", underline: "rgba(34,102,170,0.3)", hoverBg: "rgba(34,102,170,0.06)" },
  wikilink: { color: "#2A737D", underline: "rgba(42,115,125,0.3)" },
  wikilinkBroken: {
    color: "rgba(0,0,0,0.35)",
    underline: "rgba(0,0,0,0.15)",
    hoverColor: "rgba(0,0,0,0.5)",
    hoverUnderline: "rgba(0,0,0,0.25)",
  },
  mark: { bg: "rgba(42, 115, 125, 0.18)" },
  calloutIconHover: "rgba(0,0,0,0.06)",
  tableToolbar: "rgba(0,0,0,0.03)",
  frontmatter: "rgba(0,0,0,0.02)",
  codeCopy: {
    bg: "rgba(255,255,255,0.7)",
    color: "rgba(0,0,0,0.45)",
    hoverBg: "rgba(0,0,0,0.08)",
    hoverColor: "rgba(0,0,0,0.8)",
    border: "rgba(0,0,0,0.08)",
  },
  codeLang: { color: "rgba(0,0,0,0.25)", hoverColor: "rgba(0,0,0,0.5)" },
  codeLangOption: { hoverBg: "rgba(0,0,0,0.06)" },
  codeSelection: "rgba(0,0,0,0.12)",
  caretColor: "#14110F",
  searchInputBg: "#FFFFFF",
  modalBg: "rgba(255,255,255,0.97)",
  modalShadow: "0 24px 48px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.08)",
  splitDivider: "#E9E9E9",
  splitActiveBorder: "#2A737D",
  splitDropZone: "rgba(42, 115, 125, 0.10)",
  syntax: {
    comment: "#8090A0",
    punctuation: "#4A5468",
    property: "#B85C20",
    string: "#3A7A20",
    operator: "#1A7090",
    keyword: "#6840A8",
    function: "#2860C8",
    variable: "#906820",
  },
};
