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
