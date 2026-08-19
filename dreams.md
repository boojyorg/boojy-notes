# Current target

**Go back to daily-driving the build and judging the live experiments. The v0.6 simplification
and editor-correctness work has landed; CI is no longer something that needs babysitting.**

- [x] Review and merge PR #75: Electron uses the OS Trash, the private Recently Deleted system
  and wordmark dropdown are removed, the wordmark opens Settings directly, and Light is only the
  no-saved-preference theme fallback.
- [x] Make checkbox ticks and strikethrough repaint immediately instead of waiting for Enter.
- [x] Keep slash-command selection on Heading 1 until the user presses an arrow key or actually
  moves the pointer over another command.
- [x] Put the two editor fixes on top of current `master`, run the normal gates, and open the
  focused editor-correctness PR — **PR #76, merged 2026-08-19**.
- [x] Review and merge **PR #77**: `timeout-minutes: 30` on the release matrix jobs, the last
  workflow with no cap — **merged 2026-08-19**. Small, CI-only, nothing user-facing.

## Next

- Judge the remaining live experiments in daily use: chevron-less folders (hover-chevron is the
  fallback) and neutral vs accent sidebar selection.
- Product follow-ups: **Quick Open**, **back/forward history**, and the **vault-import P1**
  (tilde-fence blocks destroyed on first edit) — all in `docs/BACKLOG.md`.

## Backlog (unscheduled)

- `playwright.config.js` sets `webServer.command` to `npm run build && npm run preview`, so the
  E2E step rebuilds the app a second time — CI already built it one step earlier — and shells out
  to `npm` in a pnpm repo (source of the `Unknown project config "node-linker"` warning). Noticed
  2026-08-19 while auditing the E2E suite; not urgent now that the whole job runs in 1m33s.
