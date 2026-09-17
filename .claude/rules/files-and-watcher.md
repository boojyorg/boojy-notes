# Files, the watcher and persistence

How a note's file, name and folder are owned, and how the desktop app tells its own writes
from outside changes. `AGENTS.md` gotcha 4 is the summary; this file is the rules. History is
in git and `CHANGELOG.md`.

## Delete follows the platform

- Electron sends the `.md` files it manages to the OS Trash; web deletion is permanent behind
  confirmation. Folder deletion never touches a non-note file; the directory goes only once
  nothing but OS cruft (`.DS_Store`) is left, and a folder that keeps other files stays, with a
  toast.
- **Desktop asks only when the action is more than one recoverable file:** a single note goes
  at once with a quiet toast; a folder with notes and a bulk selection confirm first (`Move N
  notes to the Trash?`); a folder with no notes asks nothing. The wording lives in
  `utils/deletionPrompt.ts`; the touch ··· menu still carries its own copy (backlog).
- No undo or recovery UI, by decision: the OS Trash is the recovery surface. The retired
  private `.trash` gets one conservative startup migration into the OS Trash. Deleting a note
  that never reached disk is a no-op.

## The watcher drops only an event it can trace to the app's own operation

Three claims in `electron/fileWatcher.js`, one per kind of operation, each held until the event
that explains it; nothing about a note file is decided on the clock alone.

- **`write-note` claims the bytes it wrote** (`claimWrite(path, body)`): any later `change`/`add`
  whose file still holds exactly those bytes is that write's echo, however late. The claim ends
  at the first event showing other bytes (delivered as the change it is) or the file gone, so a
  revert *back* to those bytes, or a note put back from the Trash, is real and shown. macOS
  sends a second metadata-only `change` 1.5–2.7 s after a write; before the hash check every one
  rebuilt the note mid-typing. **Don't replace the bytes with a timer.**
- **An unlink the app causes** (a Trash move, a rename's old path, the old name of a case-only
  rename) is claimed once (`claimUnlink`) and consumed by the one unlink it produces. An
  unclaimed unlink is a real delete however soon it lands, because the app's writes never unlink
  the path they write.
- **A folder rename or removal is the one clock-decided suppression** (`claimTree`, 1.5 s over
  the old and new directory); an event that escapes re-reads what is already true.
- `watcher-ownership.spec.ts`.

## A note renamed or moved outside the app is the same note, pending edits included

The file's identity is its inode. `noteFileManager` records it with the hash of the bytes read
or written (`_identity`, in memory only) and consults it in one place, `relocateNote`, when the
watcher reports an unlink of an indexed path that no claim explains. Found elsewhere in the
vault, the index entry follows, the watcher sends `file-moved`, and `useFileSystem` adopts the
title and folder as a change of record (`adoptNoteData`) and leaves the text alone: pending
edits keep their dirty mark and flush at the new path. The `add` the rename produces is claimed
as the bytes it holds when unchanged; a file that also changed is delivered as the change it
is. Identity that cannot be established stays the delete it looks like (a move done as copy and
delete, a sync client that recreates files), and the standing rebuild writes pending edits back
under the old name. Bytes are never compared to decide identity. `external-rename.spec.ts`.

## An outside edit is never silently overwritten

- Every note that arrives from disk goes through `applyExternalNote` (useHistory), which updates
  the ref and state together; "same" is judged by the writer itself (`persistedEquals`).
- A change to a note with nothing pending is taken at once; the editor repaints only when it is
  the open note.
- **A change to a note with pending edits keeps both, on screen or not**: the outside bytes stay
  under the note's name, the local version is written first as `Title (conflicted copy
  YYYY-MM-DD)` through the ordinary write path, and only once that write has succeeded is the
  disk version adopted and the copy adopted (dirty). For the open note the editor moves to the
  copy with the caret carried through; for another note the copy is a sidebar row and a toast
  names it. A failed copy replaces nothing and says so once.
- **The news of an outside version has two sources and one handler** (`takeOutsideVersion` in
  `useFileSystem`): the watcher's `file-changed`, and a save the main process refused.
  `write-note` compares the file's bytes with the hash it last saw and, when they differ,
  writes nothing and answers `{ stale: true, note }`; reading the file in the refusal records it
  as seen, so the write after the copy goes through. Without this the save landed over an
  outside write made inside the ~800 ms commit-plus-debounce window and the watcher then
  dropped the change as the save's echo.
- **Once a conflict has been detected, the local version never goes over the outside edit's
  path.** The note is remembered as `conflicted` from the moment the conflict is seen; every
  flush (debounce, retry, blur, quit) writes it as the copy until a copy write succeeds, and a
  flush during the copy's write waits for it (`copyInFlight`). Residual: a copy that cannot be
  written inside the 2 s quit hold is lost with the quit, never resolved by overwriting.
- No merging, by decision. Undo entries for a note replaced from disk are dropped. Not covered:
  two apps writing within the same few milliseconds. `external-edit.spec.ts`.

## A dirty mark is cleared only by a write of the version the note holds now

`flush` in `useFileSystem` writes dirty notes one after another, reads each as its turn comes,
and clears a mark only if the object written is still what state or the keystroke ref holds.
Otherwise an edit landing while a bulk move's writes were in flight had its mark cleared by the
returning write and stayed on screen but not on disk. The retry after the loop covers a kept
mark with no timer pending. `write-in-flight.spec.ts`.

## Folders are directories

- **A folder in the sidebar is a directory in the vault**, as Finder and Obsidian treat it.
  Every subdirectory shows, empty or not; dot-directories and `attachments` are skipped at any
  depth. The list comes from `read-folders` at load, after an external delete, on
  `folders-changed` and on a vault change. Web keeps folders in memory.
- **The main process is the only place that knows a folder's final name** (`electron/folders.ts`,
  the same rule as `write-note` for a basename): a *new* last segment is sanitised and
  de-duplicated (`-2`), a moved folder keeps the name the disk holds, a leading dot and the
  reserved `attachments` become `_…` (the walk would skip the directory), a case-only rename is
  a rename, a path never escapes the vault (`resolveVaultDir`), and every operation answers with
  the vault-relative path. No input sanitises a folder name.
- **New folder makes the directory at once**, opens the parent and opens the inline rename.
  **A note made in a folder opens the folder.**
- **Rename and move are one `renameSync`** so notes, subfolders and other files travel
  together. Pending edits under the folder are flushed first. The note index is rewritten under
  the old prefix so IDs survive; `remapNoteFolders` follows. Not an edit: nothing becomes dirty,
  no mtime moves, the rename is not undoable.
- **Delete waits for the Trash**: notes leave state, the flush trashes them, `afterNextFlush`
  asks the main process to remove the directory if only cruft is left.
- **A folder outlives its notes** (decision D8): only Delete folder removes one.
- **A chosen vault that is missing is never recreated**: `getNotesDir` makes only the default
  vault under Documents; a configured path that is not there opens empty and every write refuses
  with the ordinary toast. Settings → Storage is the way out. `vault-root.spec.ts`,
  `folders.spec.ts`.

## A note's title is its filename

- **For every persisted desktop note, the title shown equals the Markdown basename.** `write-note`
  in `electron/noteFileManager.js` is the only place that knows the final name (collision
  suffix, invalid characters to `_`, trimmed edges, `Untitled` for blank, a leading dot to `_`,
  the volume's own casing) and answers every write with it; `useResolvedTitle` adopts a
  differing answer (`adoptNoteData`, so Cmd+Z undoes the rename itself) and repaints the title
  field, caret preserved. Don't add a sanitiser to an input.
- **A name the app makes is sanitised; a name the disk holds is kept.** `noteToFilePath`
  sanitises the title only when it differs from the indexed basename, so `Why?.md` stays; it
  never touches the folder, which is always a path the disk holds and is only checked to lie
  inside the vault (`insideVault`). `renameFolder` follows the same split. `disk-names.spec.ts`.
- **The name is a quiet file label, not a title.** A `#` heading in the body never names the
  file and the filename is never written as a heading; 14px in the chrome row, never a heading.
- **A note's own file is never a collision** (`ensureUniqueFilePath(target, ownPath)`).
- **A blank title under the caret is left alone**; it resolves on the next write or open.
  `titleFieldText()` is the one reading of the field.
- **Whitespace the filename trimmed stays under the caret**: while the field is focused only the
  characters the filesystem *changed* are painted at their offsets; the field catches up in
  full the next time it is painted from state. Chromium holds a typed trailing space as U+00A0,
  which `trim()` and the sanitiser strip alike. `title-is-filename.spec.ts`.
- The title repaints from state only when unfocused. No inline "name exists" validation.
- **A save keeps the file's permission bits** (`writeFileAtomic` copies the nine bits onto the
  temp file; a stale `.tmp` is removed first, never reopened). Birthtime, xattrs and a
  symlinked `.md` are still lost on save; don't fix by writing in place without a decision on
  the backup strategy. `file-mode.spec.ts`.

## Tracing

`BOOJY_TRACE=/path/to/log node_modules/.bin/electron .` (after `pnpm build`; real profile and
vault) appends one line per watcher event, save, external reload, keystroke target, caret move
and block repaint from both processes on one clock (`electron/trace.js`, `src/utils/trace.js`);
a no-op unless set. Quit the installed app first. `syncGeneration` is editor plumbing, not
cloud sync.
