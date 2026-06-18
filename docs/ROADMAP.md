# Boojy Notes — Roadmap

Ordered intentions. Per-feature **status** → `FEATURE_TRACKER.md`; unscheduled tasks → `BACKLOG.md`;
this-week's target → `dreams.md`. Detailed priorities/strategy live in the gitignored
`docs/private/ROADMAP.md`.

## Shipped

v0.1.x → **v0.5.0** (terminal removed, top bar simplified, web delete-confirm, bug/a11y batch,
"Markdown is the truth" constraint + reliability wave, opt-in desktop sync, and the adversarial
review P0 fixes). Web live at `notes.boojy.org`; desktop DMG/EXE built per `v*` tag. Per-feature
status in `FEATURE_TRACKER.md`.

## Now / Next

1. **Polish pass — post v0.5.0** (in flight). Desktop-only focus: the app is stable enough to
   dogfood daily; work is design-led refinement rather than new features. Active threads: Notes logo
   (shipped, PR #48), settings improvements, spacing/motion/typography polish, and empty-state
   details. Sync and sign-in remain intentionally hidden on desktop (PR #49) until sync is stable.

## Later

Refactors (BoojyNotes.jsx decomposition tail, ProfileTab/Sidebar extraction), the Tier-3 a11y
cluster, and QoL bugs → `BACKLOG.md`. Feature ideas (not yet scheduled) → `FUTURE-IDEAS.md`.
