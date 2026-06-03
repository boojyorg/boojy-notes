# DREAMS.md — Boojy Notes Active Target

> Live working memory: the Active Engineering Target only (this week's target). Read at the start of
> every session; tick `- [ ]` → `- [x]` as items resolve. Slow-changing rules live in `CLAUDE.md` +
> `.claude/rules/`; ordered intentions → `docs/ROADMAP.md`; unscheduled tasks → `docs/BACKLOG.md`;
> session history → `git log` + auto memory. This file is volatile state only — safe to wipe each
> milestone.

## 1. 🎯 Active Engineering Target

**Status:** **v0.4.0 shipped** (2026-05-29) — pushed to `master` (web auto-deploys to
`notes.boojy.org`); the `v0.4.0` tag built the desktop DMG/EXE. CI **green**.

**In flight (unreleased) — v0.5.0 "Markdown is the truth" milestone:**
- **Constraint adopted:** `docs/SPEC-markdown-source-of-truth.md` (a note *is* its markdown;
  blocks are a rendering; every block must round-trip losslessly). Bound from `CLAUDE.md`.
  Enforced by `tests/utils/markdown.test.js` (31 cases incl. documented intrinsic losses).
- **C2:** indent restricted to list types (`useKeyboardHandlers`) — closed a silent
  paragraph/heading-indent round-trip data-loss bug.
- **Part B:** starfield fades on first content (`StarField` opacity prop + `EditorArea`
  `noteHasContent` ref+state; live-DOM signal on first keystroke, blocks signal on open/empty).
- **C3:** drag-reorder *already existed* (`useBlockDrag`, hold-and-drag) — added the missing
  **keyboard reorder** `Cmd/Ctrl+Shift+↑/↓` via new `moveBlock` in `useBlockOperations`,
  threaded through `useEditorHandlers` → `useKeyboardHandlers`. Reorder round-trips cleanly
  (confirmed via the C1 test — blocksToMarkdown walks the array in order).
- **Gates:** typecheck clean, 634 unit tests + 5 E2E green, coverage gate passes, format clean.
- [ ] **Not yet manually walked through on `pnpm dev`** — spot-check the starfield fade (type →
  fade out; empty → fade in; focus-only keeps stars), keyboard block-move, and list-only indent.

**Prior (unreleased):** `BoojyNotes.jsx` decomposition (standing-debt #1) — 5 hooks extracted
across 2 cycles, root **1,675 → ~1,400 lines**, all unit-tested. Further candidates: split-view
glue, ghost-note/draft effects, `ProfileTab`/`Sidebar`.
