# Current target

**Beta finishing pass (desktop-only).** Shape settled 2026-09-03 — see agent memory
`boojy-notes-beta-shape` and the product triangle (Apple Notes simplicity · Obsidian ownership ·
Notion editing fluidity). Worked one item at a time, each judged live, never the whole list at
once.

- [x] **Block drag → hover gutter handle** — MERGED as PR #93 on 2026-09-03 (branch deleted). Judged
  live against a polished hold-to-drag prototype; handle won on zone separation (text =
  write/select, gutter = move). Hold model + tooltip deleted; sidebar drop-over-editor removed.
  Behavioural baseline accepted; exact styling refines from daily use, not further theory.
  - [x] **Drag feel refinement** — MERGED as PR #94 on 2026-09-03 (branch deleted) — four-way live
    comparison against Notion's handle grammar; "boojy-quiet" won: filled grip dots, no hover
    surface, 35% translucent ghost, commit-on-drop with a 3px accent-40% insertion marker that
    always sits above the grabbed block for the no-op position. Live reorder deleted.
- [ ] Tables: finished-feeling basic interaction (visible cells, caret in first cell, Tab, whole-
  table delete) — NOT started; Tyr gives the go.
- [ ] Real empty folders (eager mkdir) + Move to folder… — needs a filesystem/data-safety plan
  first, presented before any code.
- [ ] Hints/onboarding removal, copy pass (Quote/Checklist), font-size preference removal,
  preservation blockers (indented fences, tilde-fence interaction, image width clamp, indented
  content whitespace, trailing-space trim on list lines), visual polish, Windows smoke + release.

---

**Previously:** The correctness/simplification pass merged as PR #92 on 2026-09-03: eight
correctness fixes (stale-closure editor handlers, tag click, attachment size guard, crash backup,
onboarding copy, font-size persistence), then pure deletion of retired-feature residue, then two
test-first consolidations (sidebar tag chips / mobile rows, slash-command block insertion). Net
−283 source lines, gates green. The earlier "shared grammar for menus/buttons" and "decompose
large components" items were deliberately closed rather than pursued — no further refactor
targets are being sought.

## Next

- Nothing until friction is observed in daily use (standing instruction).
- When a release is wanted: the desktop daily-driver build does not pick up master on its own —
  rebuild or cut a `v*` tag; `CHANGELOG.md` Unreleased already holds the notes.
- Unresolved on purpose: desktop empty folders live only in memory (see `docs/BACKLOG.md`).
