/**
 * The two sides the sync engine joins, as interfaces. The engine never reaches
 * for a file system or the network itself: the phone (or the dev script)
 * hands it a LocalStore and a Remote, and the tests hand it fakes of both.
 *
 * Paths are relative to the vault root, `/`-separated, as the user sees them.
 * Dropbox compares paths without regard to case, so the engine keys every
 * file by `keyOf(path)`.
 */

/** A file as Dropbox holds it. `hash` is Dropbox's `content_hash`. */
export interface RemoteFile {
  kind: "file";
  path: string;
  id: string;
  rev: string;
  hash: string;
}

export interface RemoteFolder {
  kind: "folder";
  path: string;
}

/** A path that no longer exists. For a folder it stands for everything under it. */
export interface RemoteDeleted {
  kind: "deleted";
  path: string;
}

export type RemoteEntry = RemoteFile | RemoteFolder | RemoteDeleted;

/** One page of a listing. `hasMore` means the listing is not finished yet. */
export interface ListPage {
  entries: RemoteEntry[];
  cursor: string;
  hasMore: boolean;
}

/** `add` never replaces a file; `update` replaces only the revision named. */
export type WriteMode = { kind: "add" } | { kind: "update"; rev: string };

export interface Remote {
  /** A full listing of the vault, from its first page. */
  list(): Promise<ListPage>;
  /** The next page, or what changed since `cursor`. Throws CursorResetError. */
  listContinue(cursor: string): Promise<ListPage>;
  /** Throws RemoteNotFoundError. */
  download(path: string): Promise<{ file: RemoteFile; bytes: Uint8Array }>;
  /** Throws RemoteConflictError when the mode's condition fails. */
  upload(path: string, bytes: Uint8Array, mode: WriteMode): Promise<RemoteFile>;
  /**
   * Moves the file whose Dropbox id is `id` (wherever it now is) to `to`: by
   * id, never by its old path, which the Mac may have given to a new file
   * since. Throws RemoteNotFoundError, or RemoteConflictError when `to` exists.
   */
  move(id: string, to: string): Promise<RemoteFile>;
  /** Deletes only if the file is still at `rev`, else RemoteConflictError. */
  remove(path: string, rev: string): Promise<void>;
  /** Succeeds when the folder already exists. */
  createFolder(path: string): Promise<void>;
}

/** The condition on an upload, move or delete did not hold: someone else got there first. */
export class RemoteConflictError extends Error {
  name = "RemoteConflictError";
}

export class RemoteNotFoundError extends Error {
  name = "RemoteNotFoundError";
}

/** The cursor is too old to continue from; list again from the start. */
export class CursorResetError extends Error {
  name = "CursorResetError";
}

/** The phone's copy of the vault, plus a place to keep the sync record. */
export interface LocalStore {
  /** Every file and folder in the vault (the record itself is not one of them). */
  list(): Promise<{ files: string[]; folders: string[] }>;
  read(path: string): Promise<Uint8Array | null>;
  /**
   * Writes `bytes` whole (temporary file, then rename) only if `path` still
   * holds bytes with content hash `expected`, or is absent when `expected` is
   * null. Returns false, writing nothing, when the file changed meanwhile.
   * Creates missing parent folders.
   */
  writeIfUnchanged(path: string, bytes: Uint8Array, expected: string | null): Promise<boolean>;
  /** Removes `path` only if it still holds bytes with content hash `expected`. */
  removeIfUnchanged(path: string, expected: string): Promise<boolean>;
  /** Fails if `to` exists. */
  rename(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  makeFolder(path: string): Promise<void>;
  removeFolderIfEmpty(path: string): Promise<void>;
  loadRecord(): Promise<string | null>;
  /** Replaces the record whole, so a crash leaves the previous one. */
  saveRecord(text: string): Promise<void>;
}

/** Dropbox's comparison key for a path. */
export const keyOf = (path: string) => path.toLowerCase();
