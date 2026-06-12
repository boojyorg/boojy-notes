# Adversarial review — v0.5.0 reliability wave (PRs #37–41)

**Date:** 2026-06-12 · **Scope:** merged range `8648d6c..2abc60e` on master
**Method:** multi-agent adversarial workflow — 10 skeptic reviewers (two attack angles per
data-safety claim, plus a round-trip counter-example hunter and a full-diff regression sweep),
findings deduplicated, then every finding judged by 3 adversarial verifiers (trace / mitigation /
impact lenses) with a majority vote. 38 raw findings → 32 deduplicated → **27 confirmed, 5 refuted**.
107 agents total. The 8 already-tracked issues from the 2026-06-12 readiness audit were excluded
up front.

## Verdict per claim

| Claim | Verdict | One-liner |
| --- | --- | --- |
| **#37** Reads never write | ❌ **Broken** | Per-`.md`-file guarantee holds, but `.boojy-index.json` is written into the vault root on every scan — a pointed-at Obsidian vault is mutated on first launch (P0). |
| **#38** Saves are crash-safe | ⚠️ Holds for crashes, not power loss | temp+rename is correct against process death; missing `fsync` means power loss can zero a just-saved note (P1). Trash metadata still uses a non-atomic write. |
| **#39** Lossless round-trip | ✅ Holds | Fence/list-number/image fixes are mechanically sound; no counter-example found. Adjacent pre-existing losses (tilde fences, wikilink width clamp) documented below. |
| **#40** Quit can't lose text | ⚠️ Holds single-pane, broken split-pane | The three-layer flush design is sound for all normal quit paths; split-pane typing across two notes within the 300 ms debounce loses one note's keystrokes (P0). |
| **#41** Sync inert when off | ⚠️ Mostly holds | The `user=null` gate covers every note-data path; but an in-flight `syncAll` survives a toggle-off (P1), and auth/profile still phone Supabase with the toggle off. |
| Collateral regressions | ✅ None claim-breaking | One real UX regression: the conflict-resolution UI is unreachable on desktop now that `syncEnabled` defaults off. |

## Must-fix before tagging v0.5.0 (recommended)

1. **[P0] Index file mutates the vault** — `readAllNotes` unconditionally writes
   `.boojy-index.json` into the notes directory on every scan. This fails the import gate
   directly: `git diff` on a pointed-at vault copy will *never* be clean. Move the index to
   Electron `userData` (keyed by vault path) or at minimum guard with a content-diff check.
2. **[P0] Split-pane flush loss** — typing note A → note B across panes inside the 300 ms
   debounce window leaves the quit flush writing only B; A's keystrokes are silently dropped
   (`useHistory.js` `editedNoteHint` is a single slot). Make the hint a Set, or flush A
   synchronously when the hint is reassigned.
3. **[P1] Missing `fsync` before rename** — power loss after `renameSync` but before page-cache
   writeback can leave the note as zeros/garbage on APFS/NTFS/ext4-writeback. Open the temp file,
   `fsyncSync` it (and ideally the directory) before the rename.
4. **[P1] In-flight sync survives toggle-off** — an already-running `syncAll` holds the pre-flip
   `user` closure and completes all pushes/pulls. Add an abort/generation check inside the loop.

## Fix-soon (vault-import hazards — first-*edit* mutations, not on-open)

These don't fire on open/scan, but the first edit of an affected note silently rewrites
third-party content — directly relevant to migrating Vault material in:

- **[P1]** Tilde-fence (`~~~`) code blocks parse as paragraphs → structure destroyed on save.
- **[P2]** Table `:---` left-align separators normalized to `---`.
- **[P2]** Indented non-list content (HTML embeds, continuation paragraphs) loses leading whitespace.
- **[P2]** Wikilink image widths `![[img|N]]` with N < 70 clamp up to 70.
- **[P2]** Obsidian frontmatter: survives reads, but edge cases on the write path (see findings).

## Also confirmed (selected)

- **[P2]** Failed disk writes drop the note from the dirty set with no retry (`useFileSystem.js:172`).
- **[P2]** `saveTrashMeta` is non-atomic — power loss orphans every trashed note from the UI.
- **[P2]** Conflict-resolution UI unreachable on desktop upgrade (sync panel hidden when toggle off).
- **[P2]** Split-pane tag autocomplete broken (`PaneContainer` doesn't pass `tagMenuRef`).
- **[P2]** Auth session refresh + billing-profile fetch hit Supabase even with sync off.

Full details for all 27 confirmed findings below, grouped by the claim they attack.

## Findings by claim

Each finding survived a 3-verifier adversarial vote (trace / mitigation / impact lenses).
`breaks claim` means the finding genuinely violates the guarantee as stated; the rest are
adjacent weaknesses found while attacking it.

### Claim 1 — Reads never write (#37)

#### [P0] readAllNotes unconditionally writes .boojy-index.json into the vault on every scan

`electron/noteFileManager.js:153` · **breaks claim**

readAllNotes() calls saveIndex(notesDir) unconditionally at line 153 after every vault walk, with no diff-check or skip-if-same guard (writeFileAtomic always writes, so even unchanged content bumps the file's mtime). saveIndex writes to path.join(notesDir, '.boojy-index.json') — directly inside the user's vault root, not Electron's userData. This fires on: (a) app startup via the read-all-notes IPC handler (line 162), (b) every external file-change/delete event (useFileSystem.js:292), (c) syncFoldersFromDisk after every external change (useFileSystem.js:239/328). An Obsidian vault pointed at as the Boojy notes folder gets .boojy-index.json created on first launch and mtime-bumped on every subsequent open and file change — before the user types a single character. For a git-tracked vault, `git status` shows a new untracked file after first open. The test at tests/electron/noteFileManager.test.js:71-78 explicitly acknowledges the side-effect ('creates nothing on disk BESIDES the .boojy-index.json'), but the PR #37 claim ('a third-party markdown folder survives byte-identical') does not carve out this exception.

#### [P1] fileWatcher calls saveIndex on every external file-change and file-add event, rewriting the vault index even when no ID mapping changed

`electron/fileWatcher.js:30`

The chokidar 'change' handler (line 30) and 'add' handler (lines 40-41) both call saveIndex(notesDir) unconditionally after parseNoteFile, even if the parsed note already had a correct index entry. Every time an external tool (Obsidian, a text editor) saves or creates a .md file in the vault, Boojy rewrites .boojy-index.json — in addition to the write already triggered by the renderer's follow-up readAllNotes call, doubling the write surface. Combined with the startup write, the index file's mtime is updated by any external editing activity for as long as Boojy is running, not just by user actions inside Boojy. A simple guard (only call saveIndex if the index actually changed) would eliminate this side effect.

#### [P1] .boojy-index.json is placed in the vault root, not in Electron userData

`electron/noteFileManager.js:51`

indexPath(notesDir) returns path.join(notesDir, '.boojy-index.json'), placing the index file inside the user-chosen notes directory (the vault), not in app.getPath('userData'). This architectural decision is what turns the unconditional saveIndex() call (see the readAllNotes finding) into a vault mutation. If the index were stored in userData alongside config.json and settings.json (see settingsManager.js:7-8), the vault would remain untouched. The choice is intentional (makes the index portable alongside the notes) but directly contradicts the read-only guarantee for third-party vaults.

#### [P2] parseFrontmatter silently discards Obsidian YAML keys that lack a ': ' separator or appear before a Boojy id

`electron/noteFileManager.js:89`

In parseNoteFile (line 89-93), if a file contains any frontmatter block whose first YAML field happens to match /^note-\d+-/ as the id key, the entire frontmatter block is stripped from `body` and the file is loaded without it. More broadly, parseFrontmatter (markdown.js:414) uses a regex that requires the block to be at the absolute start of the file, so typical Obsidian files (which often have YAML frontmatter) will have parseFrontmatter return null — meaning body = raw and the frontmatter survives in-memory. This does NOT write to disk on read (comment on line 85-93 is correct: migration only happens on the write path). However, if the user edits any such note and the write path is triggered, blocksToMarkdown will re-serialize without the frontmatter (write-note IPC uses only note.content.blocks), permanently destroying the Obsidian YAML. This is a data-loss risk on the first edit, not on open/scan.

#### [P2] Table :--- explicit-left-align separator is normalized to --- on first edit, silently changing the file

`src/utils/markdown.js:129`

markdownToBlocks() maps any separator cell that is not center (:---:) or right (---:) to the string 'left' (line 264). blocksToMarkdown() emits the canonical '---' for 'left' (line 129), discarding the explicit colon. Round-trip: '| A | B |\n| :--- | :--- |\n| x | y |' → '| A | B |\n| --- | --- |\n| x | y |'. Affects all standard GFM explicit-left markers (':---', ':--', ':----', etc.). This mutation does NOT fire on open/read/scan — dirty detection correctly skips unedited notes — but fires the first time the user types anything in a note that contains a left-aligned table, silently rewriting the separator row. Obsidian users who rely on :--- for left-align semantics (e.g. to override a theme default) will lose the marker with no warning. The round-trip test suite covers only the Boojy-canonical '---' form; no test exercises ':---' as input.

#### [P2] Indented non-list paragraphs (e.g. indented HTML blocks) lose their leading whitespace on first edit

`src/utils/markdown.js:163`

The main parse loop at line 163 does `const line = raw.trim()`, stripping all leading whitespace before classifying each line. The computed `indent` variable (line 334) is only attached to bullet/numbered/checkbox blocks (lines 342, 350, 353); paragraph, heading, and non-callout blockquote blocks never receive an indent field. blocksToMarkdown has no indent emission for 'p' blocks. Consequence: '  <p>HTML block</p>' (2-space indent) round-trips to '<p>HTML block</p>', breaking multi-line HTML embeds, Obsidian-style indented continuation paragraphs, and any YAML/config fence that relies on indentation. As with the alignment issue, this fires on first edit, not on open. Neither the round-trip tests nor the 'byte-identical' tests cover indented non-list content.

### Claim 2 — Saves are crash-safe (#38)

#### [P1] Missing fsync before rename: power loss can zero-out the renamed note file

`electron/noteFileManager.js:42` · **breaks claim**

writeFileAtomic calls fs.writeFileSync(tmpPath, data) followed immediately by fs.renameSync(tmpPath, filePath) with no fsync in between. writeFileSync returns as soon as data is in the OS page cache; the kernel write-back daemon flushes to physical media asynchronously. If power is lost after renameSync commits the directory-entry update to the filesystem journal but before the page cache is flushed, the destination file (the user's note) will have a valid inode and directory entry pointing to data blocks that were never physically written — typically zeros or garbage. The original file is gone because rename replaced it. On APFS (macOS), NTFS (Windows), and ext4 in writeback mode (Linux) this scenario is real. The fix is to call fs.fsyncSync(fd) on the temp file descriptor before closing it, then optionally fsync the parent directory. The claim says 'crash or power loss at ANY instant' — this fails at the power-loss instant between rename metadata commit and data write-back.

#### [P2] Failed writes silently drop the note from the dirty set and are never retried

`src/hooks/useFileSystem.js:172`

In the flush() callback, dirtyNotes.current.delete(noteId) at line 172 is positioned outside the try/catch that surrounds api.writeNote (lines 165-170). If writeNote rejects (disk full, ENOSPC, permission error), the catch block logs and calls onError, but then execution falls through to line 172 and removes the note from the dirty set regardless. The note will never be re-queued for a retry write. The user sees a brief error toast but their note remains only in React state; on next app launch the stale on-disk version (or no file at all) will be loaded. This is an adjacent data-loss risk under error conditions, distinct from the atomic-write crash-safety claim but worth fixing alongside it.

#### [P2] Crash between unlinkSync and saveIndex during rename silently re-IDs the note

`electron/noteFileManager.js:202`

In the write-note IPC handler, the sequence is: (1) writeFileAtomic(finalPath) at line 195, (2) fs.unlinkSync(existingPath) at line 202, (3) _idIndex[note.id] = newRelPath at line 219, (4) saveIndex() at line 220. A crash after line 202 (old file gone) but before line 220 (index persisted) leaves 'New Title.md' on disk with correct content, but the on-disk index still maps note.id to the now-deleted 'Old Title.md'. On next boot, readAllNotes:loadIndex loads the stale index; parseNoteFile finds 'New Title.md' with no matching index entry, generates a fresh random ID (line 103) and adds it. The stale entry for the old ID is cleaned up at line 150. The note appears in the sidebar under a brand-new ID. Any UI state, in-memory history, or future sync reference that depended on the original ID is silently orphaned. Content is never lost, but this violates the 'existing note survives intact' intent of the claim: the user's note effectively loses its identity without warning.

#### [P2] saveTrashMeta uses non-atomic writeFileSync — power loss can corrupt trash metadata, orphaning all trashed notes

`electron/trashManager.js:34`

saveTrashMeta writes .boojy-trash-meta.json with a plain fs.writeFileSync (line 34), not the writeFileAtomic pattern introduced in PR #38. A power failure mid-write truncates the JSON, which loadTrashMeta silently catches (line 23-27 catch block returns {}) — effectively wiping all trash metadata. The .md files in .trash/{noteId}.md are untouched on disk, but the read-trash handler (line 91) uses the metadata to enumerate trash, so it returns an empty set. restore-note (line 128) also requires the metadata entry; without it, every trashed note returns null. The user has no UI path to recover notes they trashed. This is a crash-safety gap left unaddressed by PR #38; since trash is the safety net for user-deleted notes, corrupting its metadata can cause irreversible data inaccessibility even though the .md bytes survive.

#### [P3] Rename crash-window leaves a visible duplicate note in the sidebar

`electron/noteFileManager.js:197`

A crash after writeFileAtomic(finalPath) at line 195 but before fs.unlinkSync(existingPath) at line 202 leaves both 'Old Title.md' and 'New Title.md' on disk. The on-disk index maps note.id → 'Old Title.md'. On reload, readAllNotes assigns the original ID to 'Old Title.md' (found in index) and a fresh random ID to 'New Title.md' (not found). Both appear in the sidebar as separate notes with identical content. A comment at line 198 acknowledges this: 'a crash in between leaves a duplicate (recoverable), never a missing note.' Recovery requires the user to manually delete the phantom. This is intentional per the PR design, not a silent failure, but the user must take action to clean up after such a crash.

#### [P3] Orphaned .*.tmp files accumulate permanently if the same note is never saved again after a crash

`electron/noteFileManager.js:41`

writeFileAtomic always uses the same tmpPath pattern: path.join(dir, '.' + basename + '.tmp'). A crash after writeFileSync(tmpPath) but before renameSync leaves the temp file on disk. On the next write to the same note, writeFileSync silently overwrites the stale temp file — so it is self-healing per note. However, if the user renames a note after the crash (changing its basename), the old temp file (e.g., '.Old Title.md.tmp') is never cleaned up because the new save writes to a different tmpPath. Over time, with repeated crash-and-rename cycles, stale temp files accumulate. The vault walker at line 134 skips dot-files so they are invisible to the app but remain on disk indefinitely. No data is corrupted, but the vault directory slowly fills with stale temp files. No cleanup routine exists.

### Claim 3 — Lossless round-trip for fences / list numbers / images (#39)

#### [P1] Tilde-fence (~~~) notes parse as paragraphs, silently destroying code-block semantics on import

`src/utils/markdown.js:189`

The fence-detection regex /^(`{3,})/ only recognises backtick fences. A note from Obsidian, Typora, or any CommonMark-compliant editor that used ~~~python\n...\n~~~ syntax will have every line parsed as a paragraph block — including the ~~~ delimiter lines. On the desktop (where markdown is the literal file format), this note will be written back with all three lines as plain text, permanently destroying the code-block structure. Not introduced by PR #39 (the regex predates it), but the spec's own rule ('anything else that fails round-trip is a bug') covers it, and it is not listed as a sanctioned intrinsic loss in docs/SPEC-markdown-source-of-truth.md. The block→md→block direction is unaffected (app-created blocks always produce backtick fences), so this does not break the stated claim, but it is a silent data-loss path for imported notes.

#### [P2] Wikilink image pixel widths below 70 are permanently widened on first open-and-save

`src/utils/markdown.js:295`

The wikilink-image parser clamps width to Math.min(Math.max(width, 10), 100) (percentage units). Any existing .md file with ![[photo.png|N]] where N < 70 (e.g. ![[photo.png|35]]) parses to width=10 (clamped from 5), which the serializer re-emits as ![[photo.png|70]]. Tested concretely: ![[test.png|35]] → width=10 → ![[test.png|70]]; same for |49 and |69. The mutation happens silently on the first open-and-save of any note containing a small wikilink image. This is pre-existing (the clamp predates PR #39) and does not affect md-format images (which use Math.max(5, ...) floor). Does not break the block→md→block claim (app-created blocks always have width ≥ 10 after they pass through the parser), but represents a one-way mutation of user data from the disk file.

### Claim 4 — Quit/close/blur cannot lose typed text (#40)

#### [P0] Split-pane cross-note flush: note A's pending edits lost when note B is typed before the 300 ms debounce fires

`src/hooks/useHistory.js:78` · **breaks claim**

When the user types in note A (left pane) then immediately types in note B (right pane) within the 300 ms commitTextChange debounce window, commitTextChange (line 78-82) detects a pending flush for A, calls clearTimeout, sets hasPendingFlush=false, and calls setNoteData(noteDataRef.current). This queues a React state update — but React 19 batches it and it will not trigger a re-render (and therefore not trigger useFileSystem's dirty-detection useEffect) until after the current JS task completes. commitTextChange then applies updaterB at line 97, sets hasPendingFlush=true, and sets editedNoteHint=B. When app-will-close fires: extra = [B] (useQuitFlush line 24), flushToDisk(noteDataRef.current, [B]) is called. The flush iterates [...dirtyNotes.current] (which doesn't include A yet — React hasn't rendered) plus [B] — note A's ID is in neither set. noteDataRef.current holds A's fresh data but it is never iterated over or written. A's keystrokes since the last disk write are silently lost. User-visible impact: in split-pane mode, quitting quickly after switching typing focus from one note to another loses the first note's recent edits with no warning. Confirmed that dirtyNotes is only populated in useFileSystem's useEffect depending on noteData (line 108-143), which runs asynchronously after React re-renders, and that the ipcMain app-will-close message is dispatched in a separate task that can arrive before React processes the batched state update.

#### [P1] editedNoteHint records the wrong note ID when typing in the non-activePaneId split pane via keyboard focus (no mouse click)

`src/hooks/useHistory.js:102` · **breaks claim**

commitTextChange at line 102 sets editedNoteHint.current = activeNoteRef.current. activeNoteRef.current is assigned in BoojyNotes.jsx line 256 as activeNote, which comes from useSplitView's active-pane accessor (activePane.activeNote). activePaneId is updated only via setActivePaneId, which is called from handlePaneClick (PaneContainer line 289-291, triggered by onMouseDown on the pane wrapper div). A user who tabs keyboard focus into the non-active pane (e.g., Tab key or programmatic focus) without a mouse-down event will type into a pane whose note ID is NOT reflected in activeNoteRef. editedNoteHint is then stamped with the previously-active pane's note ID, causing the quit flush to mark the wrong note as needing an extra dirty write. If that wrong note was already clean, the actually-edited note is missed. This is narrower than the split-pane cross-note flush finding (requires keyboard-only pane activation in split mode) but produces the same data-loss outcome.

#### [P2] ipcMain.once listeners double-registered on rapid double-close; second app.quit() goes unchecked

`electron/main.js:69` · also affects: regression

The close event handler at line 51 registers ipcMain.once('flush-before-close-done', finish) and sends 'app-will-close' to the renderer each time it fires, without guarding against re-entry while a flush handshake is already in-flight. If the user triggers two close events (e.g. Cmd+W then Cmd+Q, or Cmd+W then traffic-light click) before flushedBeforeClose is set, two separate finish closures are created, each with its own 2s timer and its own ipcMain.once registration. The renderer's onAppWillClose listener (ipcRenderer.on, not once) fires for each signal, so flushBeforeCloseDone is sent twice — both finish closures complete and both call app.quit()/win.close(); the second is a no-op in practice because flushedBeforeClose is already true. If the renderer sends the done-signal only once, the extra once-listener is orphaned on ipcMain (GC'd with the process). No data loss and no crash, but the accumulation is unbounded while the window lives and the close-handshake has an untested concurrent path introduced entirely by this wave. Fix: add a boolean guard (e.g. closeHandshakeInFlight) to skip e.preventDefault() if a handshake is already running, or switch to ipcMain.on + explicit removeListener.

#### [P2] 2s cap means data IS lost when flush duration exceeds it

`electron/main.js:68`

Acknowledged design tradeoff, but worth flagging concretely. The claim says 'with a 2s cap' — that phrasing acknowledges text can be lost when the flush takes longer. In practice, writeFileAtomic is fully synchronous (fs.writeFileSync + fs.renameSync, noteFileManager.js:42-43), and synchronous writes in main block the Node event loop, meaning the setTimeout callback cannot fire while a write is in progress. A slow write thus delays the timer rather than racing it, which is actually safer than it looks. BUT: the renderer awaits each writeNote() IPC round-trip serially (useFileSystem.js:165). If the main process is blocked writing note N, the renderer's IPC promise for note N-1 has not resolved yet; each round-trip can add tens of milliseconds. With many dirty notes (e.g., vault-wide import followed by immediate quit), the total flush time could exceed 2s, firing the timeout and closing the window before the renderer's loop finishes. The renderer's remaining IPC sends fail silently once the window is destroyed. Impact: notes that didn't complete their IPC round-trip before the timeout are not written — the only scenario where the claim's 'pending edits' guarantee is broken in a reproducible way.

#### [P2] Blur flush is fire-and-forget with no guard against a concurrent quit flush starting before the blur write completes

`src/hooks/useQuitFlush.js:39`

The onBlur handler (line 39-41) calls flushAll() without awaiting it or coordinating with the onAppWillClose close handshake. If the window loses focus and the user hits Cmd+Q within milliseconds (a common alt-tab + quit macOS pattern), both flushAll() invocations run concurrently against the shared dirtyNotes.current Set (useFileSystem.js:48). Both snapshot dirty = [...dirtyNotes.current] (line 157) before either has deleted entries, so each independently writes the same notes — wasteful but serialized through the main-process event loop, so no corruption. More critically, the close flush calls flushBeforeCloseDone() immediately after it finishes, potentially before the blur flush's writes have completed; the window closes and if the blur flush's writes are still in-flight the renderer process may be killed mid-write, leaving a partial .tmp file. The atomic rename preserves the last successfully renamed version, but the most recent pending edit (the one that motivated the blur flush) may be discarded. Not a guaranteed data loss, but a real race; the snapshot pattern limits the worst Set-mutation outcome to a redundant second write.

#### [P2] PaneContainer does not pass tagMenuRef/setTagMenu to useEditorHandlers, causing useInputHandler to silently receive undefined and skip tag autocomplete in split panes

`src/components/PaneContainer.jsx:131`

PaneContainer calls useEditorHandlers (line 131-157) without passing tagMenuRef or setTagMenu. useEditorHandlers forwards these to useInputHandler (useEditorHandlers.js line 64-74). With undefined refs, the tag-autocomplete detection block in useInputHandler (line 162-173) reads tagMenuRef.current — accessing .current on undefined throws a TypeError, or if somehow guarded, silently never shows the tag menu. More critically, when a tag match disappears (the else if at line 170), tagMenuRef.current is undefined, so the conditional is always falsy — no crash, but the tag menu is never cleared either. This is a split-pane-only functional bug, not related to the flush claim, but it ships in the v0.5.0 reliability wave.

#### [P2] flush()/flushToDisk never cancels the pending writeTimer before executing — concurrent and post-close double-write attempts

`src/hooks/useFileSystem.js:150` · also affects: regression

The flush function (now exposed as flushToDisk) does not call clearTimeout(writeTimer.current) before running. Two consequences. (1) Blur path: when the blur flush fires, the 500 ms write-debounce timer started by a subsequent React state update will also fire; between the blur flush's await api.writeNote and its dirtyNotes.current.delete(noteId), the useEffect([noteData]) at line 139 can re-add the same noteId. If the IPC write takes longer than 500 ms (slow disk / network share), the timer fires a second flush() while the first is in-flight — both serialize on the main side so no corruption, but two redundant writeNote round-trips occur for the same note, each with suppressWatcher churn. The pre-wave flush was never called externally, so this concurrent pattern is entirely new with flushToDisk. (2) Quit path: after flushBeforeCloseDone is sent and the main process calls win.close(), the unmount cleanup at line 316-318 clears the timer, but if unmount races the timer firing, flushRef.current() is called on a partially-destroyed component — a redundant write and a possible unhandled promise rejection after close. Not a data-loss risk (the quit flush already wrote everything), but a correctness gap introduced by exposing flush without draining the timer.

#### [P3] webContents.send called without checking renderer-alive before the flush IPC

`electron/main.js:70`

win.webContents.send('app-will-close') is called unconditionally. If the renderer process has already crashed (webContents.isCrashed() === true or isDestroyed()) the send is a no-op, the renderer never calls flushBeforeCloseDone, and the 2s timeout fires — the window closes without a flush attempt. Any edits made before the crash were already lost in memory, so this does not introduce an additional data-loss vector beyond the crash itself. However, adding a win.webContents.isDestroyed() || win.webContents.isCrashed() guard before the send would allow immediately short-circuiting (skipping the 2s wait) rather than hanging the user in the app for 2 extra seconds after a renderer crash.

### Claim 5 — Sync is inert when the toggle is off (#41)

#### [P1] In-flight sync completes after toggle OFF — no abort mechanism, and no test covers the scenario

`src/hooks/useSync.js:252` · **breaks claim**

syncAll is an async function whose closure captures user via useCallback([user, setNoteData, syncState]). When syncEnabled flips to false, BoojyNotes re-renders passing user=null; React recreates syncAll with user=null and updates syncAllRef.current (line 550). BUT any invocation of the OLD syncAll that is already past line 257 (isSyncing.current = true) holds the pre-flip user in its closure and has no AbortController or cancellation check — it runs every remaining pushNote/pullNotes/deleteNoteRemote call until completion or timeout (SYNC_TIMEOUT_MS = 30s, line 18). Concrete path: app launches, Supabase session is silently restored, the user-login effect at line 553 schedules syncAll() in 500ms, user opens Settings and toggles OFF within that 500ms — or edits a note, the 2s debounce fires and sync starts, user then toggles OFF while pushNote is awaiting the Supabase response. In both cases data is sent to/pulled from Supabase with the toggle in the OFF position. Test coverage gap: the 18 cases in tests/hooks/useSync.test.js (plus useAuth.test.js) cover default-off, null-user guard, first-sync gate, online/offline, debounce, retry, conflict, and version-map scenarios, but none exercises user transitioning to null while an async syncAll is in-flight — so this defect has no regression coverage.

#### [P2] Auth session refresh and profile fetch fire regardless of sync toggle

`src/hooks/useAuth.js:28`

On every app launch that finds a persisted Supabase session (from a previous sign-in), useAuth unconditionally calls supabase.auth.getSession() (line 28) and, if a user is returned, fetchProfile() (lines 9-21), which issues a supabase.from('profiles').select(...) DB query. Neither call is gated by syncEnabled. The fetched data is billing metadata (tier, storage_limit_bytes, stripe_customer_id), not note content — so the literal claim is not broken — but a user who enabled then disabled the per-device sync toggle reasonably expects zero cloud traffic when it is off. The onAuthStateChange subscription (line 38) also keeps a WebSocket open to Supabase Realtime for auth-state events. These calls are logically necessary for the profile tab UI, but there is no toggle or opt-out path; the billing query and token-refresh fire every launch as long as a session cookie exists in localStorage.

#### [P3] BroadcastChannel receive path applies remote note changes without a syncEnabled guard

`src/hooks/useSync.js:114`

The BroadcastChannel('boojy-tab-sync') is opened unconditionally on mount (no user or syncEnabled guard, line 114). When another browser tab has sync enabled and updates a note, the bc.onmessage handler at line 118 calls setNoteData and potentially bumps syncGeneration, mutating the local note state even though this device's sync toggle is off. This is a local inter-tab path — it does not reach Supabase or R2 — so it does not violate the specific claim. However, it means a desktop user running two windows who enables sync on one window will silently push note state changes into the other window even though the second window's sync toggle is off. The send side (localChannelRef.current.postMessage) is correctly gated behind if (!user) at line 179, so local-only edits are never broadcast out.

### Cross-cutting — No collateral regressions

#### [P2] ipcMain.once listeners double-registered on rapid double-close; second app.quit() goes unchecked

`electron/main.js:69` · also affects: quit

The close event handler at line 51 registers ipcMain.once('flush-before-close-done', finish) and sends 'app-will-close' to the renderer each time it fires, without guarding against re-entry while a flush handshake is already in-flight. If the user triggers two close events (e.g. Cmd+W then Cmd+Q, or Cmd+W then traffic-light click) before flushedBeforeClose is set, two separate finish closures are created, each with its own 2s timer and its own ipcMain.once registration. The renderer's onAppWillClose listener (ipcRenderer.on, not once) fires for each signal, so flushBeforeCloseDone is sent twice — both finish closures complete and both call app.quit()/win.close(); the second is a no-op in practice because flushedBeforeClose is already true. If the renderer sends the done-signal only once, the extra once-listener is orphaned on ipcMain (GC'd with the process). No data loss and no crash, but the accumulation is unbounded while the window lives and the close-handshake has an untested concurrent path introduced entirely by this wave. Fix: add a boolean guard (e.g. closeHandshakeInFlight) to skip e.preventDefault() if a handshake is already running, or switch to ipcMain.on + explicit removeListener.

#### [P2] flush()/flushToDisk never cancels the pending writeTimer before executing — concurrent and post-close double-write attempts

`src/hooks/useFileSystem.js:150` · also affects: quit

The flush function (now exposed as flushToDisk) does not call clearTimeout(writeTimer.current) before running. Two consequences. (1) Blur path: when the blur flush fires, the 500 ms write-debounce timer started by a subsequent React state update will also fire; between the blur flush's await api.writeNote and its dirtyNotes.current.delete(noteId), the useEffect([noteData]) at line 139 can re-add the same noteId. If the IPC write takes longer than 500 ms (slow disk / network share), the timer fires a second flush() while the first is in-flight — both serialize on the main side so no corruption, but two redundant writeNote round-trips occur for the same note, each with suppressWatcher churn. The pre-wave flush was never called externally, so this concurrent pattern is entirely new with flushToDisk. (2) Quit path: after flushBeforeCloseDone is sent and the main process calls win.close(), the unmount cleanup at line 316-318 clears the timer, but if unmount races the timer firing, flushRef.current() is called on a partially-destroyed component — a redundant write and a possible unhandled promise rejection after close. Not a data-loss risk (the quit flush already wrote everything), but a correctness gap introduced by exposing flush without draining the timer.

#### [P2] Conflict resolution UI silently inaccessible on desktop upgrade (syncEnabled defaults to false)

`src/components/settings/ProfileTab.jsx:779`

The ternary {isDesktop && !syncEnabled ? <p>local-only message</p> : <>full sync panel</>} hides the entire sync panel — including the conflict list and 'Sync now' button — whenever isDesktop=true && syncEnabled=false. On upgrade from a pre-wave version, localStorage.getItem('boojy-sync-enabled') returns null (key never existed), so syncEnabled initialises to false per the logic at BoojyNotes.jsx:263. Any desktop user who was previously signed in and syncing will find their Sync panel replaced by the 'Notes stay local' message. Pre-existing conflict notes (titles containing '(conflict ') remain in the sidebar as ordinary notes, but the dedicated conflict-resolution path in Settings > Profile > Sync is inaccessible until the user discovers and re-enables the toggle. This is a user-visible UX regression for the 'was syncing, now upgraded' cohort, even though disabling sync by default is the stated intent of PR #41. The toggle affordance exists, but there is no migration notice or tooltip explaining why the panel disappeared.

#### [P3] numCounter in blocksToMarkdown resets to 0 between list segments — reordered numbered blocks emit non-sequential numbers on first re-save

`src/utils/markdown.js:42`

The new numCounter logic preserves each block's original block.num value when serialising to markdown. When the user drags a numbered item to a different position, the block's block.num is preserved (all block spread operations copy all fields). After saving, items may be emitted out of numeric order: e.g. dragging item 3 before item 1 produces '3. Gamma\n1. Alpha\n2. Beta'. On reload, parseInt(line, 10) stores those same numbers back as block.num. The round-trip is lossless (the authored numbers are preserved), but a markdown renderer that respects list ordinals will display them out-of-sequence. Before the wave, all numbered items were always serialised as '1.', so every rendered list started from 1 regardless of reorder. The wave improves fidelity for notes edited externally (e.g. in Obsidian) but introduces a regression for in-app reorders: what was previously a cosmetic '1. 1. 1.' is now a potentially confusing '3. 1. 2.' after a drag. No data loss, but the stated goal of 'lossless round-trip for list numbers' is only fully met for static lists, not lists modified in-app after the first read.

## Refuted findings (verifier majority rejected)

Raised by skeptics but voted down — recorded so they are not re-litigated.

- **[P2] useFileSystem dirty-detection (the core guarantee of 'no write on read') has zero unit tests** (`src/hooks/useFileSystem.js`)
  - Refuted: The dirty-detection mechanism in useFileSystem.js (isExternalUpdate flag, prevNoteData comparison, dirtyNotes tracking) is correctly implemented in the current code: all four locations that set isExternalUpdate.current = true do so synchronously BEFORE calling setNoteData, ensuring the flag is set before the effect runs. While the finding is factually correct that there are no unit tests for useFileSystem (and this is a valid test-coverage gap), the actual runtime behavior does not currently have the defect claimed—notes loaded from disk are correctly skipped from dirty-detection. The potential regression scenario (setting the flag after setNoteData resolves) is not present in the shipping code.
- **[P2] Atomic-write test suite tests only the happy path: no simulated crash or error-path coverage** (`tests/electron/atomicWrites.test.js`)
  - Refuted: The finding accurately describes test coverage (happy path only), but this is not a code defect. The atomic-write implementation itself is sound: writeFileSync → renameSync is atomic, errors in writeFileSync preserve the original file, errors in renameSync leave the temp file but preserve the original. The test suite doesn't verify crash scenarios, but the code correctly implements the crash-safe mechanism as documented. A test-coverage gap is not the same as a defect in the shipping code.
- **[P2] boojy-sync-enabled persists across sign-out — re-enables sync without user gesture on next launch** (`src/hooks/useAuth.js`)
  - Refuted: The finding claims "the automatic 500ms-after-login sync fires (useSync.js line 561) without the user re-toggling the switch," but this is protected by the first-sync gate in the standard scenario. When the user signs out and closes the app, then reopens and signs back in, the first-sync gate (line 556-559) detects `!lastSyncedRef.current && noteCount > 0` (because boojy-sync-last was cleared), sets the gate flag, and returns early to show the confirmation modal instead of reaching line 561. The 500ms auto-sync only fires if the app doesn't close between sign-out and sign-in — a narrower edge case than the finding describes. The persistent `boojy-sync-enabled` is intentional per-device opt-in behavior, verified by the test at line 43 of useAuth.test.js.
- **[P3] LOSSLESS_CASES does not include a code block with 5+ backtick content run** (`tests/utils/markdown.test.js`)
  - Refuted: The claim conflates a test coverage gap with a shipping defect. The finding correctly observes that LOSSLESS_CASES lacks an explicit 5-backtick content fixture (line 102 has 3-backtick, line 107 has 4-backtick). However, the code handles 5+ backtick content correctly: tested manually, it produces a 6-backtick fence and round-trips losslessly. The serializer algorithm (longestRun + 1) is provably correct by induction and works for arbitrary lengths; the finding itself acknowledges this. The absence of an explicit 5-backtick fixture is a test-hygiene improvement, not a real defect that breaks the round-trip guarantee in shipped code.
- **[P3] useQuitFlush effect deps include stable refs — effect registers exactly once, blur listener survives HMR remounts** (`src/hooks/useQuitFlush.js`)
  - Refuted: The finding correctly observes that all four dependencies (flushToDisk, noteDataRef, editedNoteHint, hasPendingFlush) are stable refs/callbacks, and that the effect registers once in production. However, it incorrectly characterizes the HMR behavior as "fragile." In reality, the code is correct: refs created in useHistory and passed down are inherently stable within their component's lifetime, the cleanup function (unsubClose + removeEventListener) properly unsubscribes, and HMR re-registration is safe with no double-registration. This is not a fragile assumption—it's standard React hooks behavior. The test at tests/hooks/useQuitFlush.test.js line 66-72 confirms unmount cleanup works properly. No shipping defect exists.
