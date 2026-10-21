# Files, the watcher and persistence

## Delete follows the platform

- Electron sends `.md` files to the OS Trash; **Recently Deleted is the recovery surface**: the
  note's last text and history kept 30 days, shown read-only; restored where it was (folder
  remade, `-2` on a clash, same id). `recently-deleted.spec.ts`. A folder's directory goes only
  once just OS cruft is left; non-note files are never touched.
- **The phone's bin**: `deleted/<when>/<path>`; a crash between steps leaves the note in one
  place; a restore is handed to sync (`restored`). `recentlyDeleted.test.ts`.
- **The phone's copy is one account's folder**: a change sets it aside (`old-folders/`)
  before sync, resumably. `folderSwitch.test.ts`.
- Desktop confirms only several files; one note goes at once, its toast with Undo.

## The watcher drops only an event it can trace to the app's own operation

`electron/fileWatcher.js`. **One watch for the whole vault**
(`treeWatcher.ts`, a recursive `fs.watch`), never a file open per note (it blocked iCloud
eviction). `watcher-scale.spec.ts`.

- **`write-note` claims the bytes it wrote**: a later event whose file holds exactly those bytes
  is the echo, however late; the claim ends at the first other bytes or the file gone.
- **An unlink the app causes** (Trash, a rename's old path) is claimed once and consumed. A
  Trash move's end forgets the file and looks again (`unlinkDone`; a quick Put Back was lost).
  An unclaimed unlink is real, however soon.
- A folder rename, removal or copy is the one timed suppression (`claimTree`).
  `watcher-ownership.spec.ts`.
- **A sync folder**: a version renamed over a note is an outside edit, a conflicted copy is
  its own note, `Icon\r` is clutter, the temp file is `.~name.tmp` (never synced).
  `cloud-sync.spec.ts`.
- **An offloaded (dataless) note is never read unasked** (reading downloads it): greyed by
  name, downloaded on open; a save fetches its text first. `offloaded-notes.spec.ts`.
- **A file that can't be edited as text is listed, never hidden or written** (`unreadable`):
  greyed, a view in its place; a rename moves the file. `unreadable-notes.spec.ts`.

## An outside rename or move is the same note

Identity is the inode (`_identity`, memory only), consulted only in
`relocateNote` for an unclaimed unlink. Found elsewhere in the vault, the note follows
(`file-moved` → `adoptNoteData`), pending edits kept and flushed at the new path. No inode match
stays a delete. Never compare bytes to decide identity. `external-rename.spec.ts`.

## An outside edit is never silently overwritten

- Everything from disk goes through `applyExternalNote`; "same" is judged by the writer
  (`persistedEquals`). No pending edits: take it at once.
- **Pending edits: keep both.** The local version is written first as `Title (conflicted copy
  YYYY-MM-DD)`; the disk version is adopted only once that succeeds, so a failed copy replaces
  nothing.
- **`write-note` refuses a stale save** (bytes differ from the last seen hash:
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
- Rename and move are one `renameSync`, after flushing edits under it; not undoable. Delete waits for the Trash flush. A folder outlives its notes.
- Duplicate folder: one directory copy (`Name (copy)`), adopted from disk.
- **A missing chosen vault is never recreated**; writes refuse.
- **Storage locations** (`electron/vaults.ts`): `open-vault` takes only a listed, present path.
  Remove never touches the folder; **Rename is a label (`vaultLabels`), never the folder's
  name**: other apps may point at it.
- **Files that are not notes** (`read-other-files`) are listed, never watched: re-read with the
  folders and on window focus. `trash-file` refuses a note (notes go by id, `trash-note`).
  `vault-switcher.spec.ts`.
- **First run** (`settleSetupState`): a config or `Documents/Boojy/Notes` means an existing
  user; else the default folder waits for `complete-setup`. `vault-root.spec.ts`,
  `first-run.spec.ts`.

## A note's title is its filename

- **`write-note` is the only place that knows the final name** (collision suffix, `_` for
  invalid characters and Windows device names, trim, `Untitled`, leading dot, 200-byte cut,
  volume casing) and answers every write; `useResolvedTitle` adopts it. **Don't add a
  sanitiser to an input.**
- A name the app makes is sanitised; a name the disk holds is kept (`Why?.md` stays).
  `disk-names.spec.ts`.
- A note's own file is never its own collision (`ensureUniqueFilePath(target, ownPath)`).
- **The name field is the user's while focused**: answers are adopted on blur (`settleTitle`).
  A new note starts blank with an `Untitled` placeholder. `title-is-filename.spec.ts`.
- A save keeps the mode, on macOS xattrs and birthtime (`cp -p`); a symlink is written
  through. `file-mode.spec.ts`.
- **A rename moves the file first**, then the index, then the text: one file at every instant,
  its id kept through a crash. **Unchanged text is not rewritten**: a sync client takes the
  swapped-in file for a new one. A leftover `.~Name.md.tmp` goes if superseded, else becomes a
  `(recovered <date>)` note. `atomicWrites.test.js`, `leftoverTemps.test.ts`.

## Attachments

Loaded as `boojy-att://vault/<name>` with each path segment percent-encoded, name in the
**path, never the host** (Chromium refuses spaces and brackets there), served only through
`insideVault`. `attachment-names.spec.ts`.
**The phone loads from Capacitor's vault address**, which can't say whether a file exists, so
a picture tries the desktop's two places in turn (`useAttachmentSrc`). `attachmentUrl.test.js`.

## Version history keeps what the file held

- **A version is the file's text, taken where it is written or read** (`electron/history.ts`,
  fed by `write-note` and `parseNoteFile`), never the editor's state: a restore can only bring
  back what the file was. Kept outside the vault (`userData/history/`).
- **What makes one**: a session's end, a note's text before its first edit, and before a large
  delete, an outside change, Replace All or a restore; `⌘S` makes a save point. Nothing
  unchanged is kept twice.
- **Save points are kept for good; Autosaves over a month thin to a day's last.**
- **The list is the ··· menu in place** (`VersionHistoryList`); a chosen version shows
  read-only. A restore keeps the note's text first (`Before restore`) and is one commit, so ⌘Z
  takes it back. `version-history.spec.ts`.
- **A note renamed while the app was closed keeps its id** if it holds the text its history
  last kept. `version-store.spec.ts`, `history.test.ts`.

## Tracing

`BOOJY_TRACE=/path/to/log node_modules/.bin/electron .` (after `pnpm build`, app quit) logs
both processes on one clock. `syncGeneration` is editor plumbing, not sync.
