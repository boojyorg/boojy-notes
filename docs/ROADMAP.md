# Boojy Notes — Roadmap

Ordered intentions. Per-feature **status** → `FEATURE_TRACKER.md`; unscheduled tasks → `BACKLOG.md`;
this-week's target → `dreams.md`. Detailed priorities/strategy live in the gitignored
`docs/private/ROADMAP.md`.

## Shipped

v0.1.x → **v0.5.0** (terminal removed, top bar simplified, web delete-confirm, bug/a11y batch,
"Markdown is the truth" constraint + reliability wave, opt-in desktop sync — since disabled
outright for the local-only dogfood build (PR #49) — and the adversarial review P0 fixes). Web live at `notes.boojy.org`; desktop DMG/EXE built per `v*` tag. Per-feature
status in `FEATURE_TRACKER.md`.

## Now / Next

1. **Polish pass — post v0.5.0** (in flight). Desktop-only focus: the app is stable enough to
   dogfood daily; work is design-led refinement rather than new features. Active threads: Notes logo
   (shipped, PR #48), settings improvements, spacing/motion/typography polish, and empty-state
   details. Sync and sign-in are unmounted entirely (PR #49, then the 2026-08-18 subtraction
   pass removed the whole Profile/sign-in surface) until sync is stable.

2. **Visual direction reset — light-first + minimal chrome** (uncommitted, awaiting judgement).
   Picito is the family reference for neutral surfaces/interaction grammar; Boojy keeps its cyan.
   Landed so far: DAY replaced with a neutral light palette (accent `#2A737D`); Lucide icon set;
   desktop top bar removed in favour of two pinned controls (`EditorChrome`);
   **single-active-note model** (2026-08-18) — tabs and split view deleted outright, opening a note
   replaces the current one, old persisted state migrates deterministically.
   Conventions + live gotchas → `.claude/rules/ui-chrome-and-theme.md`.
   **Open decisions, in order:** (a) does the reduced chrome feel right at all; (b) neutral vs
   accent-tinted sidebar selection; (c) ~~whether tabs come back~~ — resolved: they don't
   (matches `PHILOSOPHY.md`); Quick Open / back-forward / Recents are follow-up candidates in
   `BACKLOG.md`, no longer blockers; (d) title-as-filename, gated on
   `SPEC-markdown-source-of-truth.md`.

## Later

Refactors (BoojyNotes.jsx decomposition tail, Sidebar extraction), the Tier-3 a11y
cluster, and QoL bugs → `BACKLOG.md`. Feature ideas (not yet scheduled) → `BACKLOG.md`
(Feature ideas section).
