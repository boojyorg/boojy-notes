import { useEffect, useRef } from "react";
import { getAPI } from "../services/apiProvider";
import { SCALE_DEFAULT, stepScale } from "../utils/uiScale";

/**
 * Global keyboard shortcuts for the app shell.
 *
 * The window listener is registered once. Everything it reads — state AND the
 * action callbacks — goes through `latest`, a ref refreshed on every render,
 * so a stale closure can never act on an old note or an old layout. This used
 * to capture the callbacks directly (re-registering only when Settings
 * toggled), and `cancelBlockDrag` used to write to whichever note was active
 * when it was captured (see useBlockDrag).
 *
 * The closest active surface owns the key (review 2026-09-07, §1.13, §4.6).
 * This handler is the last to see a keystroke, a bubble-phase listener on the
 * window, and it acts only on a key nobody above it has claimed:
 *
 * - a surface that takes a key prevents its default, and a prevented key is
 *   not the shell's (Escape in a menu, a rename field or the palette used to
 *   also reach the shell and act beneath it);
 * - a modal dialog or a menu that holds focus owns every key beneath it, so
 *   no shortcut runs over Settings, a confirm dialog or a context menu
 *   (Cmd+N over Settings made a note behind it, Cmd+K opened the palette on
 *   top of it); each of them closes itself on Escape;
 * - a native text field outside the editor (the palette's field, a rename
 *   field, the find bar) owns its editing keys: Cmd+Z there is the field's
 *   undo, not the note's. The title field and a code block's textarea are
 *   the editor's, so the note's undo stays theirs.
 *
 * A surface that needs to run before this handler listens on its element, on
 * the document, or in the capture phase — never on the window in the bubble
 * phase, where a listener registered after this one runs after it and its
 * preventDefault comes too late.
 *
 * The application menu (electron/appMenu.ts) is the same commands with a
 * pointer: an item arrives here as its id and runs what its key runs, under
 * the same ownership rules, and the hook tells the menu what can act so it
 * greys the rest.
 */
export function useAppKeyboard({
  activeNote,
  noteData,
  uiScale,
  blockDrag,
  sidebarDrag,
  titleRef,
  // Actions
  undo,
  redo,
  createNote,
  createFolder,
  revealSidebar,
  toggleSidebar,
  openSearch,
  openSettings,
  setUiScale,
  cancelBlockDrag,
  cancelSidebarDrag,
  // The menu's own commands
  canUndo,
  canRedo,
  renameNote,
  duplicateNote,
  moveNote,
  deleteNote,
  applyFormat,
  setBlockKind,
  openFind,
  detectActiveFormats,
  sidebarVisible,
  // The Markdown view: EditorArea's switch, and whether the view is on.
  toggleSourceView,
  sourceView,
}) {
  const latest = useRef(null);
  latest.current = {
    activeNote,
    noteData,
    uiScale,
    undo,
    redo,
    createNote,
    createFolder,
    revealSidebar,
    toggleSidebar,
    openSettings,
    openSearch,
    setUiScale,
    cancelBlockDrag,
    cancelSidebarDrag,
    renameNote,
    duplicateNote,
    moveNote,
    deleteNote,
    applyFormat,
    setBlockKind,
    openFind,
    detectActiveFormats,
    toggleSourceView,
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: every input is read through `latest` or a stable ref
  useEffect(() => {
    const handler = (e) => {
      const L = latest.current;
      // A drag is pointer-modal: Escape cancels it before anything else.
      if (e.key === "Escape" && blockDrag.current.active) {
        e.preventDefault();
        L.cancelBlockDrag();
        return;
      }
      if (e.key === "Escape" && sidebarDrag.current.active) {
        e.preventDefault();
        L.cancelSidebarDrag();
        return;
      }
      if (e.defaultPrevented) return;
      const owner = focusOwner();
      // The scale keys are the one shortcut Settings does not stand in front
      // of (2026-09-19, Tyr): the app resizes behind the open pane, so the keys
      // that resize it belong there too, and the row's figure follows. Every
      // other shortcut still stands down over every modal, and these stand down
      // over any other modal — including a confirm dialog opened *from*
      // Settings, which holds the focus the test below asks about.
      if ((e.ctrlKey || e.metaKey) && SCALE_KEYS.has(e.key)) {
        if (owner !== "modal" || settingsHoldsKeys()) {
          e.preventDefault();
          L.setUiScale(scaleFor(e.key, L.uiScale));
          return;
        }
      }
      if (owner === "modal") return;
      // Escape never reaches the sidebar: a panel the user can see sitting in
      // the layout is hidden by its toggle and by nothing else.
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && (key === "z" || key === "y")) {
        if (owner === "field") return;
        e.preventDefault();
        if (key === "z" && !e.shiftKey) L.undo();
        else L.redo();
        return;
      }
      // Cmd+Shift+N is New folder (Apple Notes' and Finder's key), at the
      // root; before 2026-09-17 the shell ignored Shift and made a note.
      if (mod && key === "n" && e.shiftKey) {
        e.preventDefault();
        L.createFolder?.(null);
        return;
      }
      if (mod && key === "n") {
        e.preventDefault();
        newNote(L, titleRef);
        return;
      }
      // Search is a palette over the window, so it needs no sidebar. Cmd+P
      // opens it; Cmd+K is the editor's link shortcut (2026-09-09), because
      // Boojy Notes has Search, not a command palette.
      if (mod && key === "p") {
        e.preventDefault();
        L.openSearch?.();
        return;
      }
      // Cmd+, is Settings, the platform's own key; Cmd+\ toggles the sidebar
      // (Notion's key; Apple's Option+Cmd+S is three keys, and Cmd+B is Bold
      // here). Both chosen 2026-09-17. The backslash is matched by the
      // physical key too, for layouts where the character sits elsewhere.
      if (mod && e.key === ",") {
        e.preventDefault();
        L.openSettings?.();
        return;
      }
      if (mod && (e.key === "\\" || e.code === "Backslash")) {
        e.preventDefault();
        L.toggleSidebar?.();
        return;
      }
      // Cmd+/ shows the note as its Markdown, and back (2026-09-24: Typora's
      // key; Obsidian's Cmd+E is inline code here). The slash is matched by
      // the physical key too, for layouts where the character needs Shift.
      if (mod && !e.altKey && (e.key === "/" || e.code === "Slash")) {
        if (!L.activeNote) return;
        e.preventDefault();
        L.toggleSourceView?.();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: every input is read through `latest` or a stable ref
  useEffect(() => {
    const api = getAPI();
    if (!api?.onMenuCommand) return;
    return api.onMenuCommand((id) => runMenuCommand(id, latest.current, titleRef));
  }, []);

  // What the menu shows: the note's items with a note open, Undo and Redo
  // with something to take back (or always in a text field, whose own they
  // are then), a check on the formats the selection holds and on the line's
  // kind, and Hide or Show Sidebar. Focus and the selection are watched, the
  // selection on a short timer since it moves on every keystroke; the main
  // process rebuilds the menu only when something it shows has changed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the selection's own reads go through `latest`
  useEffect(() => {
    const api = getAPI();
    if (!api?.setMenuState) return;
    const hasFile = !!activeNote && !noteData[activeNote]?._draft;
    const publish = () => {
      const L = latest.current;
      const blocks = L.noteData[L.activeNote]?.content?.blocks ?? [];
      const [caretBlock] = selectedBlockIds(blocks);
      const formats = caretBlock ? L.detectActiveFormats?.() : null;
      api.setMenuState({
        hasNote: !!activeNote,
        hasFile,
        canUndo: !!canUndo,
        canRedo: !!canRedo,
        textField: isTextField(document.activeElement),
        formats: formats ? Object.keys(formats).filter((f) => formats[f]) : [],
        kind: blocks.find((b) => b.id === caretBlock)?.type ?? null,
        sidebarVisible: !!sidebarVisible,
        sourceView: !!sourceView,
      });
    };
    let timer = null;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(publish, 120);
    };
    publish();
    document.addEventListener("focusin", publish);
    document.addEventListener("focusout", publish);
    document.addEventListener("selectionchange", soon);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("focusin", publish);
      document.removeEventListener("focusout", publish);
      document.removeEventListener("selectionchange", soon);
    };
  }, [activeNote, canUndo, canRedo, noteData, sidebarVisible, sourceView]);
}

/** Cmd+N and File → New Note: an empty draft is reused, focused at its name. */
function newNote(L, titleRef) {
  if (L.activeNote && L.noteData[L.activeNote]?._draft) {
    titleRef.current?.focus();
    return;
  }
  L.createNote(null);
}

/** A native text field outside the editor: its Undo is its own. */
function isTextField(el) {
  if (!el) return false;
  const tag = el.tagName;
  return (tag === "INPUT" || tag === "TEXTAREA") && !el.closest("[data-editor]");
}

const INLINE_FORMATS = new Set(["bold", "italic", "strikethrough", "highlight", "code", "link"]);
const BLOCK_KINDS = {
  body: "p",
  h1: "h1",
  h2: "h2",
  h3: "h3",
  todo: "checkbox",
  bullet: "bullet",
  numbered: "numbered",
  quote: "blockquote",
};

/** The ids of the blocks the selection runs through, first to last, in the editor. */
function selectedBlockIds(blocks) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return [];
  const idOf = (node) => {
    const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const block = el?.closest?.("[data-editor] [data-block-id]");
    return block?.getAttribute("data-block-id") ?? null;
  };
  const a = blocks.findIndex((b) => b.id === idOf(sel.anchorNode));
  const f = blocks.findIndex((b) => b.id === idOf(sel.focusNode));
  if (a === -1 || f === -1) return [];
  return blocks.slice(Math.min(a, f), Math.max(a, f) + 1).map((b) => b.id);
}

/**
 * One menu command, run as its key runs it and owned as its key is: nothing
 * acts under a modal dialog or a focused menu, except the scale over Settings
 * (the keys' own exception) and a text field's Undo, which is the field's.
 */
function runMenuCommand(id, L, titleRef) {
  const owner = focusOwner();
  if (id === "undo" || id === "redo") {
    if (isTextField(document.activeElement)) {
      document.execCommand(id);
      return;
    }
    if (owner === "modal") return;
    if (id === "undo") L.undo();
    else L.redo();
    return;
  }
  if (id === "bigger" || id === "smaller" || id === "actualSize") {
    if (owner === "modal" && !settingsHoldsKeys()) return;
    const key = id === "bigger" ? "+" : id === "smaller" ? "-" : "0";
    L.setUiScale(scaleFor(key, L.uiScale));
    return;
  }
  if (owner === "modal") return;
  const note = L.activeNote;
  switch (id) {
    case "newNote":
      return newNote(L, titleRef);
    case "newFolder":
      return L.createFolder?.(null);
    case "settings":
      return L.openSettings?.();
    case "checkUpdates":
      L.openSettings?.();
      getAPI()?.checkForUpdate?.();
      return;
    case "search":
      return L.openSearch?.();
    case "toggleSidebar":
      return L.toggleSidebar?.();
  }
  if (!note) return;
  switch (id) {
    case "toggleSourceView":
      return L.toggleSourceView?.();
    case "rename":
      return L.renameNote?.(note);
    case "duplicate":
      return L.duplicateNote?.(note);
    case "moveTo": {
      // The picker opens under the note's name in the top row, the place the
      // path of the note already stands.
      const r = document.querySelector("[data-title]")?.getBoundingClientRect();
      const anchor = r
        ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
        : { top: 48, bottom: 48, left: window.innerWidth / 2, right: window.innerWidth / 2 };
      return L.moveNote?.({ kind: "notes", ids: [note] }, anchor);
    }
    case "reveal":
      return getAPI()?.revealNote?.(note);
    case "trash":
      return L.deleteNote?.(note);
    case "find":
      return L.openFind?.("find");
    case "findNext":
      return L.openFind?.("next");
    case "findPrevious":
      return L.openFind?.("prev");
    case "replace":
      return L.openFind?.("replace");
  }
  const blocks = L.noteData[note]?.content?.blocks ?? [];
  if (INLINE_FORMATS.has(id)) {
    if (selectedBlockIds(blocks).length > 0) L.applyFormat?.(id);
    return;
  }
  if (id in BLOCK_KINDS) {
    const ids = selectedBlockIds(blocks);
    if (ids.length > 0) L.setBlockKind?.(note, ids, BLOCK_KINDS[id]);
  }
}

/** The keys that change the UI scale, with `+` in both its spellings. */
const SCALE_KEYS = new Set(["=", "+", "-", "0"]);

/**
 * The scale a key asks for. A press at either end of the range answers with
 * the scale it is already on: the chip it raises is the whole feedback the
 * scale has, and saying nothing reads as a missed keystroke rather than a
 * limit (2026-09-19). Setting the scale already held is a no-op for state.
 * From a custom scale the keys move to the nearest preset on the side they
 * point, so 93% goes up to 100 and down to 90.
 */
function scaleFor(key, current) {
  if (key === "0") return SCALE_DEFAULT;
  return stepScale(current, key === "-" ? -1 : 1);
}

/**
 * Whether the Settings pane is the modal on screen — the one place a scale key
 * may act over a modal. The test is which modal is *there*, not where focus
 * happens to be: the pane's focus trap places focus a frame after it opens,
 * and a key pressed inside that frame is still Settings' (measured
 * 2026-09-19). A confirm dialog opened from Settings is a second modal above
 * it, and a menu inside Settings holds the keys itself; the scale keys stand
 * down for both.
 */
function settingsHoldsKeys() {
  const modals = document.querySelectorAll('[aria-modal="true"]');
  if (modals.length !== 1 || !modals[0].hasAttribute("data-settings-pane")) return false;
  return !document.activeElement?.closest?.('[role="menu"]');
}

/**
 * Which kind of surface owns the keys: "modal" for a dialog or menu (every
 * key is its own), "field" for a native text field outside the editor (its
 * editing keys are its own), null when the shell may act. A modal dialog owns
 * them from the moment it is in the DOM, before its focus trap has placed
 * focus a frame later (a Cmd+N inside that frame made a note behind
 * Settings); a menu owns them while it holds focus.
 */
export function focusOwner() {
  if (document.querySelector('[aria-modal="true"]')) return "modal";
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  // A menu, or a non-modal dialog such as the path's folder popup, owns the
  // keys while it holds focus; a modal one owns them from the moment it exists.
  if (el.closest('[role="menu"], [role="dialog"]')) return "modal";
  const tag = el.tagName;
  if ((tag === "INPUT" || tag === "TEXTAREA") && !el.closest("[data-editor]")) return "field";
  return null;
}
