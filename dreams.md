# Current target

**Truthful-repo cleanup, as three small PRs (from the 2026-08-19 read-only audit), then back to
product work.** The single-active-note stack merged 2026-08-19 (PR #68, PR #69) after a passed
manual walkthrough.

1. **PR 1 — documentation accuracy** (#70, merged 2026-08-19): README rewritten local-first,
   AGENTS.md drift fixed + single-active-note documented, missing CHANGELOG entry added,
   PHILOSOPHY's stale "code may exist" line fixed, ROADMAP/BACKLOG factual cleanup, historical
   banner on the 2026-06-12 review.
2. **PR 2 — verified dead-code sweep** (this branch): zero-importer files deleted (split/pane
   leftovers, `colors.js`, barrels, orphaned type modules, dead test mocks, stale mock fields,
   unused icon exports, unused `useNoteStats` fields, Flutter artefacts, `TESTING.md` folded
   into AGENTS.md). The five parked UI files (`ProfileTab`, `HelpDropdown`, `OnboardingToast`,
   `PersistenceWarning`, `useWebNags`) deleted too — git is the parking lot; nothing in them
   was hard to reconstruct (the auth/sync logic lives on in `useAuth`/`useSync`).
3. **PR 3 — TypeScript step 0**: make `src/types/global.d.ts` truthfully match the preload API;
   consolidate the two type homes. Then adopt new-files-in-TS + convert-on-touch; no big-bang
   conversion.

## Next, after the cleanup

- Judge the live experiments in daily use: chevron-less folders (hover-chevron is the fallback),
  wordmark-menu prominence, neutral vs accent sidebar selection.
- Product follow-ups: **Quick Open**, **back/forward history**, and the **vault-import P1**
  (tilde-fence blocks destroyed on first edit) — all in `docs/BACKLOG.md`.
