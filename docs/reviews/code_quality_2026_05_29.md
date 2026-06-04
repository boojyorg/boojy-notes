# Code Quality Review — May 2026

> Consolidation checkpoint taken at commit `38d0148` (2026-05-29). The previous sweeping review lives in [`code_quality_2026_03_24.md`](./code_quality_2026_03_24.md) and supplies the **Before** column below.

Where March was a broad improvement pass (6.5 → 8.8), the two months since have been a **pivot and consolidation** rather than expansion. The headline changes:

- **v0.3.0 dropped two whole subsystems** — native mobile (Capacitor: `nativeAPI.js`, `ios/`, `android/`) and the multi-provider AI chat panel. The app now targets **web (responsive PWA) + desktop (Electron)** only.
- **Tooling modernized** — npm → pnpm (`node-linker=hoisted`), ESLint + Prettier → **Biome** (one tool for lint + format), plus a post-edit validation hook.
- **CI is green again** — the first time since ~March. A critical sidebar accessibility violation (`aria-required-children`) that had been silently blocking the E2E/axe gate is fixed.
- **Two-tier bug audit shipped** — sync staleness, wikilink nav + selection, nested folder rename, mobile image insert, placeholder overlap, first-sync gate, link-URL escaping, strikethrough/highlight toggle-unwrap.

The honest through-line: **scope reduction was itself a quality win** — fewer platforms, fewer lines, and an entire class of secret-handling code gone. But the big *structural* items deferred in March — TypeScript adoption, virtual scrolling, a real inline parser, breaking up `BoojyNotes.jsx`, ratcheting coverage — are **still deferred**. This review doesn't pretend otherwise.

**Overall: 8.8 → 8.9 / 10**

## Ratings

| Area | Mar | May | Movement |
|---|---|---|---|
| Performance | 9 | 9 | Lazy-load + memo intact; still no virtual scrolling |
| Platform abstraction | 9 | **9.5** | Capacitor gone — `isNative === isElectron`, two targets, clean factory |
| State management | 9 | 9 | AI context fully removed; NoteData read/write split + EditorContext intact |
| Inline formatting | 9 | 9 | Link-URL quote escaping + toggle-unwrap hardening; still regex-based |
| Sync | 9 | 9 | Timeout, backoff, BroadcastChannel, pull-before-push; no leader election / auto-merge |
| Security | 9 | **9.5** | Plaintext AI-key storage gap closed (feature removed); path-traversal guards intact |
| Data integrity | 9 | 9 | Schema versioning, IndexedDB fallback, random IDs; `crypto.randomUUID` still unused |
| Component structure | 8.5 | 8.5 | 3 hooks extracted, but `BoojyNotes.jsx` still ~1,763 lines |
| Test coverage | 8.5 | **8** | 600 → 585 tests (AI tests removed); actual line cov ~47%, mobile UI untested |
| Accessibility | 9 | 9 | Now **verified** — critical violation fixed, green axe pass; gaps remain |
| Type safety | 8 | 8 | `strict:true` but ~11% TS; context providers still `.jsx` |
| Export/import | 9 | 9 | DOCX covers 13 block types (images = alt text); native-mobile export removed |

---

## Breakdowns

Each section is framed as a **delta** from March: what moved, and what still stands.

### Performance (9 → 9)

**What changed:** Nothing regressed. `React.lazy` + `Suspense` still defer `SettingsModal`, `TerminalPanel`, and the dev-only `DevOverlay`. 11 components are memoized; `EditorArea`, `EditableBlock`, and `PaneContainer` keep their custom comparators (including the `textOnlyEditForEditor` fast-path that skips structural diffing on keystroke). `useDeferredValue` defers word-count stats, and `useSearch`/`useSync`/`useHistory` all debounce. Removing the second StarField canvas path (no more mobile-native target) trims a class of GPU work.

**What still stands:** No virtual scrolling in `Sidebar` — large note lists render the full tree. INP on the keystroke path is good but not formally re-measured this cycle.

---

### Platform Abstraction (9 → 9.5)

**What changed:** This is the cleanest win of the cycle. Dropping Capacitor collapsed three platform targets to two. `platform.js` now reads `isNative === isElectron` and `isWeb = !isNative` — no third branch, no silent no-op stubs to warn about. `nativeAPI.js` (619 lines) is deleted; `apiProvider.js` exposes a small `getAPI()` factory that returns either `window.electronAPI` or a browser-native web API (file picker → data URLs). `ELECTRON_DISABLE=1` conditional compilation is intact for web builds. Grep confirms zero live Capacitor references — only one explanatory comment remains.

**What still stands:** Nothing material. The March "remains for 10" item (mobile toast for unsupported features) is now moot — the mobile-native surface it described no longer exists.

---

### State Management (9 → 9)

**What changed:** The AI chat removal deleted an entire context/state branch — no `AIContext`, no API-key state, no provider-selection plumbing (verified clean). The 8 remaining providers (`NoteData` + `NoteDataActions` split, `Editor`, `Layout`, `Sidebar`, `Settings`, `Theme`, `Overlay`) are unchanged and still Redux/Zustand-free. The read/write `NoteDataContext`/`NoteDataActionsContext` split and the stable-ref `EditorContext` both survive intact.

**What still stands:** Context providers are still `.jsx` (untyped) — see Type Safety. The March idea of having `EditorArea` consume `useOverlay()`/`useNoteDataActions()` directly is still open.

---

### Inline Formatting (9 → 9)

**What changed:** Two hardening fixes landed (commit `b591f0c`). Markdown link URLs and auto-detected bare URLs now run through an `escAttr` helper that escapes `"` → `&quot;`, closing an attribute-injection gap where a quote in a URL could break out of the tag. And toggling off `~~strikethrough~~` / `==highlight==` now **unwraps** the formatting element instead of flattening to `textContent`, so nested bold/italic survives. Both have regression tests.

**What still stands:** Still ~9–10 regex passes, not a single-pass parser — the March "remains for 10" item. HTML entity escaping at the top (XSS guard), backslash escapes, and the italic lookbehind/lookahead that avoids eating `**` markers are all still in place.

---

### Sync (9 → 9)

**What changed:** No regressions; the layer is unchanged and production-grade. 30s `Promise.race` timeout on push/pull/delete, exponential backoff (2s/4s/8s, 3 retries), `BroadcastChannel("boojy-tab-sync")` for instant cross-tab updates, network-vs-server error classification (offline vs error state), pull-before-push ordering, conflict-copy creation on 409, and `Array.isArray(payload.content?.blocks)` validation on realtime payloads. The 2026-05-29 audit fixed the *open-note staleness* bug — remote pulls/realtime/cross-tab updates now refresh the editor immediately for the open note.

**What still stands:** No tab-leader election (every tab can push) and no auto-merge (conflicts still create a copy) — both carried forward from March.

---

### Security (9 → 9.5)

**What changed:** The standout improvement is a *removal*: with AI chat gone, the plaintext-API-key-in-localStorage path flagged in March no longer exists — there are no third-party API keys to store on web at all. Electron hardening is intact: `contextIsolation: true`, `nodeIntegration: false`, a whitelisting `preload.js`, `resolveCwd()` clamping the terminal to `os.homedir()`, the `boojy-att://` protocol handler rejecting paths outside the notes dir, and `sanitizeFilename()` rejecting `..`/`.`. Paste paths go through the whitelist-based `sanitizeInlineHtml()`. `global.d.ts` keeps every IPC method explicitly typed.

**What still stands:** Still no DOMPurify as a second net (the custom whitelist is the only sanitizer), and terminal `cwd` isn't validated against symlinks — both March carry-overs.

---

### Data Integrity (9 → 9)

**What changed:** Unchanged and solid. `storage.ts` keeps `CURRENT_SCHEMA_VERSION = 1` with a migration registry, an IndexedDB fallback for quota overflow, random-suffix `genBlockId`/`genNoteId`, and `ErrorBoundary` flushing `noteData` to a `boojy-error-backup` key on crash (plus a per-block `BlockErrorBoundary`). Load-time validation still requires `content.blocks` to be an array.

**What still stands:** `crypto.randomUUID()` is still unused (`Math.random()` suffixes suffice client-side); IndexedDB is a fallback, not the primary store.

---

### Component Structure (8.5 → 8.5)

**What changed:** Three more hooks (`useNoteStats`, `useWebNags`, `useDocumentTitle`) were pulled out of the root component, and the AI panel removal deleted a chunk of UI. The Electron main process stays well-split across 11 focused modules (`main.js` is 243 lines orchestrating `noteFileManager`, `export`, `import`, `terminal`, `trashManager`, `settingsManager`, `fileWatcher`, `secureStorage`).

**What still stands:** `BoojyNotes.jsx` is still ~1,763 lines wiring ~35 hooks — the extraction nets roughly flat because removed AI code offset the hook pulls. `ProfileTab.jsx` (916) and `Sidebar.jsx` (899) remain the next-largest decomposition candidates. This is the area with the most acknowledged debt.

---

### Test Coverage (8.5 → 8)

**What changed — and an honest downgrade:** Raw test count dropped 600 → **585** across 45 files, because the AI-chat tests were removed with the feature. Breadth is still good (utils, ~14 hooks, two context providers, ~19 components, settings, terminal, plus 58 markdown tests and an E2E suite). But the *measured* line coverage sits around 47%, and CI thresholds are deliberately floored just below that (45% lines / 42% branches) — a regression guard, **not** a target. The gap is mostly the mobile-UI presentational code added in the v0.2.0 overhaul, which remains untested. March's 8.5 was generous against that reality; 8 is the honest mark.

**What still stands:** Deep editor-hook integration (keyboard + input together in live contentEditable), the remaining context providers, drag-reorder edge cases, and any visual/stress testing are all still uncovered. The standing instruction is to ratchet thresholds **up** as presentational code gets covered — never down to pass.

---

### Accessibility (9 → 9, now verified)

**What changed:** March *claimed* 9, but CI couldn't even reach the E2E axe step — so the score was unverified. This cycle fixed the blocker: the "New Folder"/"New Note" buttons sat directly under `role="tree"`, violating `aria-required-children`; they now carry `role="treeitem"` (commit `127bcc6`), and the axe pass is **green**. Backlinks panel entries became keyboard-operable (`role="button"`, `tabIndex=0`, Enter/Space), the auth button announces `aria-busy`, and the mobile title is tappable-to-rename. Focus traps, focus-visible CSS, and editor-block ARIA roles all carry forward.

**What still stands:** Biome's a11y lint rules are intentionally **off** (parity with the old config — E2E catches violations instead). Roving-tabindex tree navigation isn't implemented, `LinkEditPopover` and `CalloutTypePicker` lack proper focus management (and the picker's items lack `role="option"`), and there's no high-contrast mode.

---

### Type Safety (8 → 8)

**What changed:** Flat. `tsconfig` stays `strict: true` with `noImplicitAny: false`. The discriminated `Block` union in `notes.ts` and the fully-typed `electronAPI` interface in `global.d.ts` (no `[key: string]: any`) are intact.

**What still stands:** TypeScript adoption stalled — only ~16 of ~140 source files (~11%) are `.ts`/`.tsx`, and **all 8 context providers are still `.jsx`**. The March "remains for 9" items (convert providers to TS, enable `noImplicitAny`) saw no movement this cycle.

---

### Export/Import (9 → 9)

**What changed:** Stable. DOCX export covers 13 block types; PDF goes through an HTML wrapper with `&`/`<`/`>` title escaping; imports cap at 50MB. The mobile-native export paths were removed cleanly with Capacitor, shrinking the surface.

**What still stands:** Images and file attachments in DOCX are still alt-text/filename only — not embedded (would require fetching from R2/disk). PDF page-size selection and UTF-8 import validation remain open.

---

## The standing debt list (carried into the next cycle)

1. **`BoojyNotes.jsx` is still a ~1,763-line god component** — the single largest structural item.
2. **TypeScript adoption stalled at ~11%** — context providers are still untyped `.jsx`.
3. **No virtual scrolling** — `Sidebar` won't scale to 1000+ notes gracefully.
4. **Inline formatting is still ~10 regex passes**, not a single-pass parser.
5. **Coverage is floored at actuals (~47%)**, dragged down by untested mobile presentational code — to be ratcheted up, never down.

None of these are regressions; they're the same structural items March deferred. The cycle's real progress was elsewhere: a smaller, simpler, greener codebase.
