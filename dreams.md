# Current target

**Judge the minimal-chrome + light-theme direction in the running app before deciding anything else.**

Everything below is uncommitted on `master`. Run `pnpm dev:web` (or the desktop build) and look at it
in light mode.

## What to judge

1. **Does the dramatically reduced chrome feel right?** No top bar, no visible tabs, two pinned
   controls. If it feels wrong, it's cheaper to restore the strip now than after tabs are deleted.
2. **Light palette** — sidebar `#F9F9F9` against editor `#FFFFFF` with no border between them, and
   whether `#2A737D` still reads as the same cyan identity as the dark theme's `#A4CACE`.
3. **Sidebar selection** — still accent-tinted rather than neutral. The one deliberate divergence
   from Picito's grammar; one-line change either way.
4. **Collapsed state** — the left edge is now genuinely empty (drag handle gated on `!collapsed`).
   Only the toggle gets the sidebar back; no hover-peek was built.

## Known costs of the current state (all documented in `.claude/rules/ui-chrome-and-theme.md`)

- No way to close a note (the `×` was on the tab; no Cmd+W binding)
- Drag-to-tab-bar interactions silently do nothing
- Help is unreachable
- Split view works but has no per-pane UI

## Next, once judged

If the direction holds: neutral-vs-accent selection, then Quick Open + back/forward + Recents +
close-note **before** any tab code is deleted. If it doesn't: `TopBar.jsx` back to
`<TopBarDesktop {...props} />` is the whole revert.
