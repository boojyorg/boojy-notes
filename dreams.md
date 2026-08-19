# Current target

**Verify and merge two stacked branches: PR #68 (`refactor/single-active-note`), then the
subtraction pass (`refactor/subtraction-pass`, branched on top of it — local only, no PR yet).**

The navigation simplification is implemented on the PR #68 branch (5 commits: remove split/tab
entry points → single-active-note state + persistence migration → dead-component cleanup →
migration tests → docs). The subtraction pass adds 4 code commits + this docs commit: single-pane
Settings (Profile/Editor/UI-Scale-row gone, sign-in surfaces unmounted), folder chevrons removed,
Trash → wordmark menu → Recently Deleted modal, shared viewport clamp for the ···/slash menus.
Unit, coverage and E2E gates are green on both.

## What to verify on `pnpm dev`

Single-active-note (PR #68):

1. Open several notes in a row from the sidebar — each replaces the last; sidebar highlight follows.
2. Cmd-click a wikilink — opens that note full-width. Cmd+Shift+\ does nothing.
3. Delete the open note — clean empty draft appears (desktop).
4. Quit and relaunch — the note you were in comes back. (First launch after upgrade: if a split
   was persisted, you land on the note from its active pane; hidden tabs are gone by design.)
5. Drag a note from the sidebar onto the editor — it opens, no split zones.

Subtraction pass (`refactor/subtraction-pass`):

6. Click the wordmark — small menu (Recently Deleted… / Settings… / About), not Settings directly.
7. Settings: one small pane — Appearance, Storage, Updates, quiet version line. No Profile, no
   sign-in, no spell-check/language, no UI Scale row (Cmd+Plus/Minus/0 still zoom).
8. Folders: no chevrons; whole row toggles; note titles still line up under folder names.
9. Delete a note, then wordmark → Recently Deleted — restore it; Delete All still confirms.
10. Open the ··· menu top-right — it stays fully on-screen; type `/` on the last line of a tall
    note — the slash menu flips above the line instead of running off the bottom.

## Next, once merged

- Judge the two live experiments: chevron-less folders (hover-chevron is the fallback if
  expansion proves undiscoverable) and the wordmark menu's prominence.
- Judge remaining visual-direction decisions (neutral vs accent sidebar selection).
- Candidate follow-ups now that navigation is one string: **Quick Open**, **back/forward
  history**, **Recents** (`docs/BACKLOG.md`); Help re-entry point (HelpDropdown is parked with
  zero importers).
