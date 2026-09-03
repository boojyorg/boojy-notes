# Current target

**None active.** The correctness/simplification pass merged as PR #92 on 2026-09-03: eight
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
