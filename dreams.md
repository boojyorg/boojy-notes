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
- [x] **Manually walked through on `pnpm dev`** (2026-06-07) — starfield fade, keyboard
  block-move, and list-only indent all confirmed; also covered the day's dep-bump wave
  (vite-plugin-electron 1.x launch, lucide-react 1.x icon scan).

**Reliability wave (unreleased, PRs #37–41, merged 2026-06-11/12)** — data-safety
follow-through on the markdown-is-truth constraint:
- [x] **#37** reads never rewrite note files (third-party frontmatter survives; byte-identical
  regression tests) · **#38** crash-safe atomic writes (temp+rename; rename writes new before
  deleting old) · **#39** lossless round-trip for fences / list numbers / `![alt](url)` images
  (guardrail fixtures) · **#40** pending edits flush before window close + on blur (2 s cap) ·
  **#41** desktop cloud sync now opt-in per device (off by default; sign-out clears sync
  metadata). FEATURE_TRACKER sync entry updated in #41.
- [x] **Adversarial multi-agent review of the wave** (2026-06-12) — 10 skeptics + 3-verifier
  majority votes; 27 confirmed findings, 2 claims broken. Report:
  `docs/reviews/2026-06-12-reliability-wave-review.md`. Unfixed findings folded into
  `docs/BACKLOG.md` ("Data safety / vault-import hazards").
- [x] **Review must-fix branch** (`fix/reliability-review-p0s`) — index moved out of the vault
  to userData (P0; vault now stays `git diff`-clean on open), split-pane quit flush loses
  keystrokes (P0; `unflushedNotes` set), fsync before atomic rename (P1; power-loss zeroing),
  in-flight sync aborts on toggle-off (P1; sync epoch).
- [ ] **Pre-release walkthrough on `pnpm dev`** — after the review branch merges: (a) point the
  app at a *copy* of a Vault folder, `git status` stays clean after opening (now includes no
  index file); (b) type → instant Cmd+Q → relaunch, text survives — repeat in split-pane across
  both panes; (c) sync toggle defaults off; (d) does "Empty Trash" confirm on Electron?
  Then tag v0.5.0. ⚠️ Known import hazards remain on first *edit* (tilde fences, `:---` tables,
  indented content — see BACKLOG) — don't migrate Vault originals yet, only copies.

**Prior (unreleased):** `BoojyNotes.jsx` decomposition (standing-debt #1) — 5 hooks extracted
across 2 cycles, root **1,675 → ~1,400 lines**, all unit-tested. Further candidates: split-view
glue, ghost-note/draft effects, `ProfileTab`/`Sidebar`.
