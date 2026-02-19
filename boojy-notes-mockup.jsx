import { useState, useEffect, useLayoutEffect, useRef } from "react";

// ═══════════════════════════════════════════
// BOOJY AUDIO DESIGN TOKENS
// ═══════════════════════════════════════════

const BG = {
  darkest:  "#13151C",
  dark:     "#1A1C25",
  standard: "#222430",
  editor:   "#131423",
  elevated: "#292B36",
  surface:  "#353845",
  divider:  "#3A3D4A",
  hover:    "#4A4D5A",
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

const FINDER = {
  folderBlue:    "#3B82F6",
  folderDark:    "#2563EB",
  selectBg:      "#1E3A5F",
  selectBgHover: "#254A73",
  docIcon:       "#9CA3AF",
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
  "boojy-design": {
    id: "boojy-design", title: "Boojy Design - Early Preview", folder: "Boojy",
    path: ["Boojy", "Boojy Design - Early Preview"],
    content: {
      title: "Boojy Design - Early Preview",
      blocks: [
        { type: "p", text: "Design notes for the early preview of the Boojy Suite." },
      ],
    },
    words: 11,
  },
  "boojy-draw-comp": {
    id: "boojy-draw-comp", title: "Boojy Draw Competitor Comparisons", folder: "Boojy",
    path: ["Boojy", "Boojy Draw Competitor Comparisons"],
    content: {
      title: "Boojy Draw Competitor Comparisons",
      blocks: [
        { type: "p", text: "Comparing Boojy Draw against Excalidraw, Figma, and tldraw." },
      ],
    },
    words: 9,
  },
  "boojy-suite-vision": {
    id: "boojy-suite-vision", title: "Boojy Suite (Vision Document)", folder: "Boojy",
    path: ["Boojy", "Boojy Suite (Vision Document)"],
    content: {
      title: "Boojy Suite (Vision Document)",
      blocks: [
        { type: "p", text: "Long-term vision for the Boojy productivity suite." },
      ],
    },
    words: 8,
  },
  "boojy-video": {
    id: "boojy-video", title: "Boojy Video - Final Cut Pro, Premiere, Resolve", folder: "Boojy",
    path: ["Boojy", "Boojy Video - Final Cut Pro, Premiere, Resolve"],
    content: {
      title: "Boojy Video - Final Cut Pro, Premiere, Resolve",
      blocks: [
        { type: "p", text: "Research on video editors: Final Cut Pro, Premiere Pro, DaVinci Resolve." },
      ],
    },
    words: 11,
  },
  "beta-todo": {
    id: "beta-todo", title: "Beta (v0.1) TODO", folder: "Boojy/Boojy Audio",
    path: ["Boojy", "Boojy Audio", "Beta (v0.1) TODO"],
    content: {
      title: "Beta (v0.1) TODO",
      blocks: [
        { type: "checkbox", checked: true, text: "Core audio engine" },
        { type: "checkbox", checked: true, text: "Track mixer UI" },
        { type: "checkbox", checked: false, text: "Plugin hosting (VST3)" },
        { type: "checkbox", checked: false, text: "Export to WAV/MP3" },
      ],
    },
    words: 14,
  },
  "boojy-audio-future": {
    id: "boojy-audio-future", title: "Boojy Audio (Future Features)", folder: "Boojy/Boojy Audio",
    path: ["Boojy", "Boojy Audio", "Boojy Audio (Future Features)"],
    content: {
      title: "Boojy Audio (Future Features)",
      blocks: [
        { type: "p", text: "Features planned for post-v1.0 of Boojy Audio." },
        { type: "bullet", text: "MIDI editing" },
        { type: "bullet", text: "Automation lanes" },
        { type: "bullet", text: "Collaborative sessions" },
      ],
    },
    words: 16,
  },
  "boojy-audio-ideas": {
    id: "boojy-audio-ideas", title: "Boojy Audio Ideas", folder: "Boojy/Boojy Audio",
    path: ["Boojy", "Boojy Audio", "Boojy Audio Ideas"],
    content: {
      title: "Boojy Audio Ideas",
      blocks: [
        { type: "p", text: "Brainstorming ideas for the Boojy Audio DAW." },
        { type: "spacer" },
        { type: "h2", text: "Sampler" },
        { type: "p", text: "Drag-and-drop sample pads with waveform preview. Auto-chop mode for loops." },
        { type: "spacer" },
        { type: "h2", text: "Piano Roll" },
        { type: "p", text: "Velocity-sensitive, snap-to-grid, ghost notes from other tracks." },
      ],
    },
    words: 36,
  },
  "design-review": {
    id: "design-review", title: "Design Review - Boojy Audio", folder: "Boojy/Boojy Audio",
    path: ["Boojy", "Boojy Audio", "Design Review - Boojy Audio"],
    content: {
      title: "Design Review - Boojy Audio",
      blocks: [
        { type: "p", text: "Feedback from design review session on the Boojy Audio interface." },
      ],
    },
    words: 11,
  },
  "track-mixer-spec": {
    id: "track-mixer-spec", title: "Updated Track Mixer Design Specification", folder: "Boojy/Boojy Audio",
    path: ["Boojy", "Boojy Audio", "Updated Track Mixer Design Specification"],
    content: {
      title: "Updated Track Mixer Design Specification",
      blocks: [
        { type: "p", text: "Revised specification for the track mixer component." },
      ],
    },
    words: 8,
  },
  "v1-todo": {
    id: "v1-todo", title: "v1.0 TODO list", folder: "Boojy/Boojy Audio",
    path: ["Boojy", "Boojy Audio", "v1.0 TODO list"],
    content: {
      title: "v1.0 TODO list",
      blocks: [
        { type: "checkbox", checked: true, text: "Audio engine rewrite" },
        { type: "checkbox", checked: false, text: "Cross-platform testing" },
        { type: "checkbox", checked: false, text: "Performance profiling" },
      ],
    },
    words: 8,
  },
  "comp201": {
    id: "comp201", title: "COMP201 Notes", folder: "University",
    path: ["University", "COMP201 Notes"],
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
    path: ["University", "COMP207 Notes"],
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

// Nested folder tree — supports subfolders like macOS Finder
const FOLDER_TREE = [
  {
    name: "Boojy",
    children: [
      { name: "Boojy Audio", children: [], notes: ["beta-todo", "boojy-audio-future", "boojy-audio-ideas", "design-review", "track-mixer-spec", "v1-todo"] },
    ],
    notes: ["boojy-design", "boojy-draw-comp", "boojy-suite-vision", "boojy-video"],
  },
  { name: "Finance", children: [], notes: ["budget"] },
  { name: "Projects", children: [], notes: ["barcelona"] },
  { name: "University", children: [], notes: ["comp201", "comp207"] },
];

const ROOT_NOTES = ["shopping-list", "quick-ideas", "meeting-notes"];

// ═══════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════

let _blockId = 0;
const genBlockId = () => `blk-${++_blockId}`;

let _noteId = 0;
const genNoteId = () => `note-${Date.now()}-${++_noteId}`;

const STORAGE_KEY = "boojy-notes-v1";
let _cachedStorage;
const loadFromStorage = () => {
  if (_cachedStorage !== undefined) return _cachedStorage;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _cachedStorage = raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("Failed to load from localStorage:", e);
    _cachedStorage = null;
  }
  return _cachedStorage;
};

const SLASH_COMMANDS = [
  { id: "h1", label: "Heading 1", desc: "Page-level heading", icon: "H1", type: "h1" },
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
  <Icon size={15}>
    <path d="M2 4.5C2 3.67 2.67 3 3.5 3H6.17C6.44 3 6.69 3.11 6.88 3.29L7.71 4.12C7.89 4.31 8.15 4.41 8.41 4.41H12.5C13.33 4.41 14 5.08 14 5.91V12C14 12.55 13.55 13 13 13H3C2.45 13 2 12.55 2 12V4.5Z"
      fill={FINDER.folderBlue} opacity={open ? 0.9 : 0.75}/>
  </Icon>
);
const FileIcon = () => (
  <Icon size={15}>
    <path d="M4.5 2C3.95 2 3.5 2.45 3.5 3V13C3.5 13.55 3.95 14 4.5 14H11.5C12.05 14 12.5 13.55 12.5 13V6L9 2H4.5Z"
      fill={FINDER.docIcon} opacity="0.55"/>
    <path d="M9 2V5.5H12.5" stroke={FINDER.docIcon} strokeWidth="0.8" opacity="0.55" strokeLinejoin="round"/>
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
  <Icon size={16.5}>
    <path d="M4 6H10C11.66 6 13 7.34 13 9C13 10.66 11.66 12 10 12H8" stroke={TEXT.muted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M6.5 3.5L4 6L6.5 8.5" stroke={TEXT.muted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </Icon>
);
const RedoIcon = () => (
  <Icon size={16.5}>
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
  <svg width="16.5" height="16.5" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke={TEXT.muted} strokeWidth="1.3"/>
    {open && <path d="M6 2.5V13.5" stroke={TEXT.muted} strokeWidth="1.3"/>}
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

const StarField = ({ mode = "empty" }) => {
  const canvasRef = useRef(null);
  const starsRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    const generateStars = (w, h) => {
      const count = mode === "empty" ? 120 : 55;
      const topExclude = mode === "empty" ? 0.05 : 0.12;
      const colours = ["#FFFFFF","#FFFFFF","#FFFFFF","#FFFFFF","#FFFFFF","#FFFFFF","#FFFFFF","#FFFFFF","#F0F4FF","#FFFDDE"];
      return Array.from({ length: count }, () => {
        const isHero = Math.random() < 0.08;
        const radius = isHero ? 1.5 + Math.random() * 1.0 : 0.3 + Math.random() * 1.2;
        return {
          x: Math.random() * w,
          y: h * topExclude + Math.random() * h * (1 - topExclude),
          radius,
          color: colours[Math.floor(Math.random() * colours.length)],
          maxBrightness: 0.3 + Math.random() * 0.7,
          cycleDuration: 30000 + Math.random() * 120000,
          phaseOffset: Math.random() * Math.PI * 2,
          shadowBlur: radius > 1.0 ? 4 + radius * 3 : 2 + radius * 2,
        };
      });
    };

    const resize = () => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      starsRef.current = generateStars(w, h);
    };

    resize();
    window.addEventListener("resize", resize);

    let raf;
    const draw = (time) => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const stars = starsRef.current;
      if (!stars) { raf = requestAnimationFrame(draw); return; }
      const emptyMult = mode === "empty" ? 1.6 : 1.0;

      for (const s of stars) {
        const cycle = (time % s.cycleDuration) / s.cycleDuration;
        const sine = Math.sin(cycle * Math.PI * 2 + s.phaseOffset);
        const norm = (sine + 1) / 2;
        const opacity = Math.min((0.08 + norm * (s.maxBrightness - 0.08)) * emptyMult, 1.0);

        ctx.globalAlpha = opacity;
        ctx.fillStyle = s.color;
        if (s.radius > 1.0) {
          ctx.shadowBlur = s.shadowBlur * (0.6 + norm * 0.4);
          ctx.shadowColor = s.color;
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fill();
        if (s.radius > 1.0) ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [mode]);

  return (
    <canvas ref={canvasRef} style={{
      position: "absolute", inset: 0,
      pointerEvents: "none", zIndex: 0,
    }} />
  );
};

// ═══════════════════════════════════════════
// EDITABLE BLOCK
// ═══════════════════════════════════════════

function EditableBlock({ block, blockIndex, noteId, onCheckToggle, registerRef, syncGen }) {
  const elRef = useRef(null);

  // Set text on mount and force-resync on undo/redo (syncGen changes)
  useLayoutEffect(() => {
    if (elRef.current && block.text !== undefined) {
      elRef.current.innerText = block.text;
    }
  }, [syncGen]); // eslint-disable-line -- only mount + undo/redo, NOT on every keystroke

  useEffect(() => {
    if (elRef.current) registerRef(block.id, elRef.current);
    return () => registerRef(block.id, null);
  }, [block.id]);

  if (block.type === "spacer") {
    return <div data-block-id={block.id} contentEditable="false" style={{ padding: "8px 0", userSelect: "none" }}><hr style={{ border: "none", borderTop: `1px solid ${BG.divider}`, margin: 0 }} /></div>;
  }

  if (block.type === "p") {
    return (
      <p ref={elRef} data-block-id={block.id} style={{
        margin: "0 0 6px", lineHeight: 1.7, color: TEXT.primary, fontSize: 14.5, outline: "none",
      }} />
    );
  }

  if (block.type === "h1") {
    return (
      <h1 ref={elRef} data-block-id={block.id} style={{
        fontSize: 28, fontWeight: 700, color: TEXT.primary, margin: "8px 0 12px", lineHeight: 1.3, letterSpacing: "-0.4px", outline: "none",
      }} />
    );
  }

  if (block.type === "h2") {
    return (
      <h2 ref={elRef} data-block-id={block.id} style={{
        fontSize: 22, fontWeight: 600, color: TEXT.primary, margin: "6px 0 10px", lineHeight: 1.35, letterSpacing: "-0.2px", outline: "none",
      }} />
    );
  }

  if (block.type === "h3") {
    return (
      <h3 ref={elRef} data-block-id={block.id} style={{
        fontSize: 16.5, fontWeight: 600, color: TEXT.primary, margin: "6px 0 6px", lineHeight: 1.35, outline: "none",
      }} />
    );
  }

  if (block.type === "bullet") {
    return (
      <div data-block-id={block.id} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "2px 0", fontSize: 14.5, lineHeight: 1.7 }}>
        <span contentEditable="false" style={{ color: TEXT.muted, marginTop: 1, flexShrink: 0, fontSize: 10, userSelect: "none" }}>●</span>
        <span ref={elRef} style={{ color: TEXT.primary, outline: "none", flex: 1 }} />
      </div>
    );
  }

  if (block.type === "checkbox") {
    return (
      <div data-block-id={block.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "2.5px 0", fontSize: 14.5, lineHeight: 1.6 }}>
        <div
          contentEditable="false"
          onClick={(e) => { e.stopPropagation(); onCheckToggle(noteId, blockIndex); }}
          style={{
            width: 16, height: 16, borderRadius: 3.5, flexShrink: 0, cursor: "pointer",
            border: block.checked ? `1.5px solid ${ACCENT.primary}` : `1.5px solid ${TEXT.muted}`,
            background: block.checked ? ACCENT.primary : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s", userSelect: "none",
          }}
        >
          {block.checked && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5L4.2 7.2L8 3" stroke={BG.darkest} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <span ref={elRef} style={{
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
  const [expanded, setExpanded] = useState(() => {
    const saved = loadFromStorage();
    return saved?.expanded || { "Boojy": true };
  });
  const [activeNote, setActiveNote] = useState(() => {
    const saved = loadFromStorage();
    return (saved?.activeNote && saved.noteData?.[saved.activeNote]) ? saved.activeNote : "boojy-audio-ideas";
  });
  const [tabs, setTabs] = useState(() => {
    const saved = loadFromStorage();
    if (saved?.tabs) {
      const valid = saved.tabs.filter(id => saved.noteData?.[id]);
      if (valid.length > 0) return valid;
    }
    return ["shopping-list", "boojy-audio-ideas"];
  });
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [search, setSearch] = useState("");
  const [settings, setSettings] = useState(false);
  const [syncState, setSyncState] = useState("synced");
  const [editorFadeIn, setEditorFadeIn] = useState(false);
  const [noteData, setNoteData] = useState(() => {
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
      _blockId = maxId;
      return saved.noteData;
    }
    const clone = {};
    for (const [id, n] of Object.entries(NOTES)) {
      clone[id] = { ...n, content: { title: n.content.title, blocks: n.content.blocks.map(b => ({ ...b, id: genBlockId() })) } };
    }
    return clone;
  });
  const [slashMenu, setSlashMenu] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, type: "note"|"folder", id }
  const [renamingFolder, setRenamingFolder] = useState(null); // folder name being renamed

  // ─── Refs ───
  const isDragging = useRef(false);
  const blockRefs = useRef({});
  const editorRef = useRef(null);
  const titleRef = useRef(null);
  const focusBlockId = useRef(null);
  const focusCursorPos = useRef(null);
  const noteDataRef = useRef(noteData);
  noteDataRef.current = noteData;
  const syncGeneration = useRef(0); // bumped on undo/redo to force DOM resync
  const slashMenuRef = useRef(slashMenu);
  slashMenuRef.current = slashMenu;
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const historyTimer = useRef(null);
  const isUndoRedo = useRef(false);

  // ─── History wrappers ───
  const pushHistory = () => {
    undoStack.current.push(structuredClone(noteDataRef.current));
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
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
  };

  const redo = () => {
    if (redoStack.current.length === 0) return;
    undoStack.current.push(structuredClone(noteDataRef.current));
    isUndoRedo.current = true;
    syncGeneration.current++;
    setNoteData(redoStack.current.pop());
    isUndoRedo.current = false;
  };

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

  // Undo/Redo keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if (mod && e.key === "z" && e.shiftKey) { e.preventDefault(); redo(); }
      if (mod && e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Persist to localStorage — debounced 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ noteData, tabs, activeNote, expanded }));
      } catch (e) {
        console.warn("Failed to save to localStorage:", e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [noteData, tabs, activeNote, expanded]);

  // Focus management — runs after every render
  useEffect(() => {
    if (focusBlockId.current) {
      const el = blockRefs.current[focusBlockId.current];
      if (el) {
        placeCaret(el, focusCursorPos.current ?? 0);
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
  const knownPaths = new Set(collectPaths(FOLDER_TREE));

  // Also add any folders from noteData that aren't in FOLDER_TREE (dynamically created)
  for (const path of Object.keys(folderNoteMap)) {
    if (!knownPaths.has(path)) {
      // Insert as top-level folder
      const parts = path.split("/");
      knownPaths.add(path);
    }
  }

  const folderTree = buildTree(FOLDER_TREE);

  // ─── Block CRUD ───
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

  const flipCheck = (noteId, blockIndex) => {
    commitNoteData(prev => {
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

  // ─── Note CRUD ───
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
    setTimeout(() => titleRef.current?.focus(), 50);
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
  };

  // ─── Slash command execution ───
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

  // ─── Block input handler ───
  const handleBlockInput = (noteId, blockIndex) => {
    const blocks = noteDataRef.current[noteId].content.blocks;
    const el = blockRefs.current[blocks[blockIndex]?.id];
    if (!el) return;
    const text = el.innerText;
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
      el.innerText = beforeText;
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

    // Arrow up — only handle: move to title from first block
    if (e.key === "ArrowUp" && blockIndex === 0) {
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (rect.top - elRect.top < 5) {
          e.preventDefault();
          titleRef.current?.focus();
        }
      }
    }
  };

  // ─── Helper: find block from a DOM node ───
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

  // ─── Helper: place cursor inside a block element ───
  const placeCaret = (el, pos = 0) => {
    if (!el) return;
    try {
      const range = document.createRange();
      const sel = window.getSelection();
      if (pos === 0 || el.childNodes.length === 0) {
        range.setStart(el, 0);
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
        if (!placed) { range.selectNodeContents(el); range.collapse(false); sel.removeAllRanges(); sel.addRange(range); return; }
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}
  };

  // ─── Cross-block key handler ───
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

  // ─── Editor wrapper event handlers ───
  const handleEditorKeyDown = (e) => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
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
    if (!info) return;
    handleBlockKeyDown(activeNote, info.blockIndex, e);
  };

  const handleEditorInput = () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const info = getBlockFromNode(sel.anchorNode);
    if (!info) return;
    handleBlockInput(activeNote, info.blockIndex);
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

  // ─── Search filtering ───
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

  // ─── UI helpers ───
  const hBg = (el, c) => { el.style.background = c; };

  const syncDotStyle = () => {
    const base = {
      width: 19, height: 19, borderRadius: "50%",
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
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
            <img src="/boojy-notes-text-N.png" alt="" style={{ height: 23.5 }} draggable="false" />
            <button
              onClick={() => setSettings(!settings)}
              style={syncDotStyle()}
              onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.1)"}
              onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
              title={`Settings · Sync: ${syncState}`}
            >
              <img src="/boojy-notes-settings-circle.png" alt="" style={{ width: "100%", height: "100%", borderRadius: "50%" }} draggable="false" />
            </button>
            <img src="/boojy-notes.text-tes.png" alt="" style={{ height: 21 }} draggable="false" />
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
            <button onClick={() => setCollapsed(!collapsed)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 5, borderRadius: 5, display: "flex", alignItems: "center",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => hBg(e.currentTarget, BG.surface)}
              onMouseLeave={(e) => hBg(e.currentTarget, "transparent")}
              title={collapsed ? "Show sidebar" : "Hide sidebar"}
            >
              <SidebarToggleIcon open={!collapsed} />
            </button>
            <button onClick={undo} title="Undo (Ctrl+Z)" style={{ background: "none", border: "none", cursor: "pointer", padding: "5px 4px", borderRadius: 4, display: "flex", alignItems: "center" }}><UndoIcon /></button>
            <button onClick={redo} title="Redo (Ctrl+Shift+Z)" style={{ background: "none", border: "none", cursor: "pointer", padding: "5px 4px", borderRadius: 4, display: "flex", alignItems: "center" }}><RedoIcon /></button>
          </div>
        </div>

        {/* Right section — tabs + actions */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", height: "100%", overflow: "hidden" }}>
          {/* Tabs */}
          <div className="tab-scroll" style={{ display: "flex", alignItems: "stretch", flex: 1, overflow: "auto", height: "100%" }}>
            {tabs.flatMap((tId, i) => {
              const t = noteData[tId];
              if (!t) return [];
              const act = activeNote === tId;
              const prevAct = i > 0 && tabs[i - 1] === activeNote;
              const els = [];
              if (i > 0 && !act && !prevAct) {
                els.push(<div key={`div-${tId}`} style={{ width: 1, background: BG.divider, opacity: 0.25, alignSelf: "stretch", flexShrink: 0 }} />);
              }
              els.push(
                <button key={tId} onClick={() => setActiveNote(tId)}
                  style={{
                    background: act ? BG.standard : "transparent",
                    border: "none",
                    borderBottom: act ? `2px solid ${ACCENT.primary}` : "2px solid transparent",
                    borderImage: act ? `linear-gradient(90deg, transparent, ${ACCENT.primary}, transparent) 1` : "none",
                    cursor: "pointer", padding: "0 16px",
                    display: "flex", alignItems: "center", gap: 5,
                    color: act ? TEXT.primary : "#909090",
                    fontSize: 13.5, fontFamily: "inherit",
                    whiteSpace: "nowrap", transition: "background 0.15s, color 0.15s",
                    height: "100%",
                  }}
                  onMouseEnter={(e) => { if (!act) { hBg(e.currentTarget, BG.elevated); e.currentTarget.style.color = TEXT.secondary; } }}
                  onMouseLeave={(e) => { if (!act) { hBg(e.currentTarget, "transparent"); e.currentTarget.style.color = "#909090"; } }}
                >
                  <span>{t.title}</span>
                  <span onClick={(e) => closeTab(e, tId)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 16, height: 16, borderRadius: 4,
                      color: TEXT.muted, transition: "all 0.1s",
                      opacity: act ? 0.6 : 0.35,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = BG.surface; e.currentTarget.style.color = TEXT.primary; e.currentTarget.style.opacity = 1; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = TEXT.muted; e.currentTarget.style.opacity = act ? 0.6 : 0.35; }}
                  ><CloseIcon /></span>
                </button>
              );
              if (i === tabs.length - 1) {
                els.push(<div key="div-end" style={{ width: 1, background: BG.divider, opacity: 0.25, alignSelf: "stretch", flexShrink: 0 }} />);
              }
              return els;
            })}
          </div>

          {/* Word count */}
          {note && (
            <span style={{ fontSize: 12, color: TEXT.muted, flexShrink: 0, padding: "0 10px", whiteSpace: "nowrap" }}>
              {wordCount} words
            </span>
          )}

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: BG.divider, flexShrink: 0, margin: "0 4px" }} />

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 4, flexShrink: 0, padding: "0 10px 0 6px" }}>
            {[
              { icon: <NewNoteIcon />, title: "New note", onClick: () => createNote(null), accent: true },
              { icon: <NewFolderIcon />, title: "New folder", onClick: () => {} },
            ].map((btn, i) => (
              <button key={i} onClick={btn.onClick} style={{
                width: 30, height: 28, borderRadius: 6,
                background: btn.accent ? ACCENT.primary : BG.elevated,
                border: btn.accent ? `1px solid ${ACCENT.primary}` : `1px solid ${BG.divider}`,
                cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center",
                color: btn.accent ? BG.darkest : TEXT.muted, transition: "all 0.15s",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = btn.accent ? ACCENT.hover : BG.surface; e.currentTarget.style.borderColor = btn.accent ? ACCENT.hover : ACCENT.primary; e.currentTarget.style.color = btn.accent ? BG.darkest : ACCENT.primary; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = btn.accent ? ACCENT.primary : BG.elevated; e.currentTarget.style.borderColor = btn.accent ? ACCENT.primary : BG.divider; e.currentTarget.style.color = btn.accent ? BG.darkest : TEXT.muted; }}
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
                padding: "6px 10px", border: `1px solid ${BG.divider}`,
              }}>
                <input type="text" placeholder="Search..."
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  style={{
                    background: "none", border: "none", outline: "none",
                    color: TEXT.primary, fontSize: 13, width: "100%", fontFamily: "inherit",
                  }}
                />
                <SearchIcon />
              </div>
            </div>

            {/* File tree — recursive Finder-style */}
            <div style={{ flex: 1, overflow: "auto", padding: "2px 0" }}>
              {(() => {
                // Render a note row at given depth
                const renderNote = (nId, depth) => {
                  const n = noteData[nId]; if (!n) return null;
                  const act = activeNote === nId;
                  return (
                    <button key={nId} onClick={() => openNote(nId)} className="sidebar-note"
                      onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, type: "note", id: nId }); }}
                      style={{
                        width: "100%", border: "none", cursor: "pointer",
                        background: act ? FINDER.selectBg : "transparent",
                        borderRadius: act ? 5 : 0,
                        padding: `4px 10px 4px ${10 + depth * 20}px`,
                        display: "flex", alignItems: "center", gap: 5,
                        color: act ? TEXT.primary : TEXT.secondary,
                        fontSize: 13, fontFamily: "inherit",
                        fontWeight: act ? 500 : 400,
                        transition: "background 0.12s", textAlign: "left",
                      }}
                      onMouseEnter={(e) => { if (!act) hBg(e.currentTarget, BG.elevated); }}
                      onMouseLeave={(e) => { if (!act) hBg(e.currentTarget, "transparent"); }}
                    >
                      <FileIcon />
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
                          color: TEXT.secondary, fontSize: 13, fontWeight: 400, fontFamily: "inherit",
                          transition: "background 0.1s, color 0.1s", textAlign: "left",
                        }}
                        onMouseEnter={(e) => { hBg(e.currentTarget, BG.elevated); e.currentTarget.style.color = TEXT.primary; }}
                        onMouseLeave={(e) => { hBg(e.currentTarget, "transparent"); e.currentTarget.style.color = TEXT.secondary; }}
                      >
                        {hasChildren ? (isOpen ? <ChevronDown /> : <ChevronRight />) : <span style={{ width: 13, flexShrink: 0 }} />}
                        <FolderIcon open={isOpen} />
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
                              background: BG.darkest, border: `1px solid ${FINDER.folderBlue}`, borderRadius: 4,
                              color: TEXT.primary, fontSize: 12.5, fontFamily: "inherit", fontWeight: 500,
                              padding: "1px 4px", outline: "none", width: "100%",
                            }}
                          />
                        ) : (
                          <span style={{ fontWeight: 500 }}>{folder.name}</span>
                        )}
                      </button>
                      {isOpen && (
                        <>
                          {folder.children.map(child => renderFolder(child, depth + 1))}
                          {folder.notes.map(nId => renderNote(nId, depth + 1))}
                        </>
                      )}
                    </div>
                  );
                };

                return (
                  <>
                    {filteredTree.map(f => renderFolder(f, 0))}
                    {filteredTree.length > 0 && fNotes.length > 0 && <div style={{ height: 14 }} />}
                    {fNotes.map(nId => renderNote(nId, 0))}
                  </>
                );
              })()}
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: BG.editor, position: "relative" }}>
          <StarField mode={note ? "editor" : "empty"} key={note ? "editor" : "empty"} />
          {note ? (
            <div key={activeNote} style={{
              flex: 1, overflow: "auto",
              padding: "28px 56px 80px",
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
                    if (first) placeCaret(blockRefs.current[first.id], 0);
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

              {/* Blocks — single contentEditable wrapper for cross-block selection */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onKeyDown={handleEditorKeyDown}
                onInput={handleEditorInput}
                onPaste={handleEditorPaste}
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
                  />
                ))}
              </div>

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
              position: "relative", overflow: "hidden", zIndex: 1,
            }}>

              <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
                {/* Faded N●tes logo */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, marginBottom: 20, opacity: 0.12 }}>
                  <img src="/boojy-notes-text-N.png" alt="" style={{ height: 55, filter: "invert(1)" }} draggable="false" />
                  <img src="/boojy-notes-settings-circle.png" alt="" style={{ height: 40, position: "relative", top: 2 }} draggable="false" />
                  <img src="/boojy-notes.text-tes.png" alt="" style={{ height: 48, filter: "invert(1)" }} draggable="false" />
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

      {/* ═══ CONTEXT MENU OVERLAY ═══ */}
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
                  transition: "background 0.08s",
                }}
                onMouseEnter={(e) => hBg(e.currentTarget, BG.surface)}
                onMouseLeave={(e) => hBg(e.currentTarget, "transparent")}
              >{item.label}</button>
            ))}
          </div>
        </>
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
        .tab-scroll::-webkit-scrollbar { height: 3px; }
        .tab-scroll::-webkit-scrollbar-track { background: transparent; }
        .tab-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px; }
        .tab-scroll:hover::-webkit-scrollbar-thumb { background: ${BG.divider}; }
        input::placeholder { color: ${TEXT.muted}; }
        [contenteditable]:focus { outline: none; }
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
