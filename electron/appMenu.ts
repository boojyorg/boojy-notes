import {
  Menu,
  ipcMain,
  shell,
  type BrowserWindow,
  type MenuItemConstructorOptions,
} from "electron";

/**
 * The application menu: every command the app has, with its shortcut
 * (2026-09-24). The menu does nothing itself. An item sends its id to the
 * window (`menu-command`), and the renderer runs the same function the key
 * runs (`useMenuBar`), so a command has one implementation whichever way it
 * is asked for. The renderer claims the keys it handles (preventDefault), so
 * whether macOS offers a shortcut to the page or to the menu first, it runs
 * once.
 *
 * The window says what can act (`menu-state`): Undo with nothing to take back,
 * the note items with no note open and the Format items outside a note are
 * greyed rather than left to do nothing.
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
};

const isMac = process.platform === "darwin";

/** Items that act on the note's file, which a blank draft does not have yet. */
const FILE_ITEMS = ["duplicate", "moveTo", "reveal", "trash"];

/** Items that act on the open note. */
const NOTE_ITEMS = [
  "rename",
  "find",
  "findReplace",
  "bold",
  "italic",
  "strikethrough",
  "highlight",
  "code",
  "link",
  "body",
  "h1",
  "h2",
  "h3",
  "todo",
  "bullet",
  "numbered",
  "quote",
];

/**
 * A block's kind, on Notion's keys: Option+Command and a digit on a Mac. Off a
 * Mac, Ctrl+Alt is AltGr on many layouts and types a character, so it is
 * Ctrl+Shift there, as Notion has it.
 */
const kindKey = (digit: number) => (isMac ? `Alt+Command+${digit}` : `Ctrl+Shift+${digit}`);

export function buildAppMenu({
  isDev,
  getMainWindow,
}: {
  isDev: boolean;
  getMainWindow: () => BrowserWindow | null;
}) {
  const send = (id: string) => () => getMainWindow()?.webContents.send("menu-command", id);
  const item = (
    id: string,
    label: string,
    accelerator?: string,
    extra: Partial<MenuItemConstructorOptions> = {},
  ): MenuItemConstructorOptions => ({ id, label, accelerator, click: send(id), ...extra });

  const settings = item("settings", isMac ? "Settings…" : "Settings", "CmdOrCtrl+,");
  const checkUpdates = item("checkUpdates", "Check for Updates…");

  const template: MenuItemConstructorOptions[] = [
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
        item("newNote", "New Note", "CmdOrCtrl+N"),
        item("newFolder", "New Folder", "Shift+CmdOrCtrl+N"),
        { type: "separator" },
        item("rename", "Rename"),
        item("duplicate", "Duplicate"),
        item("moveTo", "Move to…"),
        item("reveal", isMac ? "Show in Finder" : "Show in Folder"),
        { type: "separator" },
        item("trash", isMac ? "Move to Trash" : "Delete"),
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
        item("undo", "Undo", "CmdOrCtrl+Z"),
        item("redo", "Redo", isMac ? "Shift+Command+Z" : "Ctrl+Y"),
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        item("search", "Search Notes…", "CmdOrCtrl+P"),
        item("find", "Find…", "CmdOrCtrl+F"),
        item("findReplace", "Find and Replace…", "Alt+CmdOrCtrl+F"),
      ],
    },
    {
      label: "Format",
      submenu: [
        item("bold", "Bold", "CmdOrCtrl+B"),
        item("italic", "Italic", "CmdOrCtrl+I"),
        item("strikethrough", "Strikethrough", "Shift+CmdOrCtrl+S"),
        item("highlight", "Highlight", "Shift+CmdOrCtrl+H"),
        item("code", "Inline Code", "CmdOrCtrl+E"),
        item("link", "Link…", "CmdOrCtrl+K"),
        { type: "separator" },
        item("body", "Body Text", kindKey(0)),
        item("h1", "Heading 1", kindKey(1)),
        item("h2", "Heading 2", kindKey(2)),
        item("h3", "Heading 3", kindKey(3)),
        { type: "separator" },
        item("todo", "To-do List", kindKey(4)),
        item("bullet", "Bulleted List", kindKey(5)),
        item("numbered", "Numbered List", kindKey(6)),
        item("quote", "Quote"),
      ],
    },
    {
      label: "View",
      submenu: [
        item("toggleSidebar", "Toggle Sidebar", "CmdOrCtrl+\\"),
        { type: "separator" },
        // The app's own interface size, never Chromium's page zoom (the UI
        // rule, "One zoom system"): these run the same step the keys do.
        item("bigger", "Bigger", "CmdOrCtrl+Plus"),
        item("smaller", "Smaller", "CmdOrCtrl+-"),
        item("actualSize", "Actual Size", "CmdOrCtrl+0"),
        { type: "separator" },
        // Reload is a developer's key: it drops the renderer, and with it up
        // to ~800 ms of typing still inside the text-commit and write
        // debounces (the quit flush never runs). Dev builds only (2026-09-24).
        ...(isDev
          ? ([
              { role: "reload" },
              { role: "forceReload" },
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
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  const apply = (state: MenuState) => {
    const set = (id: string, enabled: boolean) => {
      const found = menu.getMenuItemById(id);
      if (found) found.enabled = enabled;
    };
    for (const id of NOTE_ITEMS) set(id, state.hasNote);
    for (const id of FILE_ITEMS) set(id, state.hasFile);
    // A text field's Undo is its own, whatever the note's history holds.
    set("undo", state.textField || state.canUndo);
    set("redo", state.textField || state.canRedo);
  };
  apply({ hasNote: false, hasFile: false, canUndo: false, canRedo: false, textField: false });
  ipcMain.on("menu-state", (_event, state: MenuState) => apply(state));
}
