import {
  Menu,
  ipcMain,
  nativeImage,
  shell,
  type BrowserWindow,
  type MenuItemConstructorOptions,
  type NativeImage,
} from "electron";

/**
 * The application menu: every command the app has, with its shortcut
 * (2026-09-24; its layout judged from ASCII mockups the same day: Apple's
 * structure, a List submenu and Find submenu, the typed Markdown shown under a
 * block's name, icons only where Apple's own apps carry one).
 *
 * The menu does nothing itself. An item sends its id to the window
 * (`menu-command`), and the renderer runs the same function the key runs
 * (`useAppKeyboard`), so a command has one implementation whichever way it is
 * asked for. The renderer claims the keys it handles (preventDefault), so
 * whether macOS offers a shortcut to the page or to the menu first, it runs
 * once.
 *
 * The window says what is true (`menu-state`), and the menu is rebuilt from it
 * when it changes: what cannot act is greyed, the formats on the selection and
 * the line's kind carry a check, and the sidebar item says what it will do.
 */

export type MenuState = {
  /** A note is open, a blank draft included. */
  hasNote: boolean;
  /** The open note has a file: not a blank draft, which has none until its first keystroke. */
  hasFile: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** A text field outside the editor has focus, where Undo is the field's own. */
  textField: boolean;
  /** The inline formats on the selection (`bold`, `italic`, …). */
  formats: string[];
  /** The kind of the line the caret is in (`p`, `h2`, `bullet`, …), or null outside the editor. */
  kind: string | null;
  /** The alignment of the table column the caret is in, or null outside a table cell. */
  align: string | null;
  sidebarVisible: boolean;
  /** The Markdown view is on, so View offers the formatted one back. */
  sourceView: boolean;
};

const INITIAL: MenuState = {
  hasNote: false,
  hasFile: false,
  canUndo: false,
  canRedo: false,
  textField: false,
  formats: [],
  kind: null,
  align: null,
  sidebarVisible: true,
  sourceView: false,
};

const isMac = process.platform === "darwin";

/**
 * An SF Symbol as a menu icon: rendered large and scaled to 16pt with a 2x
 * representation, since the symbol comes back as one bitmap at the size asked
 * for, and marked a template so macOS inks it for the theme and the
 * highlighted row. Only on a Mac; elsewhere no item has one.
 */
const icons = new Map<string, NativeImage | undefined>();
function icon(symbol: string): NativeImage | undefined {
  if (!isMac) return undefined;
  if (icons.has(symbol)) return icons.get(symbol);
  const big = nativeImage.createFromNamedImage(symbol, { pointSize: 30 });
  let out: NativeImage | undefined;
  if (!big.isEmpty()) {
    out = nativeImage.createEmpty();
    out.addRepresentation({ scaleFactor: 1, buffer: big.resize({ height: 16 }).toPNG() });
    out.addRepresentation({ scaleFactor: 2, buffer: big.resize({ height: 32 }).toPNG() });
    out.setTemplateImage(true);
  }
  icons.set(symbol, out);
  return out;
}

function template(state: MenuState, isDev: boolean, send: (id: string) => () => void) {
  const noteless = !state.hasNote;
  const fileless = !state.hasFile;
  const item = (
    id: string,
    label: string,
    accelerator?: string,
    extra: Partial<MenuItemConstructorOptions> = {},
  ): MenuItemConstructorOptions => ({ id, label, accelerator, click: send(id), ...extra });
  const note = (id: string, label: string, accelerator?: string, extra = {}) =>
    item(id, label, accelerator, { enabled: !noteless, ...extra });
  const file = (id: string, label: string, extra = {}) =>
    item(id, label, undefined, { enabled: !fileless, ...extra });
  // A format carries a check while the selection holds it, as Pages does,
  // rather than renaming itself to its opposite.
  const format = (id: string, label: string, accelerator: string, symbol?: string) =>
    note(id, label, accelerator, {
      type: "checkbox",
      checked: state.formats.includes(id),
      icon: symbol ? icon(symbol) : undefined,
    });
  // A line's kind carries a check on the kind the caret's line is, and the
  // Markdown that makes it from the keyboard underneath its name.
  const kind = (id: string, type: string, label: string, typed?: string, accelerator?: string) =>
    note(id, label, accelerator, {
      type: "checkbox",
      checked: state.kind === type,
      ...(isMac && typed ? { sublabel: `Type ${typed} and a space` } : {}),
    });

  const settings = item("settings", isMac ? "Settings…" : "Settings", "CmdOrCtrl+,");
  const checkUpdates = item("checkUpdates", "Check for Updates…");

  return [
    ...(isMac
      ? [
          {
            label: "Boojy Notes",
            submenu: [
              { role: "about" },
              checkUpdates,
              { type: "separator" },
              settings,
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "File",
      submenu: [
        item("newNote", "New Note", "CmdOrCtrl+N", { icon: icon("square.and.pencil") }),
        item("newFolder", "New Folder", "Shift+CmdOrCtrl+N", { icon: icon("folder.badge.plus") }),
        { type: "separator" },
        note("rename", "Rename…"),
        file("duplicate", "Duplicate"),
        file("moveTo", "Move to…"),
        file("reveal", isMac ? "Show in Finder" : "Show in Folder"),
        { type: "separator" },
        file("trash", isMac ? "Move to Trash" : "Delete", { icon: icon("trash") }),
        { type: "separator" },
        ...(isMac ? [] : [settings, checkUpdates, { type: "separator" } as const]),
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        // Not the `undo` role: that is the browser's own undo, which in the
        // editor would take back a keystroke behind the app's history. The
        // renderer runs the app's Undo, or the focused field's own.
        item("undo", "Undo", "CmdOrCtrl+Z", {
          enabled: state.textField || state.canUndo,
          icon: icon("arrow.uturn.backward"),
        }),
        item("redo", "Redo", isMac ? "Shift+Command+Z" : "Ctrl+Y", {
          enabled: state.textField || state.canRedo,
          icon: icon("arrow.uturn.forward"),
        }),
        { type: "separator" },
        { role: "cut", icon: icon("scissors") },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        {
          label: "Find",
          submenu: [
            note("find", "Find…", "CmdOrCtrl+F", { icon: icon("magnifyingglass") }),
            note("findNext", "Find Next", "CmdOrCtrl+G"),
            note("findPrevious", "Find Previous", "Shift+CmdOrCtrl+G"),
            note("replace", "Replace…"),
            { type: "separator" },
            item("search", "Search All Notes…", "CmdOrCtrl+P"),
          ],
        },
      ],
    },
    {
      label: "Format",
      submenu: [
        format("bold", "Bold", "CmdOrCtrl+B", "bold"),
        format("italic", "Italic", "CmdOrCtrl+I", "italic"),
        format("strikethrough", "Strikethrough", "Shift+CmdOrCtrl+S", "strikethrough"),
        format("highlight", "Highlight", "Shift+CmdOrCtrl+H", "highlighter"),
        format("code", "Code", "CmdOrCtrl+E"),
        note("link", "Add Link…", "CmdOrCtrl+K", {
          type: "checkbox",
          checked: state.formats.includes("link"),
          icon: icon("link"),
        }),
        { type: "separator" },
        kind("h1", "h1", "Heading 1", "#", "CmdOrCtrl+1"),
        kind("h2", "h2", "Heading 2", "##", "CmdOrCtrl+2"),
        kind("h3", "h3", "Heading 3", "###", "CmdOrCtrl+3"),
        kind("body", "p", "Text"),
        { type: "separator" },
        {
          label: "List",
          enabled: !noteless,
          submenu: [
            kind("bullet", "bullet", "Bulleted List", "-"),
            kind("numbered", "numbered", "Numbered List", "1."),
            kind("todo", "checkbox", "Checklist", "[]"),
          ],
        },
        kind("quote", "blockquote", "Quote", ">"),
        { type: "separator" },
        // A table column's alignment, with the caret in one of its cells: the
        // column's own is checked, as a line's kind is.
        {
          label: "Align",
          enabled: state.align !== null,
          submenu: [
            ["alignLeft", "Left", "L", "left"],
            ["alignCenter", "Centre", "E", "center"],
            ["alignRight", "Right", "R", "right"],
          ].map(([id, label, key, value]) =>
            item(id, label, `Shift+CmdOrCtrl+${key}`, {
              type: "checkbox",
              enabled: state.align !== null,
              checked: state.align === value,
            }),
          ),
        },
      ],
    },
    {
      label: "View",
      submenu: [
        // Says what it will do, as Finder's Show/Hide Sidebar does.
        item(
          "toggleSidebar",
          state.sidebarVisible ? "Hide Sidebar" : "Show Sidebar",
          "CmdOrCtrl+\\",
        ),
        // Moves the keyboard into the sidebar's tree; Escape there comes back.
        item("goToSidebar", "Go to Sidebar", isMac ? "Ctrl+Cmd+S" : "Ctrl+Alt+S"),
        { type: "separator" },
        // The note as its file, and back: says what it will do, as the
        // sidebar item does, because a view is switched where a format is
        // checked (2026-09-24).
        note(
          "toggleSourceView",
          state.sourceView ? "Show Formatted" : "Show Markdown",
          "CmdOrCtrl+/",
        ),
        { type: "separator" },
        // The app's own interface size, never Chromium's page zoom (the UI
        // rule, "One zoom system"): these run the same step the keys do.
        item("bigger", "Zoom In", "CmdOrCtrl+Plus"),
        item("smaller", "Zoom Out", "CmdOrCtrl+-"),
        item("actualSize", "Actual Size", "CmdOrCtrl+0"),
        { type: "separator" },
        // Reload is a developer's key: it drops the renderer, and with it up
        // to ~800 ms of typing still inside the text-commit and write
        // debounces (the quit flush never runs). Dev builds only (2026-09-24).
        ...(isDev
          ? ([
              { role: "reload" },
              // Its own Shift+Cmd+R is a table column's Align Right.
              { role: "forceReload", accelerator: "Alt+Shift+CmdOrCtrl+R" },
              { role: "toggleDevTools" },
              { type: "separator" },
            ] as const)
          : []),
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac ? [{ type: "separator" } as const, { role: "front" } as const] : []),
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "Boojy Notes Website",
          click: () => shell.openExternal("https://boojy.org/notes"),
        },
      ],
    },
  ] as MenuItemConstructorOptions[];
}

export function buildAppMenu({
  isDev,
  getMainWindow,
}: {
  isDev: boolean;
  getMainWindow: () => BrowserWindow | null;
}) {
  const send = (id: string) => () => getMainWindow()?.webContents.send("menu-command", id);
  let current = "";
  const apply = (state: MenuState) => {
    // Rebuilt only when something it shows changed: the renderer reports on
    // every selection change, and most of those change nothing here.
    const key = JSON.stringify(state);
    if (key === current) return;
    current = key;
    Menu.setApplicationMenu(Menu.buildFromTemplate(template(state, isDev, send)));
  };
  apply(INITIAL);
  ipcMain.on("menu-state", (_event, state: Partial<MenuState>) => apply({ ...INITIAL, ...state }));
}
