# Boojy Notes — App Review & Comparison

**Date:** 2026-03-08
**Reviewer:** Claude (AI) + Developer self-assessment
**Version:** Pre-release (feature/electron branch)

---

## Rating: 7.5 / 10

Developer self-assessment: 7/10 — needs more testing, has a few bugs, needs to feel nice to use.

---

## 3 Good Things

### 1. Markdown-native + block editing hybrid
Best of both worlds. Notion-style block manipulation but notes are plain `.md` files, fully Obsidian-compatible. Most apps pick one or the other; Boojy does both and the round-trip actually works (158 tests proving it).

### 2. Integrated terminal
No other note-taking app ships a multi-tab terminal with a warm PTY pool for instant startup. A genuine differentiator that makes Boojy feel like a tool for developers, not just another notes app.

### 3. Feature depth without bloat
Wikilinks with autocomplete, backlinks panel, full-text fuzzy search, callouts, tables with CSV paste, find & replace, PDF/DOCX export, cloud sync with realtime broadcast, drag-and-drop everywhere, spell check in 8 languages — all actually built, not stubbed out.

---

## 3 Suggestions

### 1. Light theme / theme system
Currently dark-only with an accent color picker. Every competitor has light mode at minimum. Obsidian and Notion have full theme systems. Probably the single highest-impact UX addition for broadening appeal.

### 2. Mobile story
Notion, Apple Notes, Google Keep all shine on mobile. Even Obsidian has a mobile app. The planned Flutter migration would solve this, but until then it's desktop/web only, which limits daily-driver potential.

### 3. Onboarding / discoverability
The feature set is deep but there's no way for a new user to discover slash commands, `[[` wikilinks, `==highlight==`, the terminal, keyboard shortcuts, etc. A welcome note, command palette, or tooltip hints would go a long way. Obsidian's command palette (`Cmd+P`) is a big part of why power users love it.

---

## Competitive Comparison

| App | Rating | Strengths over Boojy | Boojy's edge |
|-----|--------|----------------------|--------------|
| **Notion** | 9/10 | Databases, collaboration, mobile, polish | Plain markdown files, no vendor lock-in, terminal |
| **Obsidian** | 8.5/10 | Plugin ecosystem, graph view, mobile, community | Integrated terminal, block editing UX, simpler setup |
| **Apple Notes** | 7/10 | System integration, iCloud, mobile | Markdown, wikilinks, backlinks, code blocks, terminal |
| **Google Keep** | 6/10 | Mobile, simplicity, reminders | Everything — Keep is a different category entirely |

---

## Positioning

Boojy sits in an interesting niche: **Obsidian's philosophy** (local markdown, wikilinks, backlinks) with **Notion's editing UX** (block-based, slash commands, floating toolbar) and a **developer-first twist** (integrated terminal, code blocks).

The gap from 7.5 to 8.5+ is mostly about **polish, testing, and platform reach** — not missing features. The bones are strong.

---

## Full Feature List

### Core Editing
- Block-based editor: paragraphs, headings (H1-H3), bullet lists, numbered lists, checkboxes
- Code blocks (9 languages: JS, TS, Python, HTML, CSS, JSON, Bash, SQL, Plain)
- Tables with alignment (left/center/right), CSV/TSV paste support
- Callouts (11 types: note, info, tip, warning, danger, success, question, quote, example, bug, abstract)
- Images (resizable width, lightbox view, alt text)
- Blockquotes, dividers, frontmatter, embeds
- Block drag-reordering with auto-scroll and undo

### Inline Formatting
- Bold, Italic, Code, Strikethrough, Highlight
- Markdown links, bare URL auto-detect, smart paste (URL over selection)
- Wikilinks with broken-link detection
- Inline tags rendered in accent color
- Floating toolbar above selection

### Keyboard & Interaction
- Slash commands (13 command types)
- Markdown shortcuts auto-convert to blocks
- 20+ keyboard shortcuts (formatting, navigation, terminal, search)
- Arrow key navigation between blocks
- Tab/Shift+Tab in code blocks, tables, lists

### Search & Navigation
- Full-text fuzzy search with typo tolerance and scored matching
- Results grouped by folder with highlighted snippets
- Keyboard navigation through results
- Multi-select notes in sidebar (Cmd+Click, Shift+Click)
- Wikilink autocomplete menu with fuzzy filter and create-note fallback

### Backlinks
- Backlinks panel showing all notes linking to current note via wikilinks
- Click to navigate directly to source note

### Sync & Cloud
- Supabase authentication (Email, Google, Apple)
- Cloud sync via Supabase + Cloudflare R2
- Realtime Broadcast for near-instant cross-device sync
- Debounced sync (2s), 30s polling, sync on tab focus

### Desktop (Electron)
- Local filesystem storage (`~/Documents/Boojy/Notes/`)
- File watchers for external change detection
- Vault management with native folder picker
- Integrated multi-tab terminal (xterm.js + node-pty, warm PTY pool)
- Export to PDF and DOCX
- Import from Markdown, HTML, and folders
- Native spell check (8 languages)

### UI/UX
- Folder tree sidebar with drag-to-reorder
- Trash with 30-day auto-purge and restore
- Per-note seeded star field backgrounds
- Settings modal (Appearance, Sync, Account)
- Tab management for multiple open notes
- Word count status bar with reading time
- Context menus for notes, folders, links, images
- Find & Replace (Cmd+F, CSS Custom Highlight API)

---

## Tech Stack

- **Frontend:** React 19, Vite 6
- **Desktop:** Electron 40, Chokidar 5, node-pty, xterm.js
- **Cloud:** Supabase (auth + DB), Cloudflare R2 (storage)
- **Testing:** Vitest (158 tests), ESLint 9, Prettier, TypeScript 5
- **Codebase:** ~17,700 lines JS/JSX, 27 components, 15 hooks, 6 utils
