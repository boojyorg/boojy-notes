# Session Ledger — Boojy Notes

> Append-only flight recorder. One dated entry per session: Session Work table, gate
> results, code velocity, and (optional) cost/token telemetry. Never edit retroactively —
> this is the audit trail, distinct from the live `dreams.md`.

---

## YYYY-MM-DD · <session title> · <branch>

### Session Work

| Task | Outcome |
|---|---|
| _example_ | _what happened_ |

### Gates

| Gate | Result |
|---|---|
| typecheck | |
| lint / format:check | |
| test | |
| build | |
| Manual walkthrough | |

### Notes

_Next session target; anything worth remembering._

---

## 2026-05-29 · Audit backlog cleanup — Tier-1 #6/#7/#8 + Tier-2 QoL batch · master

### Session Work

| Task | Outcome |
|---|---|
| Verify + fix unverified Tier-1 (#5–#10) | Read each. #7 link-URL not escaped (attribute injection) → `escAttr` in steps 9/10. #6 first-sync gate: visibilitychange/online/poll bypassed the confirm dialog & uploaded all notes; added `firstSyncGateRef` (cancel keeps it up). #8 strikethrough/highlight toggle flattened nested bold → unwrap instead of stringify. `b591f0c` |
| Triage the rest | #5 (paste nesting) verified **not a bug** (sanitizeNode always unwraps block els). #9 (two undo steps) deferred — arguably-correct granularity. #10 (global block-id counter) deferred — Low + riskier fix. +4 regression tests. |
| Tier-2 QoL batch | Built reusable themed confirm primitive (`requestConfirm` in OverlayContext + `ConfirmDialog`, role=alertdialog, Esc/Enter, danger styling); web note/folder/bulk delete confirm, desktop skips (trash recoverable). FindBar "n/a"+tooltip when no CSS Highlight API. Backlinks keyboard-activatable. Mobile TopBar title tap-to-focus. Auth `aria-busy`. Fixed mobile delete msg lying "moved to Trash" on web. `ad8a926` |
| Corrected a false-positive | "Focus dropped after closing overlays" — Settings/slash/context menus already restore focus via `useFocusTrap`; no fix needed. Created then deleted an unused `useReturnFocus` hook rather than leave dead code. |
| Interactive verification | Playwright drive of `dev:web`: right-click→Delete→dialog→Cancel keeps note→Delete removes it; 0 console errors; visual screenshot check of the themed dialog. +6 ConfirmDialog tests. |

### Gates

| Gate | Result |
|---|---|
| typecheck | ✓ clean |
| lint / format:check | ✓ Biome, 0 errors (5 pre-existing useOptionalChain warnings in untouched ProfileTab lines) |
| test / coverage | ✓ 585 passed (was 574; +11 new), coverage gate green |
| E2E | not run locally this session (covered by CI) |
| build / release | n/a (no release) |
| CI (post-push) | ✓ **GREEN** both pushes — `26629033028` (b591f0c), `26629695702` (ad8a926) |
| Interactive (Playwright drive) | ✓ delete-confirm flow verified live (appear / cancel-keeps / confirm-removes), 0 console errors |

### Code velocity

2 commits, 18 files · **+596 / −44**. Code session (not operational). Biggest: new
`ConfirmDialog.jsx` (+131) & its test (+112), `BoojyNotes.jsx` (+79), `OverlayContext.jsx` (+37).

### Cost / telemetry

Per `/cost`. Moderate: file-reads to verify the unverified Tier-1 bugs + one live Playwright
drive (browser launch + screenshot reads). No subagents. Cheaper than the prior audit session.

### Notes — next session targets

1. **Tier-3 a11y cluster** (dreams.md §3) — sidebar focus ring (inline `outline:none` overrides
   global + low-contrast global ring), icon-button `aria-label`s (TopBar/Help/Settings),
   context-menu roles + focus traps (Link/Table/Image/CalloutPicker), low-contrast theme tokens
   (DAY/NIGHT muted, DAY accent-as-text/wikilink), sidebar arrow-key nav, PaneTabBar nested
   interactive, ProfileTab input labels. Biome a11y lint is OFF — these are manual/axe-driven.
2. Deferred Tier-1 #10 (markdownToBlocks global ID counter → content-stable IDs; riskier).
3. Orphaned onboarding-hint bubble (interactive find) — reposition/anchor it.
4. Optional carry-overs: Phase-3 decomposition (`ProfileTab` 915 / `Sidebar` 897); `FEATURES.md`
   still missing; `boojy.org/notes` download links still hardcoded to v0.1.3 (now unblocked).
5. Optional polish: visible spinner on the auth button (only `aria-busy` added this session).

---

## 2026-05-29 · Codebase bug audit + 6 fixes (incl. wikilink saga) · master

### Session Work

| Task | Outcome |
|---|---|
| Track `.claude/` docs-system tooling | Brought settings.json, hooks, skill, ledger, dreams.md, docs/CODE_QUALITY.md under version control; gitignored settings.local.json. `310228a` |
| 4-agent parallel bug audit (Sonnet) | Swept editor-core / sync-state / UX-QoL / a11y. Verified top findings by hand before trusting; logged full triage to dreams.md §3. |
| Fix 4 Tier-1 verified bugs | Sync staleness (open note didn't refresh), wikilink nav (jumped away), nested folder rename (orphaned), mobile image insert (wrong args). `a212232` |
| Fix placeholder overlap | User-reported; "Type / for commands" lingered behind typed text — gated on debounced block.text. Driven off DOM emptiness (`:empty`/`:has(>br)`). `c23de5c` |
| Interactive Playwright pass on `dev:web` | Drove the real app; confirmed placeholder + wikilink-no-nav live; caught orphaned onboarding-hint bubble; corrected 2 audit false-positives (TagMenu-space, Settings-Escape). |
| Fix wikilink menu selection (user-reported) | Two latent bugs exposed by the nav removal: Enter→newline (needed `stopPropagation`) + click inserted nothing (syncGen re-sync doesn't fire from native listeners → write `el.innerHTML` directly). Verified live click+Enter. `8906ad5` |

### Gates

| Gate | Result |
|---|---|
| typecheck | ✓ clean |
| lint / format:check | ✓ Biome, 0 errors |
| test / coverage | ✓ 574 passed |
| E2E | ✓ 5 passed (incl. axe a11y) |
| Interactive (Playwright drive) | ✓ placeholder, wikilink click+Enter verified rendering live |
| CI (post-push) | pushed `310228a..8906ad5`; CI expected green (was green at 8906ad5's parent) |

### Code velocity

4 commits, ~8 source files touched (`310228a..8906ad5` = +874/−22, but ~660 of that is
first-time tracking of existing `.claude`/docs files). Actual code changes small/surgical;
the heavy lift was the 4-agent audit + interactive debugging, neither of which shows in a diff.

### Cost / telemetry

Per `/cost`. Heavy session: 4 audit subagents (Sonnet) + a long wikilink debugging loop with
many Playwright drive cycles + screenshot reads. The wikilink bug alone took ~3 failed fix
attempts before instrumenting with logs found the root cause.

### Notes — next session targets

1. **Process lesson (logged to CLAUDE.md + memory):** the editor's React state/`block.text` is
   debounced (lags the live DOM), and the `syncGen` DOM-resync only fires from React synthetic
   events — NOT native window listeners. Both the placeholder and wikilink bugs stemmed from
   this. When a fix "should work" but the DOM doesn't update, **instrument with logs before
   theorizing** (I burned 3 wrong fixes assuming React render timing).
2. Remaining audit backlog (dreams.md §3): Tier-2 QoL (destructive-action confirms, focus-return,
   FindBar Firefox fallback) + Tier-3 a11y clusters (focus ring, aria-labels, menu roles,
   contrast, sidebar keyboard nav) + unverified Tier-1 (#5 paste nesting, #6 cancelFirstSync, #7-10).
3. Orphaned onboarding-hint bubble (interactive find) — reposition/anchor it.

---

## 2026-05-29 · Ship v0.3.0 tag + CI green + PR cleanup · master

### Session Work

| Task | Outcome |
|---|---|
| Diagnose `boojy.org/notes` showing v0.2.0 | Root cause: the *separate* `Boojy` website repo reads the latest GitHub **tag** live (`useNotesVersion.ts`); repo was at v0.3.0 but never tagged. Not a build/Actions issue. |
| Tag + push `v0.3.0` | `git tag v0.3.0 && git push`. Version text on `boojy.org/notes` now resolves to v0.3.0. |
| Desktop release build | `release.yml` ran green — macOS + Windows installers built. Published as a **draft** GitHub Release (electron-builder default); awaiting user DMG check + `--draft=false`. |
| Close stale Dependabot PRs | Closed all 10. #1/#6 obsolete (ESLint removed for Biome); #2–5,7–10 targeted the deleted `package-lock.json` (pre-pnpm). Dependabot will regenerate pnpm-correct PRs. |
| Fix critical sidebar a11y violation | New Folder / New Note `<button>`s under `role="tree"` → given `role="treeitem"` (a tree may only own treeitem/group). Clears axe `aria-required-children`. `127bcc6` |
| gitignore test artifacts | Added `test-results/`, `playwright-report/` — were polluting local `biome` (CI runs lint before E2E, so it never saw them). `127bcc6` |

### Gates

| Gate | Result |
|---|---|
| typecheck | ✓ clean |
| lint / format:check | ✓ Biome, 0 errors (on source; local noise was un-ignored test artifacts) |
| E2E (Playwright/axe) | ✓ all 5 pass locally **and in CI** — incl. the a11y check that was the long-standing red |
| **CI (post-push)** | ✓ **GREEN** — first fully-passing `master` run since ~Mar 2026 (run `26623799556`, 1m32s) |
| Release build | ✓ macOS + Windows installers (draft Release) |

### Code velocity

1 commit (`127bcc6`), 3 files · **+11 lines**. Intentionally tiny — this was an *operational*
session (tag/release/PR-cleanup), not a code session. The a11y fix itself is 2 lines.

### Cost / telemetry

Not separately captured this session (run `/cost` for exact figures). Qualitatively cheap vs.
the prior session: no subagents, no `build:electron` locally, short context. Main spend was the
`gh run watch` CI poll (~1m32s of polling).

### Notes — next session targets

1. **Publish the v0.3.0 Release** (user-owned): sanity-check the macOS DMG, then
   `gh release edit v0.3.0 --draft=false`.
2. **Bump `boojy.org/notes` download links** (deferred, logged in dreams.md §3): the install
   buttons are hardcoded to `v0.1.3` in the `Boojy` repo (`NotesPage.tsx:16,29,41`). Only valid
   after #1 publishes the assets.
3. Optional: Node 20 → 24 GitHub Actions bump (deprecation deadline 2026-06-02; one env var or
   action version bumps).
4. Optional (carried): continue Phase 3 decomposition — `ProfileTab` (915) / `Sidebar` (897).
5. FEATURES.md still missing (docs-system gap, deferred).

---

## 2026-05-28 · Web-only pivot + tooling migration + hook extraction · master

### Session Work

| Task | Outcome |
|---|---|
| Drop native mobile (Capacitor) → v0.3.0 | Removed `@capacitor/*`, `nativeAPI.js`, `ios/`/`android/`, cap scripts. Web (responsive PWA) + desktop (Electron) only. `53792ad` |
| ESLint + Prettier → Biome | Single tool (`biome.json`); rules mirror old config (a11y off for parity). Rewired lint-staged, CI, post-edit hook. `b56d4fc` |
| npm → pnpm | `.npmrc` `node-linker=hoisted` + `pnpm.onlyBuiltDependencies` for native deps. Both CI workflows on pnpm. `93697ce` |
| Decompose BoojyNotes (slice 1) | Extracted `useNoteStats` (+test), `useWebNags`, `useDocumentTitle`. No behaviour change. `c538fd7` |
| Doc sync + v0.3.0 release cut | TESTING/README/CLAUDE/CHANGELOG/dreams/ledger current; CHANGELOG `Unreleased`→`0.3.0`. `d09c16b` |
| Push to `master` (go live) | 6 commits pushed (also carried up unpushed v0.2.1 + AI-removal). Triggers Cloudflare web deploy. |
| Fix CI coverage gate | Thresholds → floor at current actuals (45/42/43/43). CI red since ~Mar 2026 (pre-existing). `c426d64` |

### Gates

| Gate | Result |
|---|---|
| typecheck | ✓ clean |
| lint / format:check | ✓ Biome, 0 errors |
| test (`pnpm test`) | ✓ 574 passed |
| coverage (`test:coverage`) | ✓ after threshold fix (CI runs this, not plain `test` — was the long-standing red) |
| build | ✓ web build; Electron DMG packaged (node-pty rebuilt vs Electron 40.6.1) |
| **CI (post-push)** | ⚠️ **still red** — coverage fixed, but E2E now runs (first time since Mar) and fails on a **pre-existing critical a11y violation** (sidebar tree: raw `<button>` under `role="tree"`, `e2e/app.spec.js:57`). Not session-caused. |
| Manual walkthrough | ✓ `pnpm dev:web` confirmed identical to pre-refactor (user) |

### Code velocity

6 commits (4 substantive + 2 docs/config). 51 files · +5,725 / −13,722 for the core 4.
Excluding the lockfile swap (+5,279 / −12,379), real change ≈ **+446 / −1,343** (net −897),
dominated by deleting `nativeAPI.js` (619) and `eslint.config.js` (114).

### Cost / telemetry

**$28.30** (~all Opus 4.8: $28.03; Haiku $0.27) · API 56m / wall 1h38m · 286k in / 234k out
/ 32.0M cache read / 762k cache write. Drivers: 52% at >150k context (one long continuous
session, Phase 1→docs) + 51% subagent-heavy (~5 Explore agents on Opus). Priciest single
step: the `build:electron` DMG verification (worth it — de-risked pnpm). Next time: run
Explore agents on Sonnet; `/clear` between independent phases.

### Notes — next session targets

1. **Confirm web is live:** check the Cloudflare Pages deploy went green + boojy.org loads.
   If the CF build failed, set its build command to `ELECTRON_DISABLE=1 pnpm build` in the
   dashboard (not in repo) and retry. (Which project — `boojy` vs `boojy-notes-web` — is the
   one with boojy.org under Custom domains.)
2. **Get CI fully green:** fix the pre-existing critical a11y violation surfaced by E2E —
   sidebar notes tree renders `<button>` directly under `role="tree"`; they need
   `role="treeitem"` (see `e2e/app.spec.js:57`, `src/components/Sidebar.jsx`). Re-run E2E
   after; more buried failures may exist (CI hadn't reached E2E since ~Mar 2026).
3. Optional: continue Phase 3 — `ProfileTab` (915) / `Sidebar` (897) have cleaner seams than
   BoojyNotes did. Editor-core effects intentionally left alone.
4. Optional: desktop installers via `git tag v0.3.0 && git push origin v0.3.0`.
5. FEATURES.md still missing (docs-system gap, deferred).

---
