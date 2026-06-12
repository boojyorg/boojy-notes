# Boojy Notes — Roadmap

Ordered intentions. Per-feature **status** → `FEATURE_TRACKER.md`; unscheduled tasks → `BACKLOG.md`;
this-week's target → `dreams.md`. Detailed priorities/strategy live in the gitignored
`docs/private/ROADMAP.md`.

## Shipped

v0.1.x → **v0.4.0** (terminal removed, top bar simplified, web delete-confirm, bug/a11y batch).
Web live at `notes.boojy.org`; desktop DMG/EXE built per `v*` tag. Per-feature status in
`FEATURE_TRACKER.md`.

## Now / Next

1. **v0.5.0 — "Markdown is the truth"** (in flight). The lossless block↔markdown round-trip
   constraint (`docs/SPEC-markdown-source-of-truth.md`), list-only indent, keyboard block reorder,
   starfield-fades-on-content — plus the reliability wave (PRs #37–41: read-only reads, atomic
   writes, round-trip fixes, quit-flush, opt-in desktop sync) and the fixes from its adversarial
   review (`docs/reviews/2026-06-12-reliability-wave-review.md`: vault-clean index, split-pane
   flush, fsync, sync abort). Needs a fresh `pnpm dev` walkthrough before release — see
   `dreams.md`; remaining review findings → `BACKLOG.md`.

## Later

Refactors (BoojyNotes.jsx decomposition tail, ProfileTab/Sidebar extraction), the Tier-3 a11y
cluster, and QoL bugs → `BACKLOG.md`. Feature ideas (not yet scheduled) → `FUTURE-IDEAS.md`.
