// The one teal. Marks and fills — the checkbox, the quote bar, drop markers,
// focus rings, the selection band, switches — are
// the same colour in both themes (the wordmark's N is a gradient about it,
// drawn in assets/boojy-notes-n.svg): the misty brand teal (#A4CACE, hue 186) two
// steps deeper (more saturated reads blue). 2.0:1 on white, 9:1 on the dark
// sheet. What sits on it is white in both themes: 2:1, a soft tick by design,
// never body text. Accent *as ink* cannot be one colour — nothing passes 4.5:1
// on both grounds — so that is `ACCENT.text`, per theme.
export const MARK = "#8FC1C6";
export const ON_MARK = "#FFFFFF";

export const NIGHT = {
  name: "night",
  // Neutral grey ramp, no blue cast, small steps between regions:
  // the sheet at L* 8, the sidebar one step up at L* 13, hover/selected one
  // more. Grounds are neutral; the ink is one step warm (DAY's tilt read cream here).
  BG: {
    darkest: "#1C1C1C", // app ground
    standard: "#212121", // sidebar
    editor: "#181818", // writing sheet
    elevated: "#272727", // raised: menus, popovers, modals
    surface: "#282828", // content hover
    divider: "#313131", // border, ink @ 8% on the sidebar
    hover: "#2D2D2D", // row/menu hover + selected
  },
  TEXT: {
    primary: "#E7E6E5", // 13.9:1 on the sheet; one step warm (three read cream)
    secondary: "#ACABAA", // 7.0:1 on the sidebar
    muted: "#969594", // 4.6:1 on a hovered row, its lowest ground
  },
  ACCENT: {
    primary: MARK, // marks and fills: the one teal, shared with DAY
    text: "#9CC9CE", // accent as ink on the ground: misty, 9:1 on the sheet
    tagText: "#9CC9CE", // ink on the tag pill: 6.2:1 on its rest ground, 4.8:1 on hover
    onAccent: ON_MARK,
  },
  SEMANTIC: {
    warning: "#FFC107",
    error: "#FF6B3D", // 4.9:1 on a hovered row, 4.7:1 on a button (Delete)
    // The spelling dots: Chromium's own (Apple's red), as Obsidian shows them.
    // Under the 3:1 a meaningful glyph takes, by decision: a hint beside the
    // word, matched to every other app's.
    misspelled: "rgba(255, 59, 48, 0.76)",
  },
  scrollbar: {
    thumb: "#383838",
    thumbHover: "#474747",
    thumbActive: "#575757",
  },
  // Sidebar resize handle. Neutral by rule — the accent is identity, not a
  // surface, and a full-height accent bar was the loudest violation in the app.
  // At rest the divider is BG.divider; hover and drag are the next two steps
  // up, spelled out here so a change to the scrollbar's greys leaves them be.
  sidebarHandle: {
    hover: "#414141",
    active: "#525252",
  },
  codeBlockBg: "#121212",
  codeBlockBorder: "rgba(255,255,255,0.10)",
  codeBlockBorderFocus: "rgba(255,255,255,0.18)",
  transitionMs: 400,
  // Obsidian's colour families, each type where Obsidian puts it, but Tip greener
  // (off the app's teal) and Question amber (off Warning's orange). The ground is
  // the ink at `calloutGround` over the sheet, lower on Dark (a bright ink over
  // near-black reads stronger); an ink reads 4.5:1 on its ground.
  callouts: {
    note: { colour: "#4D9FF9" },
    info: { colour: "#4D9FF9" },
    abstract: { colour: "#0BCB8B" },
    tip: { colour: "#0BCB8B" },
    success: { colour: "#08B94E" },
    question: { colour: "#D68F00" },
    warning: { colour: "#F17800" },
    danger: { colour: "#F07281" },
    failure: { colour: "#F07281" },
    bug: { colour: "#F07281" },
    example: { colour: "#A78EF4" },
    quote: { colour: "#9E9E9E" },
  },
  calloutGround: 0.12,
  overlay: (a) => `rgba(255,255,255,${a})`,
  // Inline formatting colors
  inlineCode: { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.1)" },
  // One link ink for the web and for notes: the ↗ tells them apart.
  link: { color: "#9CC9CE", underline: "rgba(156,201,206,0.3)", hoverBg: "rgba(156,201,206,0.06)" },
  wikilinkBroken: {
    color: "rgba(255,255,255,0.4)",
    underline: "rgba(255,255,255,0.2)",
    hoverColor: "rgba(255,255,255,0.6)",
    hoverUnderline: "rgba(255,255,255,0.3)",
  },
  mark: { bg: "rgba(143, 193, 198, 0.4)" },
  calloutIconHover: "rgba(255,255,255,0.06)",
  codeSelection: "rgba(255,255,255,0.12)",
  caretColor: "#fff",
  /** Settings' bordered buttons: a step above the elevated ground so an enabled
   *  button reads as one before hover (on the divider alone it read disabled). */
  button: { bg: "#2F2F2F", border: "rgba(255,255,255,0.16)" },
  modalBg: "rgba(35,35,35,0.96)",
  modalShadow: "0 24px 48px rgba(0,0,0,0.4), 0 8px 16px rgba(0,0,0,0.2)",
  /** Lifted-while-dragging objects (block ghost, sidebar pill, drag tooltip). */
  dragShadow: "0 8px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.3)",
  /** A control floating over content (the image's hover bar): lifted just enough to part from a busy picture. */
  floatShadow: "0 1px 2px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.35)",
  /** The image's corner dots and full-size view. The same in both themes: a
   *  dot sits on the picture's corner, so a white fill (ringed in the mark)
   *  and a shadow show on a white picture and a dark one alike; the full-size
   *  view is a dark room whatever the theme (Obsidian's). */
  imageHandle: {
    fill: "#FFFFFF",
    shadow: "0 1px 3px rgba(20,17,15,0.25)",
  },
  lightbox: { scrim: "rgba(0,0,0,0.88)", ink: "#F4F4F5", hover: "rgba(255,255,255,0.12)" },
  /** A viewed PDF's paper, under its drawing: white in both themes, as the file is. */
  pageGround: "#FFFFFF",
  /** The Markdown view's list and task markers: plum, apart from the accent's teal. */
  sourceView: { list: "#C7A8DA" },
  syntax: {
    comment: "#838383", // 4.5:1 on the sheet, where the Markdown view shows code
    punctuation: "#ACABAA",
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
  //   hover   (#ECECEC) = row/menu hover AND selected (hover previews selection)
  // `elevated` and `editor` share #FFFFFF in light; they stay split for dark.
  BG: {
    darkest: "#FCFCFC", // app ground
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
    muted: "#6F6861", // 4.6:1 on a hovered row, its lowest ground
  },
  ACCENT: {
    primary: MARK, // marks and fills: the one teal, shared with NIGHT
    text: "#2A737D", // accent as ink on the ground: 5.5:1 on the sheet, 4.6:1 on a selected row
    tagText: "#24666F", // ink on the tag pill, a step deeper for its stronger ground: 5.4:1, 5.1:1 on hover
    onAccent: ON_MARK,
  },
  SEMANTIC: {
    warning: "#B07808", // a toast's glyph, never words: 3.2:1 on a hovered row
    error: "#C62D2D", // 4.7:1 on a hovered row
    misspelled: "rgba(255, 59, 48, 0.76)", // Chromium's dots, by decision (NIGHT says why)
  },
  scrollbar: {
    // A step past BG.divider, so the thumb shows at rest on the sidebar's grey.
    thumb: "#DEDCDA",
    thumbHover: "#C4C2BF",
    thumbActive: "#A8A5A2",
  },
  // See NIGHT.sidebarHandle.
  sidebarHandle: {
    hover: "#C9C7C5",
    active: "#A8A5A2",
  },
  codeBlockBg: "#F4F4F5",
  codeBlockBorder: "rgba(0,0,0,0.08)",
  codeBlockBorderFocus: "rgba(0,0,0,0.15)",
  transitionMs: 400,
  // Obsidian's colour families, each type where Obsidian puts it, but Tip greener
  // (off the app's teal) and Question amber (off Warning's orange). The ground is
  // the ink at `calloutGround` over the sheet, lower on Dark (a bright ink over
  // near-black reads stronger); an ink reads 4.5:1 on its ground.
  callouts: {
    note: { colour: "#075CBB" },
    info: { colour: "#075CBB" },
    abstract: { colour: "#066B49" },
    tip: { colour: "#066B49" },
    success: { colour: "#056B2D" },
    question: { colour: "#855800" },
    warning: { colour: "#954A00" },
    danger: { colour: "#B51327" },
    failure: { colour: "#B51327" },
    bug: { colour: "#B51327" },
    example: { colour: "#6236EB" },
    quote: { colour: "#616161" },
  },
  calloutGround: 0.2,
  overlay: (a) => `rgba(0,0,0,${a})`,
  inlineCode: { bg: "rgba(0,0,0,0.06)", border: "rgba(0,0,0,0.1)" },
  // One link ink for the web and for notes: the ↗ tells them apart.
  link: { color: "#2A737D", underline: "rgba(42,115,125,0.3)", hoverBg: "rgba(42,115,125,0.06)" },
  wikilinkBroken: {
    color: "rgba(0,0,0,0.35)",
    underline: "rgba(0,0,0,0.15)",
    hoverColor: "rgba(0,0,0,0.5)",
    hoverUnderline: "rgba(0,0,0,0.25)",
  },
  mark: { bg: "rgba(143, 193, 198, 0.35)" },
  calloutIconHover: "rgba(0,0,0,0.06)",
  codeSelection: "rgba(0,0,0,0.12)",
  caretColor: "#14110F",
  button: { bg: "transparent", border: "#DCDCDC" },
  modalBg: "rgba(255,255,255,0.97)",
  modalShadow: "0 24px 48px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.08)",
  /** Lifted-while-dragging objects (block ghost, sidebar pill, drag tooltip). */
  dragShadow: "0 8px 24px rgba(20,17,15,0.12), 0 2px 6px rgba(20,17,15,0.08)",
  /** A control floating over content (the image's hover bar): lifted just enough to part from a busy picture. */
  floatShadow: "0 1px 2px rgba(20,17,15,0.06), 0 4px 12px rgba(20,17,15,0.08)",
  /** The image's corner dots and full-size view. The same in both themes: a
   *  dot sits on the picture's corner, so a white fill (ringed in the mark)
   *  and a shadow show on a white picture and a dark one alike; the full-size
   *  view is a dark room whatever the theme (Obsidian's). */
  imageHandle: {
    fill: "#FFFFFF",
    shadow: "0 1px 3px rgba(20,17,15,0.25)",
  },
  lightbox: { scrim: "rgba(0,0,0,0.88)", ink: "#F4F4F5", hover: "rgba(255,255,255,0.12)" },
  /** A viewed PDF's paper, under its drawing: white in both themes, as the file is. */
  pageGround: "#FFFFFF",
  /** The Markdown view's list and task markers: plum, apart from the accent's teal. */
  sourceView: { list: "#80508F" },
  syntax: {
    // Comment and property darkened to read at 4.5:1 on the code block's ground.
    comment: "#5F6B78",
    punctuation: "#4A5468",
    property: "#A65218",
    string: "#3A7A20",
    operator: "#1A7090",
    keyword: "#6840A8",
    function: "#2860C8",
    variable: "#906820",
  },
};
