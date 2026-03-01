import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useAuth } from "./hooks/useAuth";
import { useSync } from "./hooks/useSync";
import { useFileSystem } from "./hooks/useFileSystem";
import { BG, TEXT, ACCENT, SEMANTIC, BRAND } from "./constants/colors";
import { FOLDER_TREE, SLASH_COMMANDS } from "./constants/data";
import { hexToRgb, rgbToHex } from "./utils/colorUtils";
import { genBlockId, genNoteId, setBlockIdCounter, STORAGE_KEY, loadFromStorage } from "./utils/storage";
import {
  ChevronRight, ChevronDown, FolderIcon, FileIcon,
  SearchIcon, CloseIcon, UndoIcon, RedoIcon,
  NewNoteIcon, NewFolderIcon, SidebarToggleIcon,
  BreadcrumbChevron, TrashIcon,
} from "./components/Icons";
import StarField from "./components/StarField";
import EditableBlock from "./components/EditableBlock";
import SettingsModal from "./components/SettingsModal";

export default function BoojyNotes() {
  // --- State ---
  const [expanded, setExpanded] = useState(() => {
    const ui = (() => { try { return JSON.parse(localStorage.getItem("boojy-ui-state")); } catch { return null; } })();
    if (ui?.expanded) return ui.expanded;
    const saved = loadFromStorage();
    return saved?.expanded || { "Boojy": true };
  });
  const [activeNote, setActiveNote] = useState(() => {
    const ui = (() => { try { return JSON.parse(localStorage.getItem("boojy-ui-state")); } catch { return null; } })();
    if (ui?.activeNote) return ui.activeNote;
    const saved = loadFromStorage();
    return (saved?.activeNote && saved.noteData?.[saved.activeNote]) ? saved.activeNote : null;
  });
  const [tabs, setTabs] = useState(() => {
    const ui = (() => { try { return JSON.parse(localStorage.getItem("boojy-ui-state")); } catch { return null; } })();
    if (ui?.tabs?.length > 0) return ui.tabs;
    const saved = loadFromStorage();
    if (saved?.tabs) {
      const valid = saved.tabs.filter(id => saved.noteData?.[id]);
      if (valid.length > 0) return valid;
    }
    return [];
  });
  const [newTabId, setNewTabId] = useState(null);
  const [closingTabs, setClosingTabs] = useState(new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [rightPanel, setRightPanel] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [rightPanelWidth, setRightPanelWidth] = useState(220);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [settingsFontSize, setSettingsFontSize] = useState(15);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("profile");
  const { user, profile, signInWithEmail, signUpWithEmail, signInWithOAuth, signOut, resendVerification } = useAuth();

  // Re-open settings after OAuth redirect (Google/Apple login reloads the page)
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    if (hash.includes("access_token") || params.has("code")) {
      setSettingsOpen(true);
      setSettingsTab("profile");
    }
  }, []);

  const [editorFadeIn, setEditorFadeIn] = useState(false);
  const [devOverlay, setDevOverlay] = useState(false);
  const [devToast, setDevToast] = useState(null);
  const [chromeBg, setChromeBg] = useState(BG.dark);
  const [editorBg, setEditorBg] = useState(BG.editor);
  const [topBarEdge, setTopBarEdge] = useState("B");
  const [createBtnStyle, setCreateBtnStyle] = useState("A");
  const [accentColor, setAccentColor] = useState(ACCENT.primary);
  const [activeTabBg, setActiveTabBg] = useState("#1C1C20");
  const [tabFlip, setTabFlip] = useState(false);
  const [selectionStyle, setSelectionStyle] = useState("B");
  const [noteData, setNoteData] = useState(() => {
    if (window.electronAPI) return {}; // Electron: useFileSystem loads from disk
    const saved = loadFromStorage();
    if (saved?.noteData) {
      // Resume _blockId counter to avoid collisions
      let maxId = 0;
      for (const n of Object.values(saved.noteData)) {
        for (const b of n.content.blocks) {
          if (b.id?.startsWith("blk-")) {
            const num = parseInt(b.id.slice(4), 10);
            if (num > maxId) maxId = num;
          }
        }
      }
      setBlockIdCounter(maxId);
      return saved.noteData;
    }
    return {};
  });
  const [, forceRender] = useState(0);
  const [slashMenu, setSlashMenu] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, type: "note"|"folder", id }
  const [renamingFolder, setRenamingFolder] = useState(null); // folder name being renamed
  const [customFolders, setCustomFolders] = useState(() => {
    if (window.electronAPI) return []; // Electron: useFileSystem loads from disk
    const saved = loadFromStorage();
    return saved?.customFolders || [];
  });

  // --- Sync ---
  const { syncState, lastSynced, storageUsed, storageLimitMB, syncAll } = useSync(user, profile, noteData, setNoteData);

  // --- Filesystem (Electron) ---
  const { isElectron: isDesktop, notesDir, loading: fsLoading, changeNotesDir } = useFileSystem(noteData, setNoteData, setCustomFolders);

  // --- Refs ---
  const isDragging = useRef(false);
  const sidebarHandles = useRef([]);
  const rightPanelHandles = useRef([]);
  const tabScrollRef = useRef(null);
  const searchInputRef = useRef(null);
  const [tabAreaWidth, setTabAreaWidth] = useState(600);
  const blockRefs = useRef({});
  const editorRef = useRef(null);
  const titleRef = useRef(null);
  const focusBlockId = useRef(null);
  const focusCursorPos = useRef(null);
  const mouseIsDown = useRef(false); // true while mouse button is held — lets handleEditorFocus defer to handleEditorMouseUp
  const noteDataRef = useRef(noteData);
  noteDataRef.current = noteData;
  const syncGeneration = useRef(0); // bumped on undo/redo to force DOM resync
  const slashMenuRef = useRef(slashMenu);
  slashMenuRef.current = slashMenu;
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const historyTimer = useRef(null);
  const isUndoRedo = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // --- History wrappers ---
  const pushHistory = () => {
    undoStack.current.push(structuredClone(noteDataRef.current));
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  };

  const commitNoteData = (updater) => {
    if (!isUndoRedo.current) pushHistory();
    setNoteData(updater);
  };

  const commitTextChange = (updater) => {
    if (!isUndoRedo.current) {
      if (!historyTimer.current) {
        pushHistory();
      } else {
        clearTimeout(historyTimer.current);
      }
      historyTimer.current = setTimeout(() => { historyTimer.current = null; }, 500);
    }
    setNoteData(updater);
  };

  const undo = () => {
    if (undoStack.current.length === 0) return;
    redoStack.current.push(structuredClone(noteDataRef.current));
    isUndoRedo.current = true;
    syncGeneration.current++;
    setNoteData(undoStack.current.pop());
    isUndoRedo.current = false;
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  };

  const redo = () => {
    if (redoStack.current.length === 0) return;
    undoStack.current.push(structuredClone(noteDataRef.current));
    isUndoRedo.current = true;
    syncGeneration.current++;
    setNoteData(redoStack.current.pop());
    isUndoRedo.current = false;
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
  };

  // --- Effects ---
  useEffect(() => {
    setEditorFadeIn(false);
    const t = setTimeout(() => setEditorFadeIn(true), 30);
    return () => clearTimeout(t);
  }, [activeNote]);

  useLayoutEffect(() => {
    if (titleRef.current && noteData[activeNote]) {
      titleRef.current.innerText = noteData[activeNote].content.title;
    }
  }, [activeNote]);

  // Note: blockRefs cleanup is handled by EditableBlock's useEffect cleanup (registerRef(id, null) on unmount).
  // Do NOT clear blockRefs here — parent effects fire AFTER child effects, which would wipe freshly registered refs.

  // Track tab scroll container width
  useEffect(() => {
    const el = tabScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setTabAreaWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Undo/Redo keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" && settingsOpen) { e.preventDefault(); setSettingsOpen(false); return; }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if (mod && e.key === "z" && e.shiftKey) { e.preventDefault(); redo(); }
      if (mod && e.key === "y") { e.preventDefault(); redo(); }
      if (mod && e.key === ".") { e.preventDefault(); setDevOverlay(v => !v); }
      if (mod && e.key === ",") {
        e.preventDefault();
        setTabStyleB(v => {
          const next = !v;
          setDevToast(`Tab style: ${next ? "B" : "A"}`);
          setTimeout(() => setDevToast(null), 1500);
          return next;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settingsOpen]);

  // Persist UI state to localStorage (always, even in Electron)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("boojy-ui-state", JSON.stringify({ tabs, activeNote, expanded }));
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [tabs, activeNote, expanded]);

  // Persist noteData to localStorage (web only — Electron uses filesystem)
  useEffect(() => {
    if (window.electronAPI) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ noteData, tabs, activeNote, expanded, customFolders }));
      } catch (e) {
        console.warn("Failed to save to localStorage:", e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [noteData, tabs, activeNote, expanded, customFolders]);

  // Focus management — runs synchronously after DOM update, before browser paint
  useLayoutEffect(() => {
    if (focusBlockId.current) {
      cleanOrphanNodes(); // Only clean after structural ops (Enter/Backspace), not every keystroke
      const targetId = focusBlockId.current;
      const targetPos = focusCursorPos.current ?? 0;
      focusBlockId.current = null;
      focusCursorPos.current = null;
      const el = blockRefs.current[targetId];
      const success = placeCaret(el, targetPos);
      // Always verify after paint — catches cases where placeCaret succeeded
      // but the browser reset the selection during the focus transition
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (sel.rangeCount && getBlockFromNode(sel.anchorNode)) return; // Cursor is in a block
        const freshEl = blockRefs.current[targetId];
        if (freshEl) placeCaret(freshEl, targetPos);
      });
    }
  });

  // --- Drag handlers ---
  const startDrag = (e) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    // Disable transitions during drag for instant response
    document.documentElement.classList.add("sidebar-dragging");
    const onMove = (ev) => {
      if (!isDragging.current) return;
      setSidebarWidth(Math.min(400, Math.max(200, ev.clientX)));
    };
    const onUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.documentElement.classList.remove("sidebar-dragging");
      sidebarHandles.current.forEach(h => h && (h.style.background = ""));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startRightDrag = (e) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.documentElement.classList.add("sidebar-dragging");
    const onMove = (ev) => {
      if (!isDragging.current) return;
      setRightPanelWidth(Math.min(500, Math.max(140, window.innerWidth - ev.clientX)));
    };
    const onUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.documentElement.classList.remove("sidebar-dragging");
      rightPanelHandles.current.forEach(h => h && (h.style.background = ""));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // --- Navigation helpers ---
  const toggle = (n) => setExpanded((p) => ({ ...p, [n]: !p[n] }));
  const openNote = (id) => {
    setActiveNote(id);
    if (!tabs.includes(id)) {
      setTabs([...tabs, id]);
      setNewTabId(id);
      setTimeout(() => setNewTabId(null), 250);
    }
  };
  const closeTab = (e, id) => {
    e.stopPropagation();
    setClosingTabs(prev => new Set([...prev, id]));
    setTimeout(() => {
      setClosingTabs(prev => { const next = new Set(prev); next.delete(id); return next; });
      setTabs(prev => prev.filter(t => t !== id));
      if (activeNote === id) {
        const next = tabs.filter(t => t !== id);
        setActiveNote(next[next.length - 1] || null);
      }
    }, 180);
  };

  // --- Derived data ---
  const note = activeNote ? noteData[activeNote] : null;
  const wordCount = note ? note.content.blocks
    .filter(b => b.text)
    .reduce((sum, b) => sum + b.text.split(/\s+/).filter(Boolean).length, 0) : 0;

  // Derive nested folder tree and root notes from noteData
  const derivedRootNotes = [];
  const folderNoteMap = {}; // "Boojy" -> [noteIds], "Boojy/Boojy Audio" -> [noteIds]
  for (const [id, n] of Object.entries(noteData)) {
    if (n.folder) {
      if (!folderNoteMap[n.folder]) folderNoteMap[n.folder] = [];
      folderNoteMap[n.folder].push(id);
    } else {
      derivedRootNotes.push(id);
    }
  }

  // Build tree from FOLDER_TREE template, merging in dynamic note assignments
  const buildTree = (nodes) => nodes.map(node => {
    const path = node._path || node.name;
    return {
      name: node.name,
      _path: path,
      notes: folderNoteMap[path] || [],
      children: buildTree((node.children || []).map(c => ({ ...c, _path: path + "/" + c.name }))),
    };
  });

  // Collect all known folder paths from FOLDER_TREE
  const collectPaths = (nodes, prefix = "") => {
    const paths = [];
    for (const n of nodes) {
      const p = prefix ? prefix + "/" + n.name : n.name;
      paths.push(p);
      paths.push(...collectPaths(n.children || [], p));
    }
    return paths;
  };
  // Merge custom folders into the tree template
  const allFolders = [
    ...FOLDER_TREE,
    ...customFolders.map(name => ({ name, children: [], notes: [] })),
  ];
  const knownPaths = new Set(collectPaths(allFolders));

  // Also add any folders from noteData that aren't in the tree (dynamically created)
  for (const path of Object.keys(folderNoteMap)) {
    if (!knownPaths.has(path)) {
      knownPaths.add(path);
    }
  }

  const folderTree = buildTree(allFolders);

  // --- Block CRUD ---
  const updateBlockText = (noteId, blockIndex, newText) => {
    commitTextChange(prev => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks[blockIndex] = { ...blocks[blockIndex], text: newText };
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
  };

  const insertBlockAfter = (noteId, afterIndex, type = "p", text = "") => {
    const newBlock = { id: genBlockId(), type, text };
    if (type === "checkbox") newBlock.checked = false;
    commitNoteData(prev => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks.splice(afterIndex + 1, 0, newBlock);
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
    focusBlockId.current = newBlock.id;
    focusCursorPos.current = 0;
  };

  const deleteBlock = (noteId, blockIndex) => {
    commitNoteData(prev => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks.splice(blockIndex, 1);
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
  };

  const flipCheck = useCallback((noteId, blockIndex) => {
    commitNoteData(prev => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks[blockIndex] = { ...blocks[blockIndex], checked: !blocks[blockIndex].checked };
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
  }, []);

  const registerBlockRef = useCallback((id, el) => {
    if (el) blockRefs.current[id] = el;
    else delete blockRefs.current[id];
  }, []);

  // --- Note CRUD ---
  const createNote = (folder = null) => {
    const id = genNoteId();
    const firstBlockId = genBlockId();
    const pathParts = folder ? [...folder.split("/"), "Untitled"] : undefined;
    const newNote = {
      id, title: "Untitled", folder,
      path: pathParts,
      content: { title: "Untitled", blocks: [{ id: firstBlockId, type: "p", text: "" }] },
      words: 0,
    };
    commitNoteData(prev => ({ ...prev, [id]: newNote }));
    setTabs(prev => [...prev, id]);
    setActiveNote(id);
    setTimeout(() => {
      if (titleRef.current) {
        titleRef.current.focus();
        const range = document.createRange();
        range.selectNodeContents(titleRef.current);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, 50);
  };

  const deleteNote = (noteId) => {
    commitNoteData(prev => {
      const next = { ...prev };
      delete next[noteId];
      return next;
    });
    setTabs(prev => {
      const next = prev.filter(t => t !== noteId);
      if (activeNote === noteId) setActiveNote(next[next.length - 1] || null);
      return next;
    });
  };

  const duplicateNote = (noteId) => {
    const src = noteDataRef.current[noteId];
    if (!src) return;
    const id = genNoteId();
    const dup = {
      ...src, id, title: src.title + " (copy)",
      content: {
        title: src.title + " (copy)",
        blocks: src.content.blocks.map(b => ({ ...b, id: genBlockId() })),
      },
    };
    commitNoteData(prev => ({ ...prev, [id]: dup }));
    setTabs(prev => [...prev, id]);
    setActiveNote(id);
  };

  const renameFolder = (oldPath, newName) => {
    if (!newName) return;
    const parts = oldPath.split("/");
    parts[parts.length - 1] = newName;
    const newPath = parts.join("/");
    if (newPath === oldPath) return;
    commitNoteData(prev => {
      const next = { ...prev };
      for (const [id, n] of Object.entries(next)) {
        if (n.folder && (n.folder === oldPath || n.folder.startsWith(oldPath + "/"))) {
          const updated = { ...n, folder: n.folder.replace(oldPath, newPath) };
          if (updated.path) {
            const oldLast = oldPath.split("/").pop();
            updated.path = updated.path.map(s => s === oldLast ? newName : s);
          }
          next[id] = updated;
        }
      }
      return next;
    });
    setExpanded(prev => {
      const next = {};
      for (const [key, val] of Object.entries(prev)) {
        if (key === oldPath) next[newPath] = val;
        else if (key.startsWith(oldPath + "/")) next[key.replace(oldPath, newPath)] = val;
        else next[key] = val;
      }
      return next;
    });
    // Update customFolders if this was a custom folder
    setCustomFolders(prev => prev.map(f => f === oldPath ? newName : f));
  };

  const deleteFolder = (folderPath) => {
    // Delete all notes in this folder and its subfolders
    const noteIds = Object.entries(noteDataRef.current)
      .filter(([, n]) => n.folder && (n.folder === folderPath || n.folder.startsWith(folderPath + "/")))
      .map(([id]) => id);
    commitNoteData(prev => {
      const next = { ...prev };
      noteIds.forEach(id => delete next[id]);
      return next;
    });
    setTabs(prev => {
      const next = prev.filter(t => !noteIds.includes(t));
      if (noteIds.includes(activeNote)) setActiveNote(next[next.length - 1] || null);
      return next;
    });
    // Remove from customFolders if it was a custom folder
    setCustomFolders(prev => prev.filter(f => f !== folderPath));
  };

  const createFolder = () => {
    let name = "Untitled Folder";
    // Avoid duplicates
    const existingNames = new Set([
      ...FOLDER_TREE.map(f => f.name),
      ...customFolders,
    ]);
    if (existingNames.has(name)) {
      let i = 2;
      while (existingNames.has(`${name} ${i}`)) i++;
      name = `${name} ${i}`;
    }
    setCustomFolders(prev => [...prev, name]);
    setExpanded(prev => ({ ...prev, [name]: false }));
    setTimeout(() => setRenamingFolder(name), 50);
  };

  // --- Slash command execution ---
  const executeSlashCommand = (noteId, blockIndex, command) => {
    const blocks = noteDataRef.current[noteId].content.blocks;
    const block = blocks[blockIndex];
    const el = blockRefs.current[block.id];
    if (el) el.innerText = "";
    // Single commit for text clear + type change
    commitNoteData(prev => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blks = [...n.content.blocks];
      const updated = { ...blks[blockIndex], text: "", type: command.type };
      if (command.type === "checkbox") updated.checked = false;
      if (command.type === "spacer") { delete updated.text; delete updated.checked; }
      if (command.type !== "checkbox") delete updated.checked;
      blks[blockIndex] = updated;
      n.content = { ...n.content, blocks: blks };
      next[noteId] = n;
      return next;
    });
    if (command.type === "spacer") {
      insertBlockAfter(noteId, blockIndex, "p", "");
    } else {
      focusBlockId.current = block.id;
      focusCursorPos.current = 0;
    }
  };

  // --- Block input handler ---
  const handleBlockInput = (noteId, blockIndex) => {
    const blocks = noteDataRef.current[noteId].content.blocks;
    const el = blockRefs.current[blocks[blockIndex]?.id];
    if (!el) return;
    const raw = el.innerText.replace(/[\n\r]+$/, "").replace(/^[\n\r]+/, "");
    const text = raw === "\n" ? "" : raw;
    updateBlockText(noteId, blockIndex, text);

    // Markdown shortcuts — detect trigger patterns
    // contentEditable uses \u00a0 (non-breaking space) so match both \s and \u00a0
    const S = "[\\s\\u00a0]"; // space character class
    const mdPatterns = [
      { regex: new RegExp(`^###${S}$`), type: "h3" },
      { regex: new RegExp(`^##${S}$`), type: "h2" },
      { regex: new RegExp(`^#${S}$`), type: "h1" },
      { regex: new RegExp(`^[-*]${S}$`), type: "bullet" },
      { regex: new RegExp(`^\\[\\]${S}$`), type: "checkbox" },
      { regex: new RegExp(`^\\[${S}\\]${S}$`), type: "checkbox" },
      { regex: /^---$/, type: "spacer" },
    ];
    const currentBlock = noteDataRef.current[noteId].content.blocks[blockIndex];
    for (const pat of mdPatterns) {
      if (pat.regex.test(text)) {
        el.innerText = "";
        // Single commit for text clear + type change
        commitNoteData(prev => {
          const next = { ...prev };
          const n = { ...next[noteId] };
          const blks = [...n.content.blocks];
          const updated = { ...blks[blockIndex], text: "", type: pat.type };
          if (pat.type === "checkbox") updated.checked = false;
          if (pat.type === "spacer") { delete updated.text; delete updated.checked; }
          if (pat.type !== "checkbox") delete updated.checked;
          blks[blockIndex] = updated;
          n.content = { ...n.content, blocks: blks };
          next[noteId] = n;
          return next;
        });
        if (pat.type === "spacer") {
          insertBlockAfter(noteId, blockIndex, "p", "");
        } else {
          focusBlockId.current = currentBlock.id;
          focusCursorPos.current = 0;
        }
        return;
      }
    }

    const trimmed = text.trim();
    if (trimmed === "/") {
      const rect = el.getBoundingClientRect();
      setSlashMenu({ noteId, blockIndex, filter: "", selectedIndex: 0, rect: { top: rect.bottom + 4, left: rect.left } });
    } else if (slashMenuRef.current && slashMenuRef.current.blockIndex === blockIndex) {
      if (trimmed.startsWith("/")) {
        setSlashMenu(prev => prev ? { ...prev, filter: trimmed.slice(1), selectedIndex: 0 } : null);
      } else {
        setSlashMenu(null);
      }
    }
  };

  // --- Block keyboard handler ---
  const handleBlockKeyDown = (noteId, blockIndex, e) => {
    const blocks = noteDataRef.current[noteId].content.blocks;
    const block = blocks[blockIndex];
    const el = blockRefs.current[block.id];

    if (!el) {
      // Ref not registered yet — bail safely
      return;
    }

    // Slash menu navigation
    if (slashMenuRef.current && slashMenuRef.current.blockIndex === blockIndex) {
      const sm = slashMenuRef.current;
      const filtered = SLASH_COMMANDS.filter(c => c.label.toLowerCase().includes(sm.filter.toLowerCase()));
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashMenu(prev => prev ? { ...prev, selectedIndex: Math.min(prev.selectedIndex + 1, filtered.length - 1) } : null); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashMenu(prev => prev ? { ...prev, selectedIndex: Math.max(prev.selectedIndex - 1, 0) } : null); return; }
      if (e.key === "Enter") { e.preventDefault(); if (filtered.length > 0) executeSlashCommand(noteId, blockIndex, filtered[sm.selectedIndex] || filtered[0]); setSlashMenu(null); return; }
      if (e.key === "Escape") { e.preventDefault(); setSlashMenu(null); return; }
    }

    const text = el ? el.innerText.replace(/\n$/, "") : "";

    // Enter — split block
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const blockType = blocks[blockIndex].type;
      const isList = blockType === "bullet" || blockType === "checkbox";

      // Empty list item → convert to plain paragraph (Obsidian behavior)
      if (isList && text.trim() === "") {
        el.innerText = "";
        commitNoteData(prev => {
          const next = { ...prev };
          const n = { ...next[noteId] };
          const blks = [...n.content.blocks];
          const updated = { ...blks[blockIndex], type: "p", text: "" };
          delete updated.checked;
          blks[blockIndex] = updated;
          n.content = { ...n.content, blocks: blks };
          next[noteId] = n;
          return next;
        });
        focusBlockId.current = blocks[blockIndex].id;
        focusCursorPos.current = 0;
        return;
      }

      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      // Clone before-cursor content into temp element, read innerText to preserve line breaks
      // (Range.toString() only concatenates Text nodes and drops <br>/<div> line breaks)
      const preRange = document.createRange();
      preRange.selectNodeContents(el);
      preRange.setEnd(range.startContainer, range.startOffset);
      const preDiv = document.createElement("div");
      preDiv.appendChild(preRange.cloneContents());
      const beforeText = preDiv.innerText;
      // Clone after-selection content the same way (use range end, not start, to exclude selected text)
      const postRange = document.createRange();
      postRange.selectNodeContents(el);
      postRange.setStart(range.endContainer, range.endOffset);
      const postDiv = document.createElement("div");
      postDiv.appendChild(postRange.cloneContents());
      const afterText = postDiv.innerText;
      if (beforeText === "") {
        el.innerHTML = "<br>";
      } else {
        el.innerText = beforeText;
      }
      updateBlockText(noteId, blockIndex, beforeText);
      // Continue list type, or plain paragraph for other blocks
      insertBlockAfter(noteId, blockIndex, isList ? blockType : "p", afterText);
    }

    // Backspace
    if (e.key === "Backspace") {
      // Empty block — delete it
      if (text === "") {
        if (blocks.length <= 1) return;
        e.preventDefault();
        let prevIdx = blockIndex - 1;
        while (prevIdx >= 0 && blocks[prevIdx].type === "spacer") prevIdx--;
        if (prevIdx >= 0) {
          focusBlockId.current = blocks[prevIdx].id;
          focusCursorPos.current = (blocks[prevIdx].text || "").length;
        }
        deleteBlock(noteId, blockIndex);
        return;
      }
      // Cursor at start — merge with previous
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (range.collapsed) {
          const preRange = document.createRange();
          preRange.selectNodeContents(el);
          preRange.setEnd(range.startContainer, range.startOffset);
          if (preRange.toString().length === 0) {
            let prevIdx = blockIndex - 1;
            while (prevIdx >= 0 && blocks[prevIdx].type === "spacer") prevIdx--;
            if (prevIdx >= 0) {
              e.preventDefault();
              const prevBlock = blocks[prevIdx];
              const prevText = prevBlock.text || "";
              const cursorPos = prevText.length;
              updateBlockText(noteId, prevIdx, prevText + text);
              const prevEl = blockRefs.current[prevBlock.id];
              if (prevEl) prevEl.innerText = prevText + text;
              deleteBlock(noteId, blockIndex);
              focusBlockId.current = prevBlock.id;
              focusCursorPos.current = cursorPos;
            }
          }
        }
      }
    }

    // Arrow up — move to previous block (or title from first block)
    if (e.key === "ArrowUp") {
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (rect.top - elRect.top < 5) {
          e.preventDefault();
          if (blockIndex === 0) {
            titleRef.current?.focus();
          } else {
            let prevIdx = blockIndex - 1;
            while (prevIdx >= 0 && blocks[prevIdx].type === "spacer") prevIdx--;
            if (prevIdx >= 0) {
              const prevEl = blockRefs.current[blocks[prevIdx].id];
              if (prevEl) placeCaret(prevEl, (blocks[prevIdx].text || "").length);
            }
          }
        }
      }
    }

    // Arrow down — move to next block
    if (e.key === "ArrowDown") {
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (elRect.bottom - rect.bottom < 5) {
          let nextIdx = blockIndex + 1;
          while (nextIdx < blocks.length && blocks[nextIdx].type === "spacer") nextIdx++;
          if (nextIdx < blocks.length) {
            e.preventDefault();
            const nextEl = blockRefs.current[blocks[nextIdx].id];
            if (nextEl) placeCaret(nextEl, 0);
          }
        }
      }
    }
  };

  // --- Helper: find block from a DOM node ---
  const getBlockFromNode = (node) => {
    let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (el && el !== editorRef.current) {
      if (el.dataset && el.dataset.blockId) {
        const blockId = el.dataset.blockId;
        const blocks = noteDataRef.current[activeNote]?.content?.blocks;
        if (!blocks) return null;
        const blockIndex = blocks.findIndex(b => b.id === blockId);
        if (blockIndex === -1) return null;
        return { el: blockRefs.current[blockId], blockIndex, blockId };
      }
      el = el.parentElement;
    }
    return null;
  };

  // --- Helper: clean orphan DOM nodes from editor ---
  const cleanOrphanNodes = () => {
    const editor = editorRef.current;
    if (!editor) return;
    for (const child of Array.from(editor.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && child.dataset?.blockId) continue;
      editor.removeChild(child);
    }
  };

  // --- Helper: find nearest block to cursor position ---
  const findNearestBlock = (sel, blocks) => {
    if (!blocks || blocks.length === 0) return null;
    const range = sel.getRangeAt(0);
    const cursorRect = range.getBoundingClientRect();
    // If cursor rect has no position (collapsed at root), fall back to last block
    if (cursorRect.top === 0 && cursorRect.bottom === 0) {
      const lastIdx = blocks.length - 1;
      return { blockIndex: lastIdx, blockId: blocks[lastIdx].id };
    }
    let closestIdx = blocks.length - 1;
    let closestDist = Infinity;
    for (let i = 0; i < blocks.length; i++) {
      const el = blockRefs.current[blocks[i].id];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const blockCenter = (rect.top + rect.bottom) / 2;
      const dist = Math.abs(cursorRect.top - blockCenter);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }
    return { blockIndex: closestIdx, blockId: blocks[closestIdx].id };
  };

  // --- Helper: place cursor inside a block element ---
  // IMPORTANT: This must be a pure selection operation — no DOM mutations.
  // Mutating innerHTML during focus transitions destabilises browser selection state
  // and causes the "focused but no cursor" bug on first interaction.
  const placeCaret = (el, pos = 0) => {
    if (!el || !el.isConnected) {
      console.warn("[placeCaret] skipped — el is", el ? "disconnected" : "null");
      return false;
    }
    try {
      // Step 1: Focus the contentEditable ancestor (critical when coming from title or click-below)
      let ancestor = el.parentElement;
      while (ancestor && ancestor.contentEditable !== "true") ancestor = ancestor.parentElement;
      if (ancestor) ancestor.focus();
      // Step 2: Set the selection range — NO DOM mutation
      const range = document.createRange();
      const sel = window.getSelection();
      if (el.childNodes.length === 0) {
        // Truly empty element — must add a text node for caret anchoring
        el.appendChild(document.createTextNode(""));
        range.setStart(el.firstChild, 0);
      } else if (el.childNodes.length === 1 && el.firstChild.nodeName === "BR") {
        // Has <br> for height — use element-level position (before <br>), no DOM mutation
        range.setStart(el, 0);
      } else if (pos === 0) {
        range.setStart(el.firstChild, 0);
      } else {
        // Walk text nodes to find correct position
        let remaining = pos;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let textNode, placed = false;
        while (textNode = walker.nextNode()) {
          if (remaining <= textNode.length) {
            range.setStart(textNode, remaining);
            placed = true;
            break;
          }
          remaining -= textNode.length;
        }
        if (!placed) { range.selectNodeContents(el); range.collapse(false); sel.removeAllRanges(); sel.addRange(range); return true; }
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    } catch (_) {
      // Fallback: try to at least focus the element
      try {
        let ancestor = el.parentElement;
        while (ancestor && ancestor.contentEditable !== "true") ancestor = ancestor.parentElement;
        if (ancestor) ancestor.focus();
        const range = document.createRange();
        const sel = window.getSelection();
        range.setStart(el, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      } catch (__) {
        return false;
      }
    }
  };

  // --- Cross-block key handler ---
  const handleCrossBlockKeyDown = (e, startInfo, endInfo) => {
    const blocks = noteDataRef.current[activeNote].content.blocks;
    const range = window.getSelection().getRangeAt(0);
    const startEl = startInfo.el;
    const endEl = endInfo.el;

    // Get text before selection in first block
    const preRange = document.createRange();
    preRange.selectNodeContents(startEl);
    preRange.setEnd(range.startContainer, range.startOffset);
    const preDiv = document.createElement("div");
    preDiv.appendChild(preRange.cloneContents());
    const beforeText = preDiv.innerText;

    // Get text after selection in last block
    const postRange = document.createRange();
    postRange.selectNodeContents(endEl);
    postRange.setStart(range.endContainer, range.endOffset);
    const postDiv = document.createElement("div");
    postDiv.appendChild(postRange.cloneContents());
    const afterText = postDiv.innerText;

    const startIdx = startInfo.blockIndex;
    const endIdx = endInfo.blockIndex;
    const startBlockId = blocks[startIdx].id;

    // Backspace / Delete — collapse selection
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      commitNoteData(prev => {
        const next = { ...prev };
        const n = { ...next[activeNote] };
        const blks = [...n.content.blocks];
        blks[startIdx] = { ...blks[startIdx], text: beforeText + afterText };
        blks.splice(startIdx + 1, endIdx - startIdx);
        n.content = { ...n.content, blocks: blks };
        next[activeNote] = n;
        return next;
      });
      syncGeneration.current++;
      focusBlockId.current = startBlockId;
      focusCursorPos.current = beforeText.length;
      return;
    }

    // Enter — collapse then split
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const newBlockId = genBlockId();
      const startType = blocks[startIdx].type;
      const isList = startType === "bullet" || startType === "checkbox";
      commitNoteData(prev => {
        const next = { ...prev };
        const n = { ...next[activeNote] };
        const blks = [...n.content.blocks];
        blks[startIdx] = { ...blks[startIdx], text: beforeText };
        blks.splice(startIdx + 1, endIdx - startIdx);
        const newBlock = { id: newBlockId, type: isList ? startType : "p", text: afterText };
        if (startType === "checkbox") newBlock.checked = false;
        blks.splice(startIdx + 1, 0, newBlock);
        n.content = { ...n.content, blocks: blks };
        next[activeNote] = n;
        return next;
      });
      syncGeneration.current++;
      focusBlockId.current = newBlockId;
      focusCursorPos.current = 0;
      return;
    }

    // Printable character — collapse + insert
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      commitNoteData(prev => {
        const next = { ...prev };
        const n = { ...next[activeNote] };
        const blks = [...n.content.blocks];
        blks[startIdx] = { ...blks[startIdx], text: beforeText + e.key + afterText };
        blks.splice(startIdx + 1, endIdx - startIdx);
        n.content = { ...n.content, blocks: blks };
        next[activeNote] = n;
        return next;
      });
      syncGeneration.current++;
      focusBlockId.current = startBlockId;
      focusCursorPos.current = beforeText.length + e.key.length;
      return;
    }
  };

  // --- Editor wrapper event handlers ---
  const handleEditorKeyDown = (e) => {
    const sel = window.getSelection();
    if (!sel.rangeCount) {
      // Editor has focus but no selection — recover by placing cursor in first block
      console.warn("[handleEditorKeyDown] rangeCount === 0, rescuing cursor");
      const blocks = noteDataRef.current[activeNote]?.content?.blocks;
      if (blocks && blocks.length > 0) {
        const first = blocks.find(b => b.type !== "spacer");
        if (first) {
          const el = blockRefs.current[first.id];
          if (el && placeCaret(el, 0)) {
            // Cursor rescued — let the keystroke proceed naturally
            return;
          }
        }
      }
      return;
    }
    const range = sel.getRangeAt(0);

    // Check for cross-block selection
    if (!range.collapsed) {
      const startInfo = getBlockFromNode(range.startContainer);
      const endInfo = getBlockFromNode(range.endContainer);
      if (startInfo && endInfo && startInfo.blockIndex !== endInfo.blockIndex) {
        handleCrossBlockKeyDown(e, startInfo, endInfo);
        return;
      }
    }

    // Single-block — find which block and delegate
    const info = getBlockFromNode(sel.anchorNode);
    if (!info) {
      const blocks = noteDataRef.current[activeNote]?.content?.blocks;
      if (!blocks || blocks.length === 0) return;
      const target = findNearestBlock(sel, blocks);
      if (!target) return;

      // Enter: prevent default + create new block
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        insertBlockAfter(activeNote, target.blockIndex, "p", "");
        return;
      }

      // Backspace/Delete: prevent to avoid DOM corruption
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        return;
      }

      // Printable character: move cursor into nearest block, let browser type it there
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        const el = blockRefs.current[target.blockId];
        if (el) placeCaret(el, (blocks[target.blockIndex].text || "").length);
        // Don't preventDefault — let the character be typed into the block
        return;
      }

      return;
    }
    handleBlockKeyDown(activeNote, info.blockIndex, e);
  };

  const handleEditorInput = () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const info = getBlockFromNode(sel.anchorNode);
    if (!info) {
      cleanOrphanNodes();
      const blocks = noteDataRef.current[activeNote]?.content?.blocks;
      if (!blocks || blocks.length === 0) return;
      const lastBlock = blocks[blocks.length - 1];
      const el = blockRefs.current[lastBlock.id];
      if (el) placeCaret(el, (lastBlock.text || "").length);
      return;
    }
    handleBlockInput(activeNote, info.blockIndex);
  };

  const handleEditorMouseUp = () => {
    mouseIsDown.current = false;
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (sel.rangeCount && !sel.getRangeAt(0).collapsed) return; // Don't fix text selections
      if (sel.rangeCount) {
        const info = getBlockFromNode(sel.anchorNode);
        if (info) return; // Cursor is inside a block, nothing to fix
      }
      const blocks = noteDataRef.current[activeNote]?.content?.blocks;
      if (!blocks || blocks.length === 0) return;
      // Try to find nearest block to click position
      if (sel.rangeCount) {
        const target = findNearestBlock(sel, blocks);
        if (target) {
          console.warn("[handleEditorMouseUp] cursor outside block, snapping to nearest");
          const el = blockRefs.current[target.blockId];
          if (el) { placeCaret(el, (blocks[target.blockIndex].text || "").length); return; }
        }
      }
      // Fallback: rangeCount === 0 or no nearest block — place cursor in first block
      console.warn("[handleEditorMouseUp] no selection/block, rescuing to first block");
      const first = blocks.find(b => b.type !== "spacer");
      if (!first) return;
      const el = blockRefs.current[first.id];
      if (el) placeCaret(el, 0);
    });
  };

  const handleEditorMouseDown = () => {
    mouseIsDown.current = true;
  };

  const handleEditorFocus = () => {
    // Safety net: when editor receives focus via Tab or programmatic .focus()
    // but no cursor is in a valid block, place cursor in the first block.
    // Skip during mouse clicks — handleEditorMouseUp covers that case.
    if (mouseIsDown.current) return;
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (sel.rangeCount) {
        const info = getBlockFromNode(sel.anchorNode);
        if (info) return; // Cursor is already in a block
      }
      console.warn("[handleEditorFocus] no cursor in block, rescuing focus");
      const blocks = noteDataRef.current[activeNote]?.content?.blocks;
      if (!blocks || blocks.length === 0) return;
      const first = blocks.find(b => b.type !== "spacer");
      if (!first) return;
      const el = blockRefs.current[first.id];
      if (el) placeCaret(el, 0);
    });
  };

  const handleEditorPaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text/plain");
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    // Cross-block paste: collapse selection and insert text programmatically
    if (!range.collapsed) {
      const startInfo = getBlockFromNode(range.startContainer);
      const endInfo = getBlockFromNode(range.endContainer);
      if (startInfo && endInfo && startInfo.blockIndex !== endInfo.blockIndex) {
        const startEl = startInfo.el;
        const endEl = endInfo.el;
        const preRange = document.createRange();
        preRange.selectNodeContents(startEl);
        preRange.setEnd(range.startContainer, range.startOffset);
        const preDiv = document.createElement("div");
        preDiv.appendChild(preRange.cloneContents());
        const beforeText = preDiv.innerText;
        const postRange = document.createRange();
        postRange.selectNodeContents(endEl);
        postRange.setStart(range.endContainer, range.endOffset);
        const postDiv = document.createElement("div");
        postDiv.appendChild(postRange.cloneContents());
        const afterText = postDiv.innerText;
        const startIdx = startInfo.blockIndex;
        const endIdx = endInfo.blockIndex;
        const startBlockId = noteDataRef.current[activeNote].content.blocks[startIdx].id;
        commitNoteData(prev => {
          const next = { ...prev };
          const n = { ...next[activeNote] };
          const blks = [...n.content.blocks];
          blks[startIdx] = { ...blks[startIdx], text: beforeText + pastedText + afterText };
          blks.splice(startIdx + 1, endIdx - startIdx);
          n.content = { ...n.content, blocks: blks };
          next[activeNote] = n;
          return next;
        });
        syncGeneration.current++;
        focusBlockId.current = startBlockId;
        focusCursorPos.current = (beforeText + pastedText).length;
        return;
      }
    }

    // Single block or collapsed — use browser's insertText
    document.execCommand("insertText", false, pastedText);
  };

  // --- Search filtering ---
  const lc = (s) => s.toLowerCase();

  // Filter folder tree recursively — keep folder if its name matches or any descendant note matches
  const filterTree = (nodes) => {
    if (!search) return nodes;
    return nodes.map(folder => {
      const filteredChildren = filterTree(folder.children);
      const filteredNotes = folder.notes.filter(n => noteData[n] && lc(noteData[n].title).includes(lc(search)));
      const nameMatches = lc(folder.name).includes(lc(search));
      if (nameMatches || filteredChildren.length > 0 || filteredNotes.length > 0) {
        return { ...folder, children: filteredChildren, notes: nameMatches ? folder.notes : filteredNotes };
      }
      return null;
    }).filter(Boolean);
  };
  const filteredTree = filterTree(folderTree);

  const fNotes = search
    ? derivedRootNotes.filter((n) => noteData[n] && lc(noteData[n].title).includes(lc(search)))
    : derivedRootNotes;

  // --- UI helpers ---
  const hBg = (el, c) => { el.style.background = c; };

  const syncDotStyle = () => {
    const base = {
      width: 19, height: 19, borderRadius: "50%",
      background: accentColor, border: "none",
      cursor: "pointer", position: "relative", top: 1,
      transition: "transform 0.15s",
    };
    if (syncState === "syncing") return { ...base, animation: "syncGlow 2s ease-in-out infinite" };
    if (syncState === "error") return { ...base, boxShadow: `0 0 0 2.5px ${BG.dark}, 0 0 0 4.5px ${SEMANTIC.error}` };
    if (syncState === "offline") return { ...base, opacity: 0.4 };
    return base;
  };

  return (
    <div style={{
      width: "100%", height: "100vh", background: BG.darkest,
      display: "flex", flexDirection: "column",
      fontFamily: "'Geist', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: TEXT.primary, overflow: "hidden", fontSize: 13,
    }}>

      {/* === TOP ROW — 3 cells === */}
      <div style={{
        height: 44, background: chromeBg,
        boxShadow: (topBarEdge === "A" || topBarEdge === "B") ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
        borderBottom: (topBarEdge === "A" || topBarEdge === "C") ? `1px solid ${BG.divider}25` : "none",
        display: "flex", alignItems: "center",
        flexShrink: 0, zIndex: 2, position: "relative",
      }}>
        {/* Top-left — logo, undo, redo, sidebar toggle */}
        <div style={{
          width: sidebarWidth, flexShrink: 0, display: "flex", alignItems: "center",
          padding: "0 8px 0 14px", height: "100%", gap: 4,
          transition: "width 0.2s ease",
        }}>
          {/* N●tes */}
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0, marginRight: 4 }}>
            <img src="/assets/boojy-notes-text-N.png" alt="" style={{ height: 23.5 }} draggable="false" />
            <button
              onClick={() => { setSettingsOpen(true); setSettingsTab("profile"); }}
              style={syncDotStyle()}
              onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.1)"}
              onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
              title={`Settings \u00b7 Sync: ${syncState}`}
            >
              <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: accentColor }} />
            </button>
            <img src="/assets/boojy-notes.text-tes.png" alt="" style={{ height: 21 }} draggable="false" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }} />
          <button onClick={undo} title="Undo (Ctrl+Z)" style={{ background: "none", border: "none", cursor: canUndo ? "pointer" : "default", padding: "5px 4px", borderRadius: 4, display: "flex", alignItems: "center", color: TEXT.secondary, opacity: canUndo ? 1 : 0.3, transition: "background 0.15s, color 0.15s, opacity 0.15s" }}
                onMouseEnter={(e) => { if (canUndo) { hBg(e.currentTarget, BG.surface); e.currentTarget.style.color = TEXT.primary; } }}
                onMouseLeave={(e) => { hBg(e.currentTarget, "transparent"); e.currentTarget.style.color = TEXT.secondary; }}
          ><UndoIcon /></button>
          <button onClick={redo} title="Redo (Ctrl+Shift+Z)" style={{ background: "none", border: "none", cursor: canRedo ? "pointer" : "default", padding: "5px 4px", borderRadius: 4, display: "flex", alignItems: "center", color: TEXT.secondary, opacity: canRedo ? 1 : 0.3, transition: "background 0.15s, color 0.15s, opacity 0.15s" }}
                onMouseEnter={(e) => { if (canRedo) { hBg(e.currentTarget, BG.surface); e.currentTarget.style.color = TEXT.primary; } }}
                onMouseLeave={(e) => { hBg(e.currentTarget, "transparent"); e.currentTarget.style.color = TEXT.secondary; }}
          ><RedoIcon /></button>
          <button onClick={() => setCollapsed(!collapsed)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: 5, borderRadius: 5, display: "flex", alignItems: "center",
              color: TEXT.secondary, transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => { hBg(e.currentTarget, BG.surface); e.currentTarget.style.color = TEXT.primary; }}
            onMouseLeave={(e) => { hBg(e.currentTarget, "transparent"); e.currentTarget.style.color = TEXT.secondary; }}
            title={collapsed ? "Show sidebar" : "Hide sidebar"}
          >
            <SidebarToggleIcon />
          </button>
        </div>
        <div
          ref={(el) => { if (el) sidebarHandles.current[0] = el; }}
          onMouseDown={startDrag}
          style={{
            width: 4, cursor: "col-resize",
            background: chromeBg,
            borderRight: `1px solid ${BG.divider}`,
            flexShrink: 0, transition: "background 0.15s",
            alignSelf: "stretch",
          }}
          onMouseEnter={() => sidebarHandles.current.forEach(h => h && (h.style.background = ACCENT.primary))}
          onMouseLeave={() => { if (!isDragging.current) sidebarHandles.current.forEach(h => h && (h.style.background = chromeBg)); }}
        />

        {/* Top-middle — tabs */}
        <div ref={tabScrollRef} className="tab-scroll" style={{ display: "flex", alignItems: "stretch", flex: 1, overflow: "auto", height: "100%", background: tabFlip ? activeTabBg : "transparent" }}>
          {(() => { const tabW = Math.min(200, Math.max(100, tabAreaWidth / Math.max(1, tabs.length))); return tabs.flatMap((tId, i) => {
            const t = noteData[tId];
            if (!t) return [];
            const act = activeNote === tId;
            const els = [];
            els.push(<div key={`div-${tId}`} style={{ width: i === 0 ? 1 : 2, background: BG.divider, opacity: 0.6, alignSelf: "stretch", flexShrink: 0 }} />);
            const isNew = newTabId === tId;
            const isClosing = closingTabs.has(tId);
            els.push(
              <button key={tId} className={`tab-btn${act ? " tab-active" : ""}`} onClick={() => { if (!isClosing) setActiveNote(tId); }}
                style={{
                  background: tabFlip ? (act ? chromeBg : activeTabBg) : (act ? activeTabBg : "transparent"),
                  border: "none",
                  cursor: "pointer", padding: "0 8px 0 10px",
                  width: tabW, minWidth: tabW, flexShrink: 0,
                  display: "flex", alignItems: "center",
                  color: act ? TEXT.primary : TEXT.secondary,
                  fontSize: 13.5, fontFamily: "inherit",
                  fontWeight: act ? 600 : 400,
                  whiteSpace: "nowrap", transition: "background 0.15s, color 0.15s",
                  height: "100%", overflow: "hidden",
                  animation: isNew ? "tabSlideIn 0.2s ease forwards" : isClosing ? "tabSlideOut 0.18s ease forwards" : "none",
                }}
                onMouseEnter={(e) => { if (!act) { hBg(e.currentTarget, BG.elevated); e.currentTarget.style.color = TEXT.primary; } }}
                onMouseLeave={(e) => { if (!act) { hBg(e.currentTarget, "transparent"); e.currentTarget.style.color = act ? TEXT.primary : TEXT.secondary; } }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "left", display: "flex", alignItems: "center" }}>{t.title}</span>
                <span className="tab-close" onClick={(e) => closeTab(e, tId)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    height: 16, borderRadius: 4, flexShrink: 0,
                    color: TEXT.secondary,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = BG.surface; e.currentTarget.style.color = TEXT.primary; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = TEXT.secondary; }}
                ><CloseIcon /></span>
              </button>
            );
            if (i === tabs.length - 1) {
              els.push(<div key="div-end" style={{ width: 2, background: BG.divider, opacity: 0.6, alignSelf: "stretch", flexShrink: 0 }} />);
            }
            return els;
          }); })()}
        </div>

        {/* Top-right drag handle — always visible so divider doesn't jump */}
        <div
          ref={(el) => { if (el) rightPanelHandles.current[0] = el; }}
          onMouseDown={startRightDrag}
          style={{
            width: 4, cursor: "col-resize",
            background: chromeBg,
            borderLeft: `1px solid ${BG.divider}`,
            flexShrink: 0, transition: "background 0.15s",
            alignSelf: "stretch",
            marginRight: -1, position: "relative", zIndex: 1,
          }}
          onMouseEnter={() => rightPanelHandles.current.forEach(h => h && (h.style.background = ACCENT.primary))}
          onMouseLeave={() => { if (!isDragging.current) rightPanelHandles.current.forEach(h => h && (h.style.background = chromeBg)); }}
        />

        {/* Top-right — panel toggle, word count, help */}
        <div style={{
          width: rightPanelWidth,
          flexShrink: 0, display: "flex", alignItems: "center",
          justifyContent: "flex-start", gap: 4, padding: "0 10px 0 10px",
          height: "100%",
        }}>
          <button onClick={() => setRightPanel(!rightPanel)} title="Toggle right panel (\u2318\\)" style={{
            background: "none", border: "none", cursor: "pointer",
            padding: 5, borderRadius: 5, display: "flex", alignItems: "center",
            color: TEXT.secondary, transition: "background 0.15s, color 0.15s", flexShrink: 0,
          }}
            onMouseEnter={(e) => { hBg(e.currentTarget, BG.surface); e.currentTarget.style.color = TEXT.primary; }}
            onMouseLeave={(e) => { hBg(e.currentTarget, "transparent"); e.currentTarget.style.color = TEXT.secondary; }}
          ><svg width="16.5" height="16.5" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M10 2.5V13.5" stroke="currentColor" strokeWidth="1.3"/>
          </svg></button>
          {note && (
            <span style={{ fontSize: 12, color: TEXT.secondary, flexShrink: 0, padding: "0 4px", whiteSpace: "nowrap" }}>
              {wordCount} words
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={() => {}} title="Keyboard shortcuts (?)" style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "4px 5px", borderRadius: 5, display: "flex", alignItems: "center",
            color: TEXT.secondary, fontSize: 13, fontWeight: 600, fontFamily: "inherit",
            transition: "background 0.15s, color 0.15s",
          }}
            onMouseEnter={(e) => { hBg(e.currentTarget, BG.surface); e.currentTarget.style.color = TEXT.primary; }}
            onMouseLeave={(e) => { hBg(e.currentTarget, "transparent"); e.currentTarget.style.color = TEXT.secondary; }}
          ><svg width="17.6" height="17.6" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6.5"/>
            <path d="M6 6.2a2.1 2.1 0 0 1 2-1.4c1.1 0 2 .8 2 1.8 0 1-.7 1.4-1.4 1.7-.3.1-.6.4-.6.7"/>
            <circle cx="8" cy="11.5" r="0.01" fill="currentColor" strokeWidth="2"/>
          </svg></button>
        </div>
      </div>

      {/* === MAIN AREA === */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* --- SIDEBAR --- */}
          <div style={{
            width: collapsed ? 0 : sidebarWidth,
            minWidth: collapsed ? 0 : sidebarWidth,
            background: chromeBg,
            display: "flex", flexShrink: 0, overflow: "hidden",
            position: "relative",
            transition: "width 0.2s ease, min-width 0.2s ease",
          }}>
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
            {/* Search */}
            <div style={{ padding: "8px 10px" }}>
              <div
                onClick={() => { if (!searchFocused && !search) { setSearchFocused(true); setTimeout(() => searchInputRef.current?.focus(), 0); } }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "#18191E", borderRadius: 14, height: 28,
                  width: (searchFocused || search) ? sidebarWidth - 20 : 95,
                  padding: "0 10px",
                  border: `1px solid ${searchFocused ? `${accentColor}60` : BG.divider}`,
                  transition: "width 0.2s ease, border-color 0.2s ease",
                  cursor: (searchFocused || search) ? "text" : "pointer",
                  overflow: "hidden",
                }}>
                <SearchIcon />
                {(searchFocused || search) ? (
                  <input ref={searchInputRef} type="text" autoFocus
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    style={{
                      background: "none", border: "none", outline: "none",
                      color: TEXT.primary, fontSize: 13, width: "100%", fontFamily: "inherit",
                    }}
                  />
                ) : (
                  <span style={{ color: TEXT.muted, fontSize: 13, fontWeight: 500, userSelect: "none" }}>Search</span>
                )}
              </div>
            </div>

            {/* File tree — recursive Finder-style */}
            <div style={{
              flex: 1, overflow: "auto", padding: "2px 0",
            }}>
              {(() => {
                // Render a note row at given depth
                const renderNote = (nId, depth) => {
                  const n = noteData[nId]; if (!n) return null;
                  const act = activeNote === nId;
                  return (
                    <button key={nId} onClick={() => openNote(nId)} className="sidebar-note"
                      onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, type: "note", id: nId }); }}
                      style={{
                        width: selectionStyle === "B" ? "calc(100% - 8px)" : "calc(100% + 2px)",
                        marginTop: 0, marginBottom: 0,
                        marginLeft: selectionStyle === "B" ? 5 : -1,
                        marginRight: selectionStyle === "B" ? 3 : 0,
                        border: "none", outline: "none", appearance: "none", WebkitAppearance: "none",
                        cursor: "pointer",
                        background: act ? `${accentColor}${selectionStyle === "B" ? "30" : "15"}` : "transparent",
                        borderRadius: selectionStyle === "B" ? 6 : 0,
                        ...(selectionStyle === "A" ? { borderLeft: act ? `3px solid ${accentColor}` : "3px solid transparent" } : {}),
                        padding: selectionStyle === "B" ? `4px 10px 4px ${7 + depth * 20 + 19}px` : `4px 10px 4px ${7 + depth * 20 + 19}px`,
                        display: "flex", alignItems: "center", gap: 5,
                        color: act ? TEXT.primary : TEXT.secondary,
                        fontSize: 14, fontFamily: "inherit",
                        fontWeight: act ? 600 : 400,
                        transition: "background 0.12s", textAlign: "left",
                        boxShadow: selectionStyle === "A" && act ? `inset 4px 0 12px -4px ${ACCENT.primary}30` : "none",
                      }}
                      onMouseEnter={(e) => { if (!act) hBg(e.currentTarget, BG.elevated); }}
                      onMouseLeave={(e) => { if (!act) hBg(e.currentTarget, "transparent"); }}
                    >
                      <FileIcon active={act} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{n.title}</span>
                      <span className="delete-btn" onClick={(e) => { e.stopPropagation(); deleteNote(nId); }}
                        style={{ display: "flex", alignItems: "center", padding: "0 2px", marginLeft: "auto" }}
                      ><CloseIcon /></span>
                    </button>
                  );
                };

                // Render a folder and its children recursively
                const renderFolder = (folder, depth) => {
                  const folderPath = folder._path || folder.name;
                  const isOpen = expanded[folderPath];
                  const hasChildren = folder.children.length > 0 || folder.notes.length > 0;
                  return (
                    <div key={folderPath}>
                      <button onClick={() => toggle(folderPath)}
                        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, type: "folder", id: folderPath }); }}
                        style={{
                          width: "100%", background: "none", border: "none",
                          cursor: "pointer", padding: `4px 10px 4px ${10 + depth * 20}px`,
                          display: "flex", alignItems: "center", gap: 5,
                          color: TEXT.secondary, fontSize: 14, fontWeight: 400, fontFamily: "inherit",
                          transition: "background 0.12s, color 0.12s", textAlign: "left",
                        }}
                        onMouseEnter={(e) => { hBg(e.currentTarget, BG.elevated); e.currentTarget.style.color = TEXT.primary; }}
                        onMouseLeave={(e) => { hBg(e.currentTarget, "transparent"); e.currentTarget.style.color = TEXT.secondary; }}
                      >
                        {hasChildren ? (isOpen ? <ChevronDown /> : <ChevronRight />) : <span style={{ width: 14, flexShrink: 0 }} />}
                        <FolderIcon open={isOpen} color={accentColor} />
                        {renamingFolder === folderPath ? (
                          <input
                            autoFocus
                            defaultValue={folder.name}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={(e) => { renameFolder(folderPath, e.target.value.trim()); setRenamingFolder(null); }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { renameFolder(folderPath, e.target.value.trim()); setRenamingFolder(null); }
                              if (e.key === "Escape") setRenamingFolder(null);
                            }}
                            style={{
                              background: BG.darkest, border: `1px solid ${accentColor}`, borderRadius: 4,
                              color: TEXT.primary, fontSize: 12.5, fontFamily: "inherit", fontWeight: 500,
                              padding: "1px 4px", outline: "none", width: "100%",
                            }}
                          />
                        ) : (
                          <span style={{ fontWeight: 500 }}>{folder.name}</span>
                        )}
                      </button>
                      {isOpen && (
                        <div style={{ position: "relative" }}>
                          <div style={{
                            position: "absolute", left: 10 + depth * 20 + 7,
                            top: 0, bottom: 0, width: 1,
                            background: "rgba(58, 61, 74, 0.4)",
                          }} />
                          {folder.children.map(child => renderFolder(child, depth + 1))}
                          {folder.notes.map(nId => renderNote(nId, depth + 1))}
                        </div>
                      )}
                    </div>
                  );
                };

                return (
                  <>
                    <div style={{ height: 5 }} />
                    {filteredTree.map(f => renderFolder(f, 0))}
                    {!search && (
                      <button onClick={createFolder} style={{
                        width: "100%", border: "none", cursor: "pointer",
                        background: "transparent",
                        padding: `4px 10px 4px 10px`,
                        display: "flex", alignItems: "center", gap: 5,
                        color: TEXT.secondary, fontSize: 14, fontFamily: "inherit", fontWeight: 500,
                        opacity: 0.55,
                        transition: "background 0.12s, color 0.12s, opacity 0.12s", textAlign: "left",
                      }}
                        onMouseEnter={(e) => { hBg(e.currentTarget, BG.elevated); e.currentTarget.style.color = TEXT.primary; e.currentTarget.style.opacity = "1"; }}
                        onMouseLeave={(e) => { hBg(e.currentTarget, "transparent"); e.currentTarget.style.color = TEXT.secondary; e.currentTarget.style.opacity = "0.55"; }}
                      >
                        <span style={{ width: 14, flexShrink: 0 }} />
                        <span style={{ width: 17, flexShrink: 0, textAlign: "center" }}>+</span>
                        <span>New Folder</span>
                      </button>
                    )}
                    {(filteredTree.length > 0 || fNotes.length > 0) && <div style={{ height: 16 }} />}
                    {fNotes.map(nId => renderNote(nId, 0))}
                    {!search && (
                      <button onClick={() => createNote(null)} style={{
                        width: "100%", border: "none", cursor: "pointer",
                        background: "transparent",
                        borderLeft: "3px solid transparent",
                        padding: `4px 10px 4px ${7 + 19}px`,
                        display: "flex", alignItems: "center", gap: 5,
                        color: TEXT.secondary, fontSize: 14, fontFamily: "inherit", fontWeight: 500,
                        opacity: 0.55,
                        transition: "background 0.12s, color 0.12s, opacity 0.12s", textAlign: "left",
                      }}
                        onMouseEnter={(e) => { hBg(e.currentTarget, BG.elevated); e.currentTarget.style.color = TEXT.primary; e.currentTarget.style.opacity = "1"; }}
                        onMouseLeave={(e) => { hBg(e.currentTarget, "transparent"); e.currentTarget.style.color = TEXT.secondary; e.currentTarget.style.opacity = "0.55"; }}
                      >
                        <span style={{ width: 17, flexShrink: 0, textAlign: "center" }}>+</span>
                        <span>New Note</span>
                      </button>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Trash — pinned at bottom */}
            <button
              onClick={() => {}}
              style={{
                width: "100%", border: "none", cursor: "pointer",
                background: "transparent",
                borderLeft: "3px solid transparent",
                padding: "4px 10px 4px 26px",
                marginBottom: 10,
                display: "flex", alignItems: "center", gap: 5,
                color: TEXT.secondary, fontSize: 14, fontFamily: "inherit", fontWeight: 500,
                transition: "background 0.12s",
                flexShrink: 0, textAlign: "left",
              }}
              onMouseEnter={(e) => hBg(e.currentTarget, BG.elevated)}
              onMouseLeave={(e) => hBg(e.currentTarget, "transparent")}
            >
              <TrashIcon />
              <span>Trash</span>
            </button>
          </div>

          </div>

          {/* Drag handle */}
          <div
            ref={(el) => { if (el) sidebarHandles.current[1] = el; }}
            onMouseDown={startDrag}
            style={{
              width: 4, cursor: "col-resize",
              background: chromeBg,
              borderRight: `1px solid ${BG.divider}`,
              flexShrink: 0, transition: "background 0.15s",
            }}
            onMouseEnter={() => sidebarHandles.current.forEach(h => h && (h.style.background = ACCENT.primary))}
            onMouseLeave={() => { if (!isDragging.current) sidebarHandles.current.forEach(h => h && (h.style.background = chromeBg)); }}
          />

        {/* --- EDITOR --- */}
        <div className="editor-scroll" style={{ flex: 1, display: "flex", flexDirection: "column", overflowX: "hidden", overflowY: "auto", background: editorBg, position: "relative" }}>
          <StarField mode={note ? "editor" : "empty"} seed={activeNote || "__empty__"} />
          {note ? (
            <div key={activeNote} style={{
              padding: "28px 56px 80px 56px",
              maxWidth: 720, marginLeft: 40, marginRight: "auto", width: "100%",
              opacity: editorFadeIn ? 1 : 0,
              transform: editorFadeIn ? "translateY(0)" : "translateY(4px)",
              transition: "opacity 0.2s ease, transform 0.2s ease",
              position: "relative", zIndex: 1,
            }}>
              {/* Breadcrumb (only if inside a folder) */}
              {note.path && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                  marginBottom: 16, fontSize: 12,
                }}>
                  {note.path.map((seg, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      {i > 0 && <BreadcrumbChevron />}
                      <span style={{
                        color: i < note.path.length - 1 ? TEXT.secondary : TEXT.muted,
                        cursor: i < note.path.length - 1 ? "pointer" : "default",
                        transition: "color 0.15s",
                      }}
                        onMouseEnter={(e) => { if (i < note.path.length - 1) e.target.style.color = ACCENT.primary; }}
                        onMouseLeave={(e) => { if (i < note.path.length - 1) e.target.style.color = TEXT.secondary; }}
                      >{seg}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Title */}
              <h1
                ref={titleRef}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => {
                  const newTitle = e.currentTarget.innerText;
                  commitTextChange(prev => {
                    const next = { ...prev };
                    const n = { ...next[activeNote] };
                    n.title = newTitle;
                    n.content = { ...n.content, title: newTitle };
                    next[activeNote] = n;
                    return next;
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const blocks = noteDataRef.current[activeNote].content.blocks;
                    const first = blocks.find(b => b.type !== "spacer");
                    if (first) {
                      const firstId = first.id;
                      const el = blockRefs.current[firstId];
                      if (el) {
                        // Synchronous attempt — DOM prep happens before focus in placeCaret
                        placeCaret(el, 0);
                        // Verify after browser settles — retry if cursor didn't land in a block
                        requestAnimationFrame(() => {
                          const sel = window.getSelection();
                          if (sel.rangeCount && getBlockFromNode(sel.anchorNode)) return;
                          const freshEl = blockRefs.current[firstId];
                          if (freshEl) placeCaret(freshEl, 0);
                        });
                      } else {
                        // Block ref not registered yet — fall back to render-triggered focus
                        focusBlockId.current = firstId;
                        focusCursorPos.current = 0;
                        forceRender(c => c + 1);
                      }
                    }
                  }
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
                }}
                style={{
                  fontSize: 28, fontWeight: 700, color: TEXT.primary,
                  margin: "0 0 16px", lineHeight: 1.3, letterSpacing: "-0.4px",
                  outline: "none",
                }}
              />

              {/* Title separator — gradient line */}
              <div style={{
                height: 1,
                marginBottom: 20,
                background: `linear-gradient(90deg, ${accentColor}33, ${accentColor}0D, transparent)`,
              }} />

              {/* Blocks — single contentEditable wrapper for cross-block selection */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onKeyDown={handleEditorKeyDown}
                onInput={handleEditorInput}
                onPaste={handleEditorPaste}
                onMouseDown={handleEditorMouseDown}
                onMouseUp={handleEditorMouseUp}
                onFocus={handleEditorFocus}
                style={{ outline: "none" }}
              >
                {note.content.blocks.map((block, i) => (
                  <EditableBlock
                    key={block.id + "-" + block.type}
                    block={block}
                    blockIndex={i}
                    noteId={activeNote}
                    onCheckToggle={flipCheck}
                    registerRef={registerBlockRef}
                    syncGen={syncGeneration.current}
                    accentColor={accentColor}
                  />
                ))}
              </div>

              {/* Click to create new block */}
              <div
                style={{ minHeight: 200, cursor: "text" }}
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent browser from stealing focus from the editor
                  const blocks = noteData[activeNote].content.blocks;
                  if (blocks.length > 0) {
                    // If last block is empty, just focus it instead of creating another
                    const lastBlock = blocks[blocks.length - 1];
                    const lastEl = blockRefs.current[lastBlock.id];
                    if (lastEl && (lastEl.innerText || "").trim() === "") {
                      placeCaret(lastEl, 0);
                      // Verify after browser settles
                      const lastId = lastBlock.id;
                      requestAnimationFrame(() => {
                        const sel = window.getSelection();
                        if (sel.rangeCount && getBlockFromNode(sel.anchorNode)) return;
                        const freshEl = blockRefs.current[lastId];
                        if (freshEl) placeCaret(freshEl, 0);
                      });
                      return;
                    }
                  }
                  insertBlockAfter(activeNote, blocks.length - 1, "p", "");
                }}
              />
            </div>
          ) : (
            /* --- EMPTY STATE --- */
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              position: "relative", overflow: "hidden", zIndex: 1,
            }}>

              <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
                {/* Faded N●tes logo */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, marginBottom: 20, opacity: 0.12 }}>
                  <img src="/assets/boojy-notes-text-N.png" alt="" style={{ height: 55, filter: "invert(1)" }} draggable="false" />
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: accentColor, position: "relative", top: 2, flexShrink: 0 }} />
                  <img src="/assets/boojy-notes.text-tes.png" alt="" style={{ height: 48, filter: "invert(1)" }} draggable="false" />
                </div>

                <p style={{ color: TEXT.muted, fontSize: 14, marginBottom: 28, opacity: 0.7 }}>Start writing...</p>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: 0.4 }}>
                  {[
                    { key: "\u2318N", label: "New note" },
                    { key: "\u2318P", label: "Search notes" },
                    { key: "/", label: "Commands" },
                  ].map((s) => (
                    <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
                      <span style={{
                        fontSize: 11, color: TEXT.secondary,
                        background: BG.elevated, padding: "2px 7px",
                        borderRadius: 4, border: `1px solid ${BG.divider}`,
                        fontFamily: "'SF Mono', 'Fira Code', monospace",
                        minWidth: 28, textAlign: "center",
                      }}>{s.key}</span>
                      <span style={{ fontSize: 12, color: TEXT.muted, width: 90, textAlign: "left" }}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right panel drag handle — outside container so it aligns with top bar handle */}
          <div
            ref={(el) => { if (el) rightPanelHandles.current[1] = el; }}
            onMouseDown={startRightDrag}
            style={{
              width: 4, cursor: "col-resize",
              background: chromeBg,
              borderLeft: `1px solid ${BG.divider}`,
              flexShrink: 0, transition: "background 0.15s",
              marginRight: -1, position: "relative", zIndex: 1,
            }}
            onMouseEnter={() => rightPanelHandles.current.forEach(h => h && (h.style.background = ACCENT.primary))}
            onMouseLeave={() => { if (!isDragging.current) rightPanelHandles.current.forEach(h => h && (h.style.background = chromeBg)); }}
          />

        {/* --- RIGHT PANEL (Terminal) --- */}
        <div style={{
          width: rightPanel ? rightPanelWidth : 0,
          minWidth: rightPanel ? rightPanelWidth : 0,
          background: chromeBg,
          display: "flex", flexDirection: "column",
          overflow: "hidden", flexShrink: 0,
          position: "relative",
          transition: isDragging.current ? "none" : "width 0.2s ease, min-width 0.2s ease",
        }}>
          <div style={{
            padding: "10px 16px", borderBottom: `1px solid ${BG.divider}`,
            fontSize: 12, color: TEXT.muted, fontWeight: 500, letterSpacing: "0.3px",
          }}>Terminal</div>
          <div style={{
            flex: 1, padding: 16,
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            fontSize: 12, color: TEXT.muted, lineHeight: 1.6,
          }}>
            <span style={{ color: ACCENT.primary }}>~</span> <span style={{ opacity: 0.5 }}>$</span> <span style={{ animation: "blink 1s step-end infinite", color: TEXT.primary }}>{"\u258E"}</span>
          </div>
        </div>
      </div>


      {/* === CONTEXT MENU OVERLAY === */}
      {ctxMenu && (
        <>
          <div onClick={() => setCtxMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 250 }} />
          <div style={{
            position: "fixed", top: ctxMenu.y, left: ctxMenu.x, zIndex: 300,
            background: BG.elevated, border: `1px solid ${BG.divider}`,
            borderRadius: 8, padding: "4px 0", minWidth: 160,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            animation: "fadeIn 0.1s ease",
          }}>
            {(ctxMenu.type === "note" ? [
              { label: "Rename", action: () => { openNote(ctxMenu.id); setCtxMenu(null); setTimeout(() => { if (titleRef.current) { titleRef.current.focus(); const sel = window.getSelection(); sel.selectAllChildren(titleRef.current); } }, 60); } },
              { label: "Duplicate", action: () => { duplicateNote(ctxMenu.id); setCtxMenu(null); } },
              { label: "Delete", action: () => { deleteNote(ctxMenu.id); setCtxMenu(null); }, danger: true },
            ] : [
              { label: "New note here", action: () => { createNote(ctxMenu.id); setCtxMenu(null); } },
              { label: "Rename", action: () => { setRenamingFolder(ctxMenu.id); setCtxMenu(null); } },
              { label: "Delete folder", action: () => { deleteFolder(ctxMenu.id); setCtxMenu(null); }, danger: true },
            ]).map((item) => (
              <button key={item.label}
                onClick={item.action}
                style={{
                  width: "100%", background: "none", border: "none",
                  padding: "7px 14px", cursor: "pointer",
                  color: item.danger ? SEMANTIC.error : TEXT.primary,
                  fontSize: 12.5, fontFamily: "inherit", textAlign: "left",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => hBg(e.currentTarget, BG.surface)}
                onMouseLeave={(e) => hBg(e.currentTarget, "transparent")}
              >{item.label}</button>
            ))}
          </div>
        </>
      )}

      {/* === SLASH MENU OVERLAY === */}
      {slashMenu && (() => {
        const filtered = SLASH_COMMANDS.filter(c =>
          c.label.toLowerCase().includes(slashMenu.filter.toLowerCase())
        );
        return (
          <div style={{
            position: "fixed",
            top: slashMenu.rect.top,
            left: slashMenu.rect.left,
            zIndex: 200,
            background: BG.elevated,
            border: `1px solid ${BG.divider}`,
            borderRadius: 10,
            padding: "6px 0",
            minWidth: 220,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            animation: "slideUp 0.12s ease",
          }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "10px 16px", color: TEXT.muted, fontSize: 12 }}>
                No matching commands
              </div>
            ) : (
              filtered.map((cmd, i) => (
                <div
                  key={cmd.id}
                  onClick={() => {
                    executeSlashCommand(slashMenu.noteId, slashMenu.blockIndex, cmd);
                    setSlashMenu(null);
                  }}
                  onMouseEnter={() => setSlashMenu(prev => prev ? { ...prev, selectedIndex: i } : null)}
                  style={{
                    padding: "8px 14px",
                    display: "flex", alignItems: "center", gap: 10,
                    cursor: "pointer",
                    background: i === slashMenu.selectedIndex ? BG.surface : "transparent",
                    transition: "background 0.12s",
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: BG.dark, border: `1px solid ${BG.divider}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, color: TEXT.secondary,
                  }}>
                    {cmd.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: TEXT.primary }}>{cmd.label}</div>
                    <div style={{ fontSize: 11, color: TEXT.muted }}>{cmd.desc}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        );
      })()}

      {/* === SETTINGS MODAL OVERLAY === */}
      <SettingsModal
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        accentColor={accentColor}
        fontSize={settingsFontSize}
        setFontSize={setSettingsFontSize}
        user={user}
        profile={profile}
        authActions={{ signInWithEmail, signUpWithEmail, signInWithOAuth, signOut, resendVerification }}
        syncState={syncState}
        lastSynced={lastSynced}
        storageUsed={storageUsed}
        storageLimitMB={storageLimitMB}
        onSync={syncAll}
        isDesktop={isDesktop}
        notesDir={notesDir}
        changeNotesDir={changeNotesDir}
      />

      {/* Dev toast */}
      {devToast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: BG.elevated, border: `1px solid ${BG.divider}`,
          borderRadius: 8, padding: "6px 16px", fontSize: 12, color: TEXT.primary,
          fontWeight: 500, zIndex: 200, animation: "fadeIn 0.15s ease",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}>{devToast}</div>
      )}

      {/* Floating dev gear button */}
      <button onClick={() => setDevOverlay(v => !v)} style={{
        position: "fixed", bottom: 16, right: 16, width: 28, height: 28,
        borderRadius: "50%", border: `1px solid ${BG.divider}`,
        background: devOverlay ? BG.surface : `${BG.elevated}aa`,
        color: devOverlay ? ACCENT.primary : TEXT.muted,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", zIndex: 201, fontSize: 14,
        transition: "background 0.15s, color 0.15s, transform 0.15s",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      }}
        onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.color = ACCENT.primary; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.color = devOverlay ? ACCENT.primary : TEXT.muted; }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="2.5"/>
          <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M3.4 12.6l.85-.85M11.75 4.25l.85-.85"/>
        </svg>
      </button>

      {/* Dev tools overlay — anchored bottom-right above gear */}
      {devOverlay && (() => {
        const aRgb = hexToRgb(accentColor);
        const cRgb = hexToRgb(chromeBg);
        const eRgb = hexToRgb(editorBg);
        const tRgb = hexToRgb(activeTabBg);
        const sliderTrack = { width: "100%", height: 4, appearance: "none", WebkitAppearance: "none", background: BG.divider, borderRadius: 2, outline: "none", cursor: "pointer" };
        const sliderCss = `
          .dev-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: ${TEXT.primary}; cursor: pointer; border: 2px solid ${BG.elevated}; }
          .dev-slider::-webkit-slider-runnable-track { height: 4px; background: ${BG.divider}; border-radius: 2px; }
        `;
        const channels = ["R", "G", "B"];
        const rgbSliders = (rgb, setter) => channels.map((ch, i) => (
          <div key={ch} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: i < 2 ? 4 : 0 }}>
            <span style={{ width: 10, fontSize: 10, color: ch === "R" ? "#E57373" : ch === "G" ? "#81C784" : "#64B5F6", fontWeight: 600 }}>{ch}</span>
            <input className="dev-slider" type="range" min="0" max="255" value={rgb[i]}
              style={sliderTrack}
              onChange={e => { const next = [...rgb]; next[i] = +e.target.value; setter(rgbToHex(...next)); }} />
            <span style={{ width: 24, textAlign: "right", fontSize: 10, color: TEXT.muted }}>{rgb[i]}</span>
          </div>
        ));
        return (
        <div style={{
          position: "fixed", bottom: 52, right: 16, width: 280,
          background: BG.elevated, border: `1px solid ${BG.divider}`,
          borderRadius: 10, padding: 16, zIndex: 200,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", gap: 14,
          fontSize: 12, color: TEXT.secondary, fontFamily: "inherit",
          animation: "slideUp 0.15s ease",
        }}>
          <style>{sliderCss}</style>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, color: TEXT.primary, fontSize: 13 }}>Dev Tools</span>
            <button onClick={() => setDevOverlay(false)} style={{
              background: "none", border: "none", color: TEXT.muted, cursor: "pointer", fontSize: 14,
            }}>{"\u2715"}</button>
          </div>

          {/* Top bar edge toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Top Bar Edge</span>
            <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: `1px solid ${BG.divider}`, marginLeft: "auto" }}>
              {["A", "B", "C", "D"].map(s => (
                <button key={s} onClick={() => {
                  setTopBarEdge(s);
                  setDevToast(`Top bar: ${s === "A" ? "Shadow+line" : s === "B" ? "Shadow" : s === "C" ? "Line" : "None"}`);
                  setTimeout(() => setDevToast(null), 1500);
                }} style={{
                  background: topBarEdge === s ? TEXT.primary : "transparent",
                  color: topBarEdge === s ? BG.darkest : TEXT.muted,
                  border: "none", padding: "3px 10px", fontSize: 11, fontWeight: 600,
                  cursor: "pointer", transition: "background 0.12s, color 0.12s",
                }}>{s}</button>
              ))}
            </div>
          </div>

          {/* Create button style toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Create Buttons</span>
            <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: `1px solid ${BG.divider}`, marginLeft: "auto" }}>
              {["A", "B", "C"].map(s => (
                <button key={s} onClick={() => {
                  setCreateBtnStyle(s);
                  setDevToast(`Create btns: ${s === "A" ? "Default" : s === "B" ? "Ghost" : "Accent"}`);
                  setTimeout(() => setDevToast(null), 1500);
                }} style={{
                  background: createBtnStyle === s ? TEXT.primary : "transparent",
                  color: createBtnStyle === s ? BG.darkest : TEXT.muted,
                  border: "none", padding: "3px 10px", fontSize: 11, fontWeight: 600,
                  cursor: "pointer", transition: "background 0.12s, color 0.12s",
                }}>{s}</button>
              ))}
            </div>
          </div>

          {/* Selection Style toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Selection</span>
            <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: `1px solid ${BG.divider}`, marginLeft: "auto" }}>
              {["A", "B"].map(s => (
                <button key={s} onClick={() => {
                  setSelectionStyle(s);
                  setDevToast(`Selection: ${s === "A" ? "Glow bar" : "Pill"}`);
                  setTimeout(() => setDevToast(null), 1500);
                }} style={{
                  background: selectionStyle === s ? TEXT.primary : "transparent",
                  color: selectionStyle === s ? BG.darkest : TEXT.muted,
                  border: "none", padding: "3px 10px", fontSize: 11, fontWeight: 600,
                  cursor: "pointer", transition: "background 0.12s, color 0.12s",
                }}>{s}</button>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: BG.divider }} />

          {/* Accent Color */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span>Accent Color</span>
              <code style={{ color: accentColor }}>{accentColor}</code>
            </div>
            {rgbSliders(aRgb, setAccentColor)}
            <div style={{ height: 8, marginTop: 6, borderRadius: 3, background: accentColor, border: `1px solid ${BG.divider}` }} />
          </div>

          <div style={{ height: 1, background: BG.divider }} />

          {/* Active Tab BG + flip toggle */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span>Active Tab BG</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{ color: TEXT.primary }}>{activeTabBg}</code>
                <button onClick={() => {
                  setTabFlip(!tabFlip);
                  setDevToast(`Tab flip: ${!tabFlip ? "ON" : "OFF"}`);
                  setTimeout(() => setDevToast(null), 1500);
                }} style={{
                  background: tabFlip ? TEXT.primary : "transparent",
                  color: tabFlip ? BG.darkest : TEXT.muted,
                  border: `1px solid ${BG.divider}`, borderRadius: 4,
                  padding: "2px 8px", fontSize: 10, fontWeight: 600,
                  cursor: "pointer", transition: "background 0.12s, color 0.12s",
                }}>FLIP</button>
              </div>
            </div>
            {rgbSliders(tRgb, setActiveTabBg)}
            <div style={{ height: 8, marginTop: 6, borderRadius: 3, background: activeTabBg, border: `1px solid ${BG.divider}` }} />
          </div>

          <div style={{ height: 1, background: BG.divider }} />

          {/* Chrome BG */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span>Chrome BG</span>
              <code style={{ color: TEXT.primary }}>{chromeBg}</code>
            </div>
            {rgbSliders(cRgb, setChromeBg)}
            <div style={{ height: 8, marginTop: 6, borderRadius: 3, background: chromeBg, border: `1px solid ${BG.divider}` }} />
          </div>

          <div style={{ height: 1, background: BG.divider }} />

          {/* Editor BG */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span>Editor BG</span>
              <code style={{ color: TEXT.primary }}>{editorBg}</code>
            </div>
            {rgbSliders(eRgb, setEditorBg)}
            <div style={{ height: 8, marginTop: 6, borderRadius: 3, background: editorBg, border: `1px solid ${BG.divider}` }} />
          </div>

          <div style={{ height: 1, background: BG.divider }} />

          {/* Reset */}
          <button onClick={() => { setChromeBg(BG.dark); setEditorBg(BG.editor); setAccentColor(ACCENT.primary); setActiveTabBg("#1C1C20"); setTabFlip(false); }} style={{
            background: "none", border: `1px solid ${BG.divider}`, borderRadius: 4,
            color: TEXT.muted, fontSize: 11, padding: "4px 10px", cursor: "pointer",
            alignSelf: "flex-start",
          }}>Reset colours</button>
        </div>
        );
      })()}

      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes syncGlow {
          0%, 100% { box-shadow: 0 0 4px ${BRAND.orange}40; }
          50% { box-shadow: 0 0 14px ${BRAND.orange}80, 0 0 24px ${BRAND.orange}30; }
        }
        @keyframes syncDotPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes tabSlideIn {
          from { max-width: 0; opacity: 0; padding-left: 0; padding-right: 0; overflow: hidden; }
          to { max-width: 200px; opacity: 1; }
        }
        @keyframes tabSlideOut {
          from { max-width: 200px; opacity: 1; }
          to { max-width: 0; opacity: 0; padding-left: 0; padding-right: 0; overflow: hidden; }
        }
        .sidebar-dragging * { transition: none !important; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${BG.divider}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${BG.hover}; box-shadow: 0 0 4px ${BG.hover}40; }
        .tab-scroll::-webkit-scrollbar { height: 0px; }
        .tab-scroll::-webkit-scrollbar-track { background: transparent; }
        .tab-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px; }
        .tab-scroll:hover::-webkit-scrollbar { height: 5px; }
        .tab-scroll:hover::-webkit-scrollbar-thumb { background: ${BG.divider}; }
        .editor-scroll::-webkit-scrollbar-thumb { background: transparent; }
        .editor-scroll:hover::-webkit-scrollbar-thumb { background: ${BG.divider}; }
        input::placeholder { color: ${TEXT.muted}; }
        [contenteditable]:focus { outline: none; }
        .checkbox-box:active { transform: scale(0.85); }
        .tab-btn > .tab-close { opacity: 0; width: 0; overflow: hidden; margin-left: 0; transition: opacity 0.15s, width 0.1s, margin-left 0.1s; }
        .tab-btn:hover > .tab-close, .tab-btn.tab-active > .tab-close { opacity: 0.6; width: 16px; margin-left: 5px; }
        .tab-btn > .tab-close:hover { opacity: 1 !important; }
        .sidebar-note .delete-btn { opacity: 0; transition: opacity 0.1s; }
        .sidebar-note:hover .delete-btn { opacity: 0.5; }
        .sidebar-note .delete-btn:hover { opacity: 1; }
        [contenteditable]:empty::before {
          content: attr(data-placeholder);
          color: ${TEXT.muted};
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
}
