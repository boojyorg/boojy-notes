import { useState, useEffect, useLayoutEffect, useRef } from "react";

// ═══════════════════════════════════════════
// BOOJY AUDIO DESIGN TOKENS
// ═══════════════════════════════════════════

const BG = {
  darkest:  "#1A1A1A",
  dark:     "#222222",
  standard: "#2A2A2A",
  elevated: "#333333",
  surface:  "#3B3B3B",
  divider:  "#444444",
  hover:    "#505050",
};

const TEXT = {
  primary:   "#EBEBEB",
  secondary: "#A0A0A0",
  muted:     "#707070",
};

const ACCENT = {
  primary: "#38BDF8",
  hover:   "#5CCBFA",
};

const SEMANTIC = {
  success: "#4CAF50",
  warning: "#FFC107",
  error:   "#FF5722",
};

const BRAND = {
  orange: "#D4820A",
};

// ═══════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════

const NOTES = {
  "shopping-list": {
    id: "shopping-list", title: "Shopping List", folder: null,
    content: {
      title: "Shopping List",
      blocks: [
        { type: "checkbox", checked: true, text: "Eggs" },
        { type: "checkbox", checked: true, text: "Milk" },
        { type: "checkbox", checked: false, text: "Bread" },
        { type: "checkbox", checked: false, text: "Butter" },
        { type: "checkbox", checked: false, text: "Orange juice" },
        { type: "spacer" },
        { type: "h2", text: "For the weekend" },
        { type: "checkbox", checked: false, text: "Chicken" },
        { type: "checkbox", checked: false, text: "Rice" },
        { type: "checkbox", checked: false, text: "Vegetables" },
      ],
    },
    words: 14,
  },
  "quick-ideas": {
    id: "quick-ideas", title: "Quick Ideas", folder: null,
    content: {
      title: "Quick Ideas",
      blocks: [
        { type: "p", text: "Some ideas for the Boojy Suite that came to mind:" },
        { type: "spacer" },
        { type: "h2", text: "Boojy Draw" },
        { type: "p", text: "A simple vector drawing tool. Could be useful for quick diagrams and wireframes. Keep it minimal — think Excalidraw but integrated into the suite." },
        { type: "spacer" },
        { type: "h2", text: "Boojy Board" },
        { type: "p", text: "Kanban board for project management. Each card could link to a Boojy Note. Free alternative to Trello." },
      ],
    },
    words: 52,
  },
  "meeting-notes": {
    id: "meeting-notes", title: "Meeting Notes", folder: null,
    content: {
      title: "Meeting Notes",
      blocks: [
        { type: "p", text: "Weekly sync — February 17, 2026" },
        { type: "spacer" },
        { type: "h2", text: "Discussion" },
        { type: "p", text: "Talked about the new feature rollout timeline. Need to finalise the sync architecture before moving to mobile." },
        { type: "spacer" },
        { type: "h2", text: "Action items" },
        { type: "checkbox", checked: false, text: "Review Cloudflare R2 pricing" },
        { type: "checkbox", checked: false, text: "Set up Stripe integration" },
        { type: "checkbox", checked: true, text: "Finish sidebar drag implementation" },
      ],
    },
    words: 41,
  },
  "comp201": {
    id: "comp201", title: "COMP201 Notes", folder: "University",
    path: ["University", "2026-27", "COMP201 Notes"],
    content: {
      title: "COMP201 — Software Engineering",
      blocks: [
        { type: "h2", text: "Lecture 4: Requirements Engineering" },
        { type: "p", text: "Requirements engineering is the process of establishing the services that the customer requires from a system and the constraints under which it operates and is developed." },
        { type: "spacer" },
        { type: "h3", text: "Types of requirements" },
        { type: "bullet", text: "Functional — what the system should do" },
        { type: "bullet", text: "Non-functional — constraints on the system (performance, security, usability)" },
        { type: "bullet", text: "Domain — requirements from the application domain" },
        { type: "spacer" },
        { type: "h3", text: "Key takeaway" },
        { type: "p", text: "Getting requirements wrong is the most expensive mistake in software development. It's cheaper to spend more time here than to fix things later." },
      ],
    },
    words: 89,
  },
  "comp207": {
    id: "comp207", title: "COMP207 Notes", folder: "University",
    path: ["University", "2026-27", "COMP207 Notes"],
    content: {
      title: "COMP207 — Database Development",
      blocks: [
        { type: "h2", text: "Normalisation" },
        { type: "p", text: "The process of organising data to reduce redundancy and improve data integrity." },
        { type: "spacer" },
        { type: "h3", text: "Normal Forms" },
        { type: "bullet", text: "1NF — no repeating groups, atomic values" },
        { type: "bullet", text: "2NF — no partial dependencies" },
        { type: "bullet", text: "3NF — no transitive dependencies" },
        { type: "bullet", text: "BCNF — every determinant is a candidate key" },
      ],
    },
    words: 52,
  },
  "barcelona": {
    id: "barcelona", title: "Barcelona Research", folder: "Projects",
    path: ["Projects", "Barcelona Research"],
    content: {
      title: "Barcelona Research",
      blocks: [
        { type: "p", text: "Notes on relocating to Barcelona after graduation." },
        { type: "h2", text: "Cost of living" },
        { type: "bullet", text: "Rent: €800–1200/month for a studio" },
        { type: "bullet", text: "Food: €200–300/month" },
        { type: "bullet", text: "Transport: €40/month (T-Casual)" },
      ],
    },
    words: 32,
  },
  "budget": {
    id: "budget", title: "Budget 2026", folder: "Finance",
    path: ["Finance", "Budget 2026"],
    content: {
      title: "Budget 2026",
      blocks: [
        { type: "p", text: "Monthly budget breakdown and savings goals." },
      ],
    },
    words: 7,
  },
};

const FOLDERS = [
  { name: "University", notes: ["comp201", "comp207"] },
  { name: "Projects", notes: ["barcelona"] },
  { name: "Finance", notes: ["budget"] },
];

const ROOT_NOTES = ["shopping-list", "quick-ideas", "meeting-notes"];

// ═══════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════

let _blockId = 0;
const genBlockId = () => `blk-${++_blockId}`;

const SLASH_COMMANDS = [
  { id: "h2", label: "Heading 2", desc: "Large section heading", icon: "H2", type: "h2" },
  { id: "h3", label: "Heading 3", desc: "Small section heading", icon: "H3", type: "h3" },
  { id: "bullet", label: "Bullet List", desc: "Simple bulleted list", icon: "•", type: "bullet" },
  { id: "checkbox", label: "Checkbox", desc: "Task with a checkbox", icon: "☐", type: "checkbox" },
  { id: "text", label: "Text", desc: "Plain text paragraph", icon: "T", type: "p" },
  { id: "divider", label: "Divider", desc: "Visual spacer", icon: "—", type: "spacer" },
];

// ═══════════════════════════════════════════
// SVG ICONS
// ═══════════════════════════════════════════

const Icon = ({ children, size = 14, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }} {...props}>
    {children}
  </svg>
);

const ChevronRight = ({ color = TEXT.muted }) => (
  <Icon size={13}><path d="M5.5 3L10 8L5.5 13" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></Icon>
);
const ChevronDown = ({ color = TEXT.secondary }) => (
  <Icon size={13}><path d="M3 5.5L8 10L13 5.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></Icon>
);
const FolderIcon = ({ open }) => (
  <Icon size={14}>
    <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.17C6.44 3 6.69 3.11 6.88 3.29L7.71 4.12C7.89 4.31 8.15 4.41 8.41 4.41H12.5C13.33 4.41 14 5.08 14 5.91V12C14 12.55 13.55 13 13 13H3C2.45 13 2 12.55 2 12V4.5Z"
      fill={open ? TEXT.secondary : TEXT.muted} opacity={open ? 0.6 : 0.35}/>
  </Icon>
);
const FileIcon = () => (
  <Icon size={13}>
    <path d="M4.5 2C3.95 2 3.5 2.45 3.5 3V13C3.5 13.55 3.95 14 4.5 14H11.5C12.05 14 12.5 13.55 12.5 13V6L9 2H4.5Z"
      fill={TEXT.muted} opacity="0.3"/>
    <path d="M9 2V5.5H12.5" stroke={TEXT.muted} strokeWidth="0.8" opacity="0.3" strokeLinejoin="round"/>
  </Icon>
);
const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="7" cy="7" r="4.5" stroke={TEXT.muted} strokeWidth="1.5"/>
    <path d="M10.5 10.5L14 14" stroke={TEXT.muted} strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const CloseIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);
const UndoIcon = () => (
  <Icon size={15}>
    <path d="M4 6H10C11.66 6 13 7.34 13 9C13 10.66 11.66 12 10 12H8" stroke={TEXT.muted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M6.5 3.5L4 6L6.5 8.5" stroke={TEXT.muted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </Icon>
);
const RedoIcon = () => (
  <Icon size={15}>
    <path d="M12 6H6C4.34 6 3 7.34 3 9C3 10.66 4.34 12 6 12H8" stroke={TEXT.muted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M9.5 3.5L12 6L9.5 8.5" stroke={TEXT.muted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </Icon>
);
const NewNoteIcon = () => (
  <Icon size={14}>
    <path d="M4 2C3.45 2 3 2.45 3 3V13C3 13.55 3.45 14 4 14H12C12.55 14 13 13.55 13 13V6L9.5 2H4Z"
      stroke="currentColor" strokeWidth="1.3" fill="none"/>
    <path d="M8 7V11M6 9H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </Icon>
);
const NewFolderIcon = () => (
  <Icon size={14}>
    <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.17C6.44 3 6.69 3.11 6.88 3.29L7.71 4.12C7.89 4.31 8.15 4.41 8.41 4.41H12.5C13.33 4.41 14 5.08 14 5.91V12C14 12.55 13.55 13 13 13H3C2.45 13 2 12.55 2 12V4.5Z"
      stroke="currentColor" strokeWidth="1.2" fill="none"/>
    <path d="M8 7.5V10.5M6.5 9H9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </Icon>
);
const SidebarToggleIcon = ({ open }) => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke={TEXT.muted} strokeWidth="1.3"/>
    {open && <path d="M6 2.5V13.5" stroke={TEXT.muted} strokeWidth="1.3"/>}
  </svg>
);
const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M6 2V10M2 6H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);
const BreadcrumbChevron = () => (
  <svg width="7" height="7" viewBox="0 0 7 7" fill="none" style={{ flexShrink: 0 }}>
    <path d="M2 1L5 3.5L2 6" stroke={TEXT.muted} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ═══════════════════════════════════════════
// STAR FIELD FOR EMPTY STATE
// ═══════════════════════════════════════════

const Stars = () => {
  const stars = [
    { x: "12%", y: "18%", s: 1.5, o: 0.15, d: 3 },
    { x: "85%", y: "12%", s: 1, o: 0.1, d: 5 },
    { x: "30%", y: "75%", s: 1.2, o: 0.12, d: 4 },
    { x: "72%", y: "65%", s: 1, o: 0.08, d: 6 },
    { x: "55%", y: "25%", s: 1.3, o: 0.1, d: 3.5 },
    { x: "20%", y: "45%", s: 1, o: 0.07, d: 7 },
    { x: "88%", y: "42%", s: 1.4, o: 0.11, d: 4.5 },
    { x: "42%", y: "85%", s: 1, o: 0.09, d: 5.5 },
    { x: "65%", y: "38%", s: 1.1, o: 0.06, d: 8 },
    { x: "8%", y: "62%", s: 1, o: 0.08, d: 6.5 },
    { x: "78%", y: "82%", s: 1.2, o: 0.1, d: 4 },
    { x: "48%", y: "15%", s: 1, o: 0.07, d: 7.5 },
  ];
  return (
    <>
      {stars.map((s, i) => (
        <div key={i} style={{
          position: "absolute", left: s.x, top: s.y,
          width: s.s, height: s.s, borderRadius: "50%",
          background: TEXT.primary, opacity: s.o,
          animation: `starTwinkle ${s.d}s ease-in-out infinite`,
          animationDelay: `${i * 0.4}s`,
        }} />
      ))}
    </>
  );
};

// ═══════════════════════════════════════════
// EDITABLE BLOCK
// ═══════════════════════════════════════════

function EditableBlock({ block, blockIndex, noteId, onInput, onKeyDown, onCheckToggle, registerRef }) {
  const elRef = useRef(null);

  useLayoutEffect(() => {
    if (elRef.current && block.text !== undefined) {
      elRef.current.innerText = block.text;
    }
  }, []); // mount only — DOM owns text after this

  useEffect(() => {
    if (elRef.current) registerRef(block.id, elRef.current);
    return () => registerRef(block.id, null);
  }, [block.id]);

  const handlePaste = (e) => {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  };

  if (block.type === "spacer") {
    return <div style={{ height: 14 }} />;
  }

  const editableProps = {
    contentEditable: true,
    suppressContentEditableWarning: true,
    onInput: (e) => onInput(noteId, blockIndex, e),
    onKeyDown: (e) => onKeyDown(noteId, blockIndex, e),
    onPaste: handlePaste,
  };

  if (block.type === "p") {
    return (
      <p ref={elRef} {...editableProps} style={{
        margin: "0 0 6px", lineHeight: 1.7, color: TEXT.primary, fontSize: 14.5, outline: "none",
      }} />
    );
  }

  if (block.type === "h2") {
    return (
      <h2 ref={elRef} {...editableProps} style={{
        fontSize: 19, fontWeight: 600, color: TEXT.primary, margin: "6px 0 10px", lineHeight: 1.35, outline: "none",
      }} />
    );
  }

  if (block.type === "h3") {
    return (
      <h3 ref={elRef} {...editableProps} style={{
        fontSize: 15.5, fontWeight: 600, color: TEXT.primary, margin: "6px 0 6px", lineHeight: 1.35, outline: "none",
      }} />
    );
  }

  if (block.type === "bullet") {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "2px 0", fontSize: 14.5, lineHeight: 1.7 }}>
        <span style={{ color: TEXT.muted, marginTop: 1, flexShrink: 0, fontSize: 10 }}>●</span>
        <span ref={elRef} {...editableProps} style={{ color: TEXT.primary, outline: "none", flex: 1 }} />
      </div>
    );
  }

  if (block.type === "checkbox") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "2.5px 0", fontSize: 14.5, lineHeight: 1.6 }}>
        <div
          onClick={(e) => { e.stopPropagation(); onCheckToggle(noteId, blockIndex); }}
          style={{
            width: 16, height: 16, borderRadius: 3.5, flexShrink: 0, cursor: "pointer",
            border: block.checked ? `1.5px solid ${ACCENT.primary}` : `1.5px solid ${TEXT.muted}`,
            background: block.checked ? ACCENT.primary : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s",
          }}
        >
          {block.checked && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5L4.2 7.2L8 3" stroke={BG.darkest} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <span ref={elRef} {...editableProps} style={{
          color: block.checked ? TEXT.muted : TEXT.primary,
          textDecoration: block.checked ? "line-through" : "none",
          outline: "none", flex: 1, transition: "color 0.15s",
        }} />
      </div>
    );
  }

  return null;
}

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════

export default function BoojyNotes() {
  // ─── State ───
  const [expanded, setExpanded] = useState({ University: true });
  const [activeNote, setActiveNote] = useState("comp201");
  const [tabs, setTabs] = useState(["shopping-list", "comp201"]);
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [search, setSearch] = useState("");
  const [settings, setSettings] = useState(false);
  const [syncState, setSyncState] = useState("synced");
  const [editorFadeIn, setEditorFadeIn] = useState(false);
  const [noteData, setNoteData] = useState(() => {
    const clone = {};
    for (const [id, n] of Object.entries(NOTES)) {
      clone[id] = { ...n, content: { title: n.content.title, blocks: n.content.blocks.map(b => ({ ...b, id: genBlockId() })) } };
    }
    return clone;
  });
  const [slashMenu, setSlashMenu] = useState(null);

  // ─── Refs ───
  const isDragging = useRef(false);
  const blockRefs = useRef({});
  const titleRef = useRef(null);
  const focusBlockId = useRef(null);
  const focusCursorPos = useRef(null);
  const noteDataRef = useRef(noteData);
  noteDataRef.current = noteData;
  const slashMenuRef = useRef(slashMenu);
  slashMenuRef.current = slashMenu;

  // ─── Effects ───
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

  useEffect(() => { blockRefs.current = {}; }, [activeNote]);

  // Focus management — runs after every render
  useEffect(() => {
    if (focusBlockId.current) {
      const el = blockRefs.current[focusBlockId.current];
      if (el) {
        el.focus();
        if (focusCursorPos.current !== null) {
          try {
            const range = document.createRange();
            const sel = window.getSelection();
            if (el.childNodes.length > 0) {
              const textNode = el.childNodes[0];
              const pos = Math.min(focusCursorPos.current, textNode.length || 0);
              range.setStart(textNode, pos);
            } else {
              range.setStart(el, 0);
            }
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          } catch (_) { /* ignore range errors */ }
        }
      }
      focusBlockId.current = null;
      focusCursorPos.current = null;
    }
  });

  // ─── Drag handler ───
  const startDrag = (e) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev) => {
      if (!isDragging.current) return;
      setSidebarWidth(Math.min(400, Math.max(160, ev.clientX)));
    };
    const onUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ─── Navigation helpers ───
  const toggle = (n) => setExpanded((p) => ({ ...p, [n]: !p[n] }));
  const openNote = (id) => { setActiveNote(id); if (!tabs.includes(id)) setTabs([...tabs, id]); };
  const closeTab = (e, id) => {
    e.stopPropagation();
    const next = tabs.filter((t) => t !== id);
    setTabs(next);
    if (activeNote === id) setActiveNote(next[next.length - 1] || null);
  };

  // ─── Derived data ───
  const note = activeNote ? noteData[activeNote] : null;
  const wordCount = note ? note.content.blocks
    .filter(b => b.text)
    .reduce((sum, b) => sum + b.text.split(/\s+/).filter(Boolean).length, 0) : 0;

  // ─── Block CRUD ───
  const updateBlockText = (noteId, blockIndex, newText) => {
    setNoteData(prev => {
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
    setNoteData(prev => {
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
    setNoteData(prev => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks.splice(blockIndex, 1);
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
  };

  const changeBlockType = (noteId, blockIndex, newType) => {
    setNoteData(prev => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      const old = blocks[blockIndex];
      const updated = { ...old, type: newType };
      if (newType === "checkbox") updated.checked = false;
      if (newType === "spacer") { delete updated.text; delete updated.checked; }
      if (newType !== "checkbox") delete updated.checked;
      blocks[blockIndex] = updated;
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
  };

  const flipCheck = (noteId, blockIndex) => {
    setNoteData(prev => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks[blockIndex] = { ...blocks[blockIndex], checked: !blocks[blockIndex].checked };
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
  };

  const registerBlockRef = (id, el) => {
    if (el) blockRefs.current[id] = el;
    else delete blockRefs.current[id];
  };

  // ─── Slash command execution ───
  const executeSlashCommand = (noteId, blockIndex, command) => {
    const blocks = noteDataRef.current[noteId].content.blocks;
    const block = blocks[blockIndex];
    const el = blockRefs.current[block.id];
    if (el) el.innerText = "";
    updateBlockText(noteId, blockIndex, "");
    changeBlockType(noteId, blockIndex, command.type);
    if (command.type === "spacer") {
      insertBlockAfter(noteId, blockIndex, "p", "");
    } else {
      focusBlockId.current = block.id;
      focusCursorPos.current = 0;
    }
  };

  // ─── Block input handler ───
  const handleBlockInput = (noteId, blockIndex, e) => {
    const el = e.currentTarget;
    const text = el.innerText;
    updateBlockText(noteId, blockIndex, text);

    if (text === "/") {
      const rect = el.getBoundingClientRect();
      setSlashMenu({ noteId, blockIndex, filter: "", selectedIndex: 0, rect: { top: rect.bottom + 4, left: rect.left } });
    } else if (slashMenuRef.current && slashMenuRef.current.blockIndex === blockIndex) {
      if (text.startsWith("/")) {
        setSlashMenu(prev => prev ? { ...prev, filter: text.slice(1), selectedIndex: 0 } : null);
      } else {
        setSlashMenu(null);
      }
    }
  };

  // ─── Block keyboard handler ───
  const handleBlockKeyDown = (noteId, blockIndex, e) => {
    const blocks = noteDataRef.current[noteId].content.blocks;
    const block = blocks[blockIndex];
    const el = blockRefs.current[block.id];

    // Slash menu navigation
    if (slashMenuRef.current && slashMenuRef.current.blockIndex === blockIndex) {
      const sm = slashMenuRef.current;
      const filtered = SLASH_COMMANDS.filter(c => c.label.toLowerCase().includes(sm.filter.toLowerCase()));
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashMenu(prev => prev ? { ...prev, selectedIndex: Math.min(prev.selectedIndex + 1, filtered.length - 1) } : null); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashMenu(prev => prev ? { ...prev, selectedIndex: Math.max(prev.selectedIndex - 1, 0) } : null); return; }
      if (e.key === "Enter") { e.preventDefault(); if (filtered.length > 0) executeSlashCommand(noteId, blockIndex, filtered[sm.selectedIndex] || filtered[0]); setSlashMenu(null); return; }
      if (e.key === "Escape") { e.preventDefault(); setSlashMenu(null); return; }
    }

    const text = el ? el.innerText : "";

    // Enter — split block
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const preRange = document.createRange();
      preRange.selectNodeContents(el);
      preRange.setEnd(range.startContainer, range.startOffset);
      const beforeText = preRange.toString();
      const afterText = text.slice(beforeText.length);
      el.innerText = beforeText;
      updateBlockText(noteId, blockIndex, beforeText);
      insertBlockAfter(noteId, blockIndex, "p", afterText);
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

    // Arrow up — move to previous block when at start
    if (e.key === "ArrowUp") {
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (rect.top - elRect.top < 5) {
          e.preventDefault();
          let prevIdx = blockIndex - 1;
          while (prevIdx >= 0 && blocks[prevIdx].type === "spacer") prevIdx--;
          if (prevIdx >= 0) {
            const prev = blocks[prevIdx];
            focusBlockId.current = prev.id;
            focusCursorPos.current = (prev.text || "").length;
            blockRefs.current[prev.id]?.focus();
          } else {
            titleRef.current?.focus();
          }
        }
      }
    }

    // Arrow down — move to next block when at end
    if (e.key === "ArrowDown") {
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (elRect.bottom - rect.bottom < 5) {
          e.preventDefault();
          let nextIdx = blockIndex + 1;
          while (nextIdx < blocks.length && blocks[nextIdx].type === "spacer") nextIdx++;
          if (nextIdx < blocks.length) {
            focusBlockId.current = blocks[nextIdx].id;
            focusCursorPos.current = 0;
            blockRefs.current[blocks[nextIdx].id]?.focus();
          }
        }
      }
    }
  };

  // ─── Search filtering ───
  const lc = (s) => s.toLowerCase();
  const fFolders = search
    ? FOLDERS.filter((f) => lc(f.name).includes(lc(search)) || f.notes.some((n) => lc(noteData[n].title).includes(lc(search))))
    : FOLDERS;
  const fNotes = search
    ? ROOT_NOTES.filter((n) => lc(noteData[n].title).includes(lc(search)))
    : ROOT_NOTES;

  // ─── UI helpers ───
  const hBg = (el, c) => { el.style.background = c; };

  const syncDotStyle = () => {
    const base = {
      width: 17, height: 17, borderRadius: "50%",
      background: BRAND.orange, border: "none",
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

      {/* ═══ SINGLE TOP ROW ═══ */}
      <div style={{
        height: 44, background: BG.dark,
        borderBottom: `1px solid ${BG.divider}`,
        display: "flex", alignItems: "center",
        flexShrink: 0,
      }}>
        {/* Left section — aligns with sidebar width */}
        <div style={{
          width: collapsed ? "auto" : sidebarWidth,
          flexShrink: 0, display: "flex", alignItems: "center",
          padding: "0 10px 0 14px", height: "100%",
          borderRight: collapsed ? "none" : `1px solid ${BG.divider}`,
        }}>
          {/* N●tes */}
          <div style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
            <span style={{ fontSize: 19, fontWeight: 800, color: TEXT.primary, letterSpacing: "-0.5px" }}>N</span>
            <button
              onClick={() => setSettings(!settings)}
              style={syncDotStyle()}
              onMouseEnter={(e) => e.target.style.transform = "scale(1.1)"}
              onMouseLeave={(e) => e.target.style.transform = "scale(1)"}
              title={`Settings · Sync: ${syncState}`}
            />
            <span style={{ fontSize: 19, fontWeight: 800, color: TEXT.primary, letterSpacing: "-0.5px" }}>tes</span>
          </div>

          <button onClick={() => setCollapsed(!collapsed)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: 4, borderRadius: 5, display: "flex", alignItems: "center",
              marginLeft: 8, transition: "background 0.15s",
            }}
            onMouseEnter={(e) => hBg(e.currentTarget, BG.surface)}
            onMouseLeave={(e) => hBg(e.currentTarget, "transparent")}
            title={collapsed ? "Show sidebar" : "Hide sidebar"}
          >
            <SidebarToggleIcon open={!collapsed} />
          </button>

          <div style={{ flex: 1 }} />

          <div style={{ display: "flex", gap: 1, flexShrink: 0 }}>
            <button style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 3px", borderRadius: 4, display: "flex", alignItems: "center" }}><UndoIcon /></button>
            <button style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 3px", borderRadius: 4, display: "flex", alignItems: "center" }}><RedoIcon /></button>
          </div>
        </div>

        {/* Right section — tabs + actions */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", height: "100%", overflow: "hidden" }}>
          {/* Tabs */}
          <div style={{ display: "flex", alignItems: "stretch", flex: 1, overflow: "auto", height: "100%" }}>
            {tabs.map((tId) => {
              const t = noteData[tId];
              const act = activeNote === tId;
              return (
                <button key={tId} onClick={() => setActiveNote(tId)}
                  style={{
                    background: act ? BG.standard : "transparent",
                    border: "none",
                    borderBottom: act ? `2px solid ${ACCENT.primary}` : "2px solid transparent",
                    borderImage: act ? `linear-gradient(90deg, transparent, ${ACCENT.primary}, transparent) 1` : "none",
                    cursor: "pointer", padding: "0 14px",
                    display: "flex", alignItems: "center", gap: 7,
                    color: act ? TEXT.primary : TEXT.muted,
                    fontSize: 12, fontFamily: "inherit",
                    whiteSpace: "nowrap", transition: "background 0.15s, color 0.15s",
                    height: "100%",
                  }}
                  onMouseEnter={(e) => { if (!act) { hBg(e.currentTarget, BG.elevated); e.currentTarget.style.color = TEXT.secondary; } }}
                  onMouseLeave={(e) => { if (!act) { hBg(e.currentTarget, "transparent"); e.currentTarget.style.color = TEXT.muted; } }}
                >
                  <span>{t.title}</span>
                  <span onClick={(e) => closeTab(e, tId)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 16, height: 16, borderRadius: 4,
                      color: TEXT.muted, transition: "all 0.1s",
                      opacity: act ? 0.7 : 0,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = BG.surface; e.currentTarget.style.color = TEXT.primary; e.currentTarget.style.opacity = 1; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = TEXT.muted; e.currentTarget.style.opacity = act ? 0.7 : 0; }}
                  ><CloseIcon /></span>
                </button>
              );
            })}
            {/* + new tab */}
            <button style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "0 10px", color: TEXT.muted, display: "flex",
              alignItems: "center", transition: "color 0.15s", height: "100%",
            }}
              onMouseEnter={(e) => e.currentTarget.style.color = ACCENT.primary}
              onMouseLeave={(e) => e.currentTarget.style.color = TEXT.muted}
            ><PlusIcon /></button>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: BG.divider, flexShrink: 0, margin: "0 4px" }} />

          {/* Word count */}
          {note && (
            <span style={{ fontSize: 11, color: TEXT.muted, flexShrink: 0, padding: "0 6px", whiteSpace: "nowrap" }}>
              {wordCount} words
            </span>
          )}

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: BG.divider, flexShrink: 0, margin: "0 4px" }} />

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 4, flexShrink: 0, padding: "0 10px 0 6px" }}>
            {[
              { icon: <NewNoteIcon />, title: "New note" },
              { icon: <NewFolderIcon />, title: "New folder" },
            ].map((btn, i) => (
              <button key={i} style={{
                width: 30, height: 28, borderRadius: 6,
                background: BG.elevated, border: `1px solid ${BG.divider}`,
                cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center",
                color: TEXT.muted, transition: "all 0.15s",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACCENT.primary; e.currentTarget.style.color = ACCENT.primary; e.currentTarget.style.background = BG.surface; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = BG.divider; e.currentTarget.style.color = TEXT.muted; e.currentTarget.style.background = BG.elevated; }}
                title={btn.title}
              >{btn.icon}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ MAIN AREA ═══ */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ─── SIDEBAR ─── */}
        {!collapsed && (
          <div style={{
            width: sidebarWidth, background: BG.dark,
            display: "flex", flexShrink: 0, overflow: "hidden",
            position: "relative",
          }}>
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
            {/* Search */}
            <div style={{ padding: "8px 8px 8px" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 7,
                background: BG.darkest, borderRadius: 6,
                padding: "5px 9px", border: `1px solid ${BG.divider}`,
              }}>
                <SearchIcon />
                <input type="text" placeholder="Search..."
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  style={{
                    background: "none", border: "none", outline: "none",
                    color: TEXT.primary, fontSize: 12, width: "100%", fontFamily: "inherit",
                  }}
                />
              </div>
            </div>

            {/* File tree */}
            <div style={{ flex: 1, overflow: "auto", padding: "2px 0" }}>
              {fFolders.map((folder) => (
                <div key={folder.name}>
                  <button onClick={() => toggle(folder.name)}
                    style={{
                      width: "100%", background: "none", border: "none",
                      cursor: "pointer", padding: "4px 10px",
                      display: "flex", alignItems: "center", gap: 5,
                      color: TEXT.primary, fontSize: 12.5, fontFamily: "inherit",
                      transition: "background 0.1s", textAlign: "left",
                    }}
                    onMouseEnter={(e) => hBg(e.currentTarget, BG.surface)}
                    onMouseLeave={(e) => hBg(e.currentTarget, "transparent")}
                  >
                    {expanded[folder.name] ? <ChevronDown /> : <ChevronRight />}
                    <FolderIcon open={expanded[folder.name]} />
                    <span style={{ fontWeight: 500 }}>{folder.name}</span>
                  </button>
                  {expanded[folder.name] && folder.notes.map((nId) => {
                    const n = noteData[nId]; const act = activeNote === nId;
                    return (
                      <button key={nId} onClick={() => openNote(nId)}
                        style={{
                          width: "100%", border: "none", cursor: "pointer",
                          background: act ? BG.surface : "transparent",
                          borderLeft: act ? `3px solid ${ACCENT.primary}` : "3px solid transparent",
                          padding: "4px 10px 4px 36px",
                          display: "flex", alignItems: "center", gap: 5,
                          color: act ? TEXT.primary : TEXT.secondary,
                          fontSize: 12.5, fontFamily: "inherit",
                          fontWeight: act ? 600 : 400,
                          transition: "background 0.12s", textAlign: "left",
                        }}
                        onMouseEnter={(e) => { if (!act) hBg(e.currentTarget, BG.elevated); }}
                        onMouseLeave={(e) => { if (!act) hBg(e.currentTarget, "transparent"); }}
                      >
                        <FileIcon />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* · · · constellation separator */}
              {fFolders.length > 0 && fNotes.length > 0 && (
                <div style={{
                  display: "flex", justifyContent: "center", gap: 6,
                  padding: "8px 0", opacity: 0.25,
                }}>
                  <div style={{ width: 2.5, height: 2.5, borderRadius: "50%", background: TEXT.primary }} />
                  <div style={{ width: 2, height: 2, borderRadius: "50%", background: TEXT.primary, marginTop: 1 }} />
                  <div style={{ width: 2.5, height: 2.5, borderRadius: "50%", background: TEXT.primary }} />
                </div>
              )}

              {fNotes.map((nId) => {
                const n = noteData[nId]; const act = activeNote === nId;
                return (
                  <button key={nId} onClick={() => openNote(nId)}
                    style={{
                      width: "100%", border: "none", cursor: "pointer",
                      background: act ? BG.surface : "transparent",
                      borderLeft: act ? `3px solid ${ACCENT.primary}` : "3px solid transparent",
                      padding: "4px 10px 4px 12px",
                      display: "flex", alignItems: "center", gap: 5,
                      color: act ? TEXT.primary : TEXT.secondary,
                      fontSize: 12.5, fontFamily: "inherit",
                      fontWeight: act ? 600 : 400,
                      transition: "background 0.12s", textAlign: "left",
                    }}
                    onMouseEnter={(e) => { if (!act) hBg(e.currentTarget, BG.elevated); }}
                    onMouseLeave={(e) => { if (!act) hBg(e.currentTarget, "transparent"); }}
                  >
                    <FileIcon />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Drag handle */}
          <div
            onMouseDown={startDrag}
            style={{
              width: 4, cursor: "col-resize",
              background: "transparent",
              borderRight: `1px solid ${BG.divider}`,
              flexShrink: 0, transition: "background 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = ACCENT.primary}
            onMouseLeave={(e) => { if (!isDragging.current) e.currentTarget.style.background = "transparent"; }}
          />
          </div>
        )}

        {/* ─── EDITOR ─── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: BG.standard }}>
          {note ? (
            <div key={activeNote} style={{
              flex: 1, overflow: "auto",
              padding: "28px 56px 80px",
              opacity: editorFadeIn ? 1 : 0,
              transform: editorFadeIn ? "translateY(0)" : "translateY(4px)",
              transition: "opacity 0.2s ease, transform 0.2s ease",
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
                  setNoteData(prev => {
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
                    if (first) blockRefs.current[first.id]?.focus();
                  }
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
                }}
                style={{
                  fontSize: 28, fontWeight: 700, color: TEXT.primary,
                  margin: "0 0 24px", lineHeight: 1.3, letterSpacing: "-0.4px",
                  outline: "none",
                }}
              />

              {/* Blocks */}
              {note.content.blocks.map((block, i) => (
                <EditableBlock
                  key={block.id + "-" + block.type}
                  block={block}
                  blockIndex={i}
                  noteId={activeNote}
                  onInput={handleBlockInput}
                  onKeyDown={handleBlockKeyDown}
                  onCheckToggle={flipCheck}
                  registerRef={registerBlockRef}
                />
              ))}

              {/* Click to create new block */}
              <div
                style={{ minHeight: 200, cursor: "text" }}
                onClick={() => {
                  const blocks = noteData[activeNote].content.blocks;
                  insertBlockAfter(activeNote, blocks.length - 1, "p", "");
                }}
              />
            </div>
          ) : (
            /* ─── EMPTY STATE ─── */
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              position: "relative", overflow: "hidden",
            }}>
              <Stars />

              <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
                {/* Faded N●tes logo */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 20, opacity: 0.12 }}>
                  <span style={{ fontSize: 48, fontWeight: 800, color: TEXT.primary }}>N</span>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: BRAND.orange, position: "relative", top: 2 }} />
                  <span style={{ fontSize: 48, fontWeight: 800, color: TEXT.primary }}>tes</span>
                </div>

                <p style={{ color: TEXT.muted, fontSize: 14, marginBottom: 28, opacity: 0.7 }}>Start writing...</p>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: 0.4 }}>
                  {[
                    { key: "⌘N", label: "New note" },
                    { key: "⌘P", label: "Search notes" },
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
      </div>

      {/* ═══ SETTINGS OVERLAY ═══ */}
      {settings && (
        <div onClick={() => setSettings(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, backdropFilter: "blur(4px)",
            animation: "fadeIn 0.15s ease",
          }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{
              background: BG.elevated, borderRadius: 14,
              border: `1px solid ${BG.divider}`,
              width: 380, padding: 26,
              boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
              animation: "slideUp 0.2s ease",
            }}>
            <h2 style={{ margin: "0 0 22px", fontSize: 17, fontWeight: 600, color: TEXT.primary }}>Settings</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: TEXT.muted, fontWeight: 600 }}>Vault</label>
                <div style={{
                  marginTop: 5, padding: "7px 11px", background: BG.dark,
                  borderRadius: 6, border: `1px solid ${BG.divider}`,
                  fontSize: 11.5, color: TEXT.secondary,
                  fontFamily: "'SF Mono', 'Fira Code', monospace",
                }}>~/Boojy/Notes/</div>
              </div>

              <div>
                <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: TEXT.muted, fontWeight: 600 }}>Sync</label>
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 7 }}>
                  {["Boojy Cloud (free, 100MB)", "GitHub", "Local only"].map((opt, i) => (
                    <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12.5, color: TEXT.primary }}>
                      <div style={{
                        width: 15, height: 15, borderRadius: "50%",
                        border: i === 0 ? `2px solid ${ACCENT.primary}` : `2px solid ${TEXT.muted}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {i === 0 && <div style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT.primary }} />}
                      </div>
                      {opt}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: TEXT.muted, fontWeight: 600 }}>Sync status demo</label>
                <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["synced", "syncing", "error", "offline"].map((s) => (
                    <button key={s} onClick={() => setSyncState(s)} style={{
                      padding: "5px 14px",
                      background: syncState === s ? ACCENT.primary : "transparent",
                      border: `1px solid ${syncState === s ? ACCENT.primary : BG.divider}`,
                      borderRadius: 6, color: syncState === s ? BG.darkest : TEXT.muted,
                      fontSize: 11.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                      transition: "all 0.15s",
                    }}>{s}</button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: TEXT.muted, fontWeight: 600 }}>Theme</label>
                <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                  {["Dark", "Light"].map((t) => (
                    <button key={t} style={{
                      padding: "5px 16px",
                      background: t === "Dark" ? ACCENT.primary : "transparent",
                      border: `1px solid ${t === "Dark" ? ACCENT.primary : BG.divider}`,
                      borderRadius: 6, color: t === "Dark" ? BG.darkest : TEXT.muted,
                      fontSize: 11.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
                    }}>{t}</button>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={() => setSettings(false)}
              style={{
                marginTop: 22, width: "100%", padding: "9px",
                background: ACCENT.primary, border: "none", borderRadius: 8,
                color: BG.darkest, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = ACCENT.hover}
              onMouseLeave={(e) => e.currentTarget.style.background = ACCENT.primary}
            >Done</button>
          </div>
        </div>
      )}

      {/* ═══ SLASH MENU OVERLAY ═══ */}
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
                    transition: "background 0.08s",
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

      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes syncGlow {
          0%, 100% { box-shadow: 0 0 4px ${BRAND.orange}40; }
          50% { box-shadow: 0 0 14px ${BRAND.orange}80, 0 0 24px ${BRAND.orange}30; }
        }
        @keyframes starTwinkle {
          0%, 100% { opacity: inherit; }
          50% { opacity: 0.02; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${BG.divider}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${BG.hover}; box-shadow: 0 0 4px ${BG.hover}40; }
        input::placeholder { color: ${TEXT.muted}; }
        [contenteditable]:focus { outline: none; }
        [contenteditable]:empty::before {
          content: attr(data-placeholder);
          color: ${TEXT.muted};
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
}
