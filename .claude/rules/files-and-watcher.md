# Files, the watcher and persistence

Rule + one reason + the proving spec. `AGENTS.md` gotcha 4 is the summary. History is in git.

## Delete follows the platform

- Electron sends `.md` files to the OS Trash (the recovery surface; no undo UI). Web deletion is
  permanent behind confirmation. A folder's directory goes only once nothing but OS cruft is
  left; non-note files are never touched.
- Desktop confirms only more than one file (a folder with notes, a bulk selection); a single
  note goes at once with a toast. Wording in `utils/deletionPrompt.ts`.

## The watcher drops only an event it can trace to the app's own operation

`electron/fileWatcher.js`, never decided on the clock alone:

- **`write-note` claims the bytes it wrote**: a later event whose file holds exactly those bytes
  is the echo, however late (macOS sends a metadata `change` up to ~3 s after). The claim ends at
  the first event showing other bytes or the file gone. **Don't replace the bytes with a timer.**
- **An unlink the app causes** (Trash, a rename's old path) is claimed once and consumed. An
  unclaimed unlink is real, however soon.
- A folder rename, removal or copy is the one timed suppression (`claimTree`, 1.5 s).
- `watcher-ownership.spec.ts`.
- **A vault in a sync folder**: a version renamed over a note is an outside edit, a sync
  client's conflicted copy is its own note, `Icon\r` is OS clutter, and the save's temp file
  is `.~name.tmp` (a prefix Dropbox never syncs). `cloud-sync.spec.ts`.

## An outside rename or move is the same note

Identity is the inode (`_identity` in `noteFileManager`, memory only), consulted only in
`relocateNote` for an unclaimed unlink. Found elsewhere in the vault, the note follows
(`file-moved` → `adoptNoteData`), pending edits kept and flushed at the new path. No inode match
stays a delete. Never compare bytes to decide identity. `external-rename.spec.ts`.

## An outside edit is never silently overwritten

- Everything from disk goes through `applyExternalNote`; "same" is judged by the writer
  (`persistedEquals`). No pending edits: take it at once.
- **Pending edits: keep both.** The local version is written first as `Title (conflicted copy
  YYYY-MM-DD)`; only once that write succeeds is the disk version adopted. A failed copy
  replaces nothing.
- **`write-note` refuses a stale save** (the file's bytes differ from the last seen hash:
  `{ stale: true, note }`); the refusal and the watcher both land in `takeOutsideVersion`.
- **Once conflicted, the local version never goes over the outside path**: every flush writes
  the copy until one succeeds (`copyInFlight`). No merging, by decision. `external-edit.spec.ts`.

## A dirty mark is cleared only by a write of the version the note holds now

`flush` clears a mark only if the object written is still what state or the ref holds, or an
edit landing mid-write is lost from disk. `write-in-flight.spec.ts`.

## Folders are directories

- Every subdirectory shows, empty or not; dot-directories and `attachments` are skipped.
- **The main process alone names folders** (`electron/folders.ts`): sanitises and de-duplicates
  a new last segment, keeps a moved folder's disk name, never escapes the vault
  (`resolveVaultDir`), answers with the final path. No input sanitises a folder name.
- Rename and move are one `renameSync`, after flushing pending edits under the folder; not an
  edit, not undoable. Delete waits for the Trash flush. A folder outlives its notes.
- Duplicate folder is one directory copy (`Name (copy)`); the copies are adopted from disk with
  fresh ids via `applyExternalNote`, nothing dirty. The copy is revealed and pill-marked in the
  sidebar, never toasted.
- **A missing chosen vault is never recreated**; writes refuse with the ordinary toast.
- **Storage locations** (`electron/vaults.ts`, code says vault): config's `vaults` lists them;
  `add-vault` adds from the native picker without switching; `open-vault` takes only a listed,
  present path. A never-made default is not listed. Remove from list never touches the folder.
  A switch flushes, empties, reloads.
- **Files that are not notes** (`read-other-files`) are listed, never watched: re-read with the
  folders and on window focus. `trash-file` refuses a note (notes go by id through `trash-note`,
  which keeps the index and the watcher's claim). `vault-switcher.spec.ts`.
- **First run** (`settleSetupState`): an existing config or `Documents/Boojy/Notes` means an
  existing user; otherwise the default folder is not made until `complete-setup`. Tests use
  `firstRun` in `launchApp`. `folders.spec.ts`, `vault-root.spec.ts`, `first-run.spec.ts`.

## A note's title is its filename

- **`write-note` is the only place that knows the final name** (collision suffix, `_` for
  invalid characters, trim, `Untitled`, leading dot, 200-byte UTF-8 cut, volume casing) and
  answers every write; `useResolvedTitle` adopts it. **Don't add a sanitiser to an input.**
- A name the app makes is sanitised; a name the disk holds is kept (`Why?.md` stays).
  `disk-names.spec.ts`.
- A note's own file is never its own collision (`ensureUniqueFilePath(target, ownPath)`).
- **The name field is the user's while focused**: answers are held and adopted on blur
  (`settleTitle`); nothing is painted into a focused field. A new note starts blank with an
  `Untitled` placeholder. A paste into the name keeps its first non-empty line.
  `title-is-filename.spec.ts`.
- A save keeps the file's permission bits (`writeFileAtomic`); birthtime, xattrs and symlinks
  are still lost (needs a backup-strategy decision). `file-mode.spec.ts`.

## Attachments

Loaded as `boojy-att://vault/<name>` with each path segment percent-encoded, name in the
**path, never the host** (Chromium refuses spaces and brackets in a host), served only through
`insideVault`. `attachment-names.spec.ts`.

## Version history keeps what the file held

- **A version is the file's text, taken where it is written or read** (`electron/history.ts`,
  fed by `write-note` and `parseNoteFile`), never the editor's state: a restore can only bring
  back what the file was. Kept outside the vault (`userData/history/`): gzipped texts named by
  hash, an append-only log per note id.
- **What makes one**: a session's end (the note left, the window closed, 30 minutes without a
  write; within the hour it replaces the last session's), a note's text before its first edit,
  and before a large delete, an outside change, Replace All or a restore; `⌘S` makes a save
  point (`useSavePoint`). Nothing unchanged is kept twice. None is announced but `⌘S`'s, the
  one toast whose words are a button: they open its name field, as `⌘S` again does.
- **Save points are kept for good; Autosaves over a month thin to a day's last.** Naming an
  Autosave makes it a save point. A deleted note keeps its last text for 30 days. History off
  keeps nothing new; turning it off with Delete removes the texts at once.
- **A note renamed while the app was closed keeps its id** when it holds exactly the text its
  history last kept (`_adoptable`). `version-store.spec.ts`, `history.test.ts`.

## Tracing

`BOOJY_TRACE=/path/to/log node_modules/.bin/electron .` (after `pnpm build`) logs watcher
events, saves, reloads, keystrokes, caret moves and repaints from both processes on one clock.
Quit the installed app first. `syncGeneration` is editor plumbing, not cloud sync.
