# Current target

**Verify the single-active-note model in the running app, then merge PR #68
(`refactor/single-active-note`).**

The navigation simplification is implemented on the branch (5 commits: remove split/tab entry
points → single-active-note state + persistence migration → dead-component cleanup → migration
tests → docs). Unit, coverage (floors ratcheted to 47/43/45/45) and E2E gates are green.

## What to verify on `pnpm dev`

1. Open several notes in a row from the sidebar — each replaces the last; sidebar highlight follows.
2. Cmd-click a wikilink — opens that note full-width. Cmd+Shift+\ does nothing.
3. Delete the open note — clean empty draft appears (desktop).
4. Quit and relaunch — the note you were in comes back. (First launch after upgrade: if a split
   was persisted, you land on the note from its active pane; hidden tabs are gone by design.)
5. Drag a note from the sidebar onto the editor — it opens, no split zones.

## Next, once merged

- Judge remaining visual-direction decisions (neutral vs accent sidebar selection).
- Candidate follow-ups now that navigation is one string: **Quick Open**, **back/forward
  history**, **Recents** (`docs/BACKLOG.md`); Help re-entry point (HelpDropdown is parked with
  zero importers).
