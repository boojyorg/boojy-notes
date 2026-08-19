# Current target

**Land the current v0.6 simplification and editor-correctness work, then return to product
navigation.**

- [ ] Review and merge PR #75: Electron uses the OS Trash, the private Recently Deleted system
  and wordmark dropdown are removed, the wordmark opens Settings directly, and Light is only the
  no-saved-preference theme fallback.
- [x] Make checkbox ticks and strikethrough repaint immediately instead of waiting for Enter.
- [x] Keep slash-command selection on Heading 1 until the user presses an arrow key or actually
  moves the pointer over another command.
- [ ] After PR #75 lands, put the two editor fixes on top of current `master`, run the normal
  gates, and open the focused editor-correctness PR.

## Next

- Judge the remaining live experiments in daily use: chevron-less folders (hover-chevron is the
  fallback) and neutral vs accent sidebar selection.
- Product follow-ups: **Quick Open**, **back/forward history**, and the **vault-import P1**
  (tilde-fence blocks destroyed on first edit) — all in `docs/BACKLOG.md`.
