import {
  CursorResetError,
  keyOf,
  type LocalStore,
  type ListPage,
  type Remote,
  type RemoteEntry,
  type RemoteFile,
  RemoteNotFoundError,
} from "./types";

/** A file as both sides held it at its last successful sync. */
export interface Synced {
  path: string;
  id: string;
  rev: string;
  hash: string;
}

/**
 * A clash being resolved. Written before any file is touched, so a restart
 * knows what was under way; `step` counts the steps already done:
 * 0 nothing yet, 1 the phone's version renamed to `copyPath`, 2 Dropbox's
 * version downloaded to `path`. Step 3 uploads the copy and ends the plan.
 */
export interface ClashPlan {
  path: string;
  copyPath: string;
  step: 0 | 1 | 2;
}

export interface SyncRecord {
  version: 1;
  /** Where Dropbox's change feed continues from; null before the first full listing. */
  cursor: string | null;
  /** Dropbox's files as of `cursor`, by key. Saved with the cursor, never apart from it. */
  remote: Record<string, RemoteFile>;
  remoteFolders: Record<string, string>;
  synced: Record<string, Synced>;
  /** Folders present on both sides at some sync. */
  syncedFolders: Record<string, string>;
  plan: ClashPlan | null;
}

const empty = (): SyncRecord => ({
  version: 1,
  cursor: null,
  remote: {},
  remoteFolders: {},
  synced: {},
  syncedFolders: {},
  plan: null,
});

export async function loadRecord(local: LocalStore): Promise<SyncRecord> {
  const text = await local.loadRecord();
  if (!text) return empty();
  const parsed = JSON.parse(text) as SyncRecord;
  if (parsed.version !== 1) throw new Error(`Unknown sync record version ${parsed.version}`);
  return parsed;
}

export const saveRecord = (local: LocalStore, record: SyncRecord) =>
  local.saveRecord(JSON.stringify(record));

/** One listing entry applied to a picture of Dropbox. */
function apply(
  files: Record<string, RemoteFile>,
  folders: Record<string, string>,
  entry: RemoteEntry,
) {
  const key = keyOf(entry.path);
  if (entry.kind === "file") {
    files[key] = entry;
    return;
  }
  if (entry.kind === "folder") {
    folders[key] = entry.path;
    return;
  }
  // A deleted folder is reported once, for everything under it.
  const under = `${key}/`;
  for (const k of Object.keys(files)) if (k === key || k.startsWith(under)) delete files[k];
  for (const k of Object.keys(folders)) if (k === key || k.startsWith(under)) delete folders[k];
}

/**
 * Brings the record's picture of Dropbox up to date: the change feed from
 * the saved cursor, or a full listing when there is none or Dropbox has
 * expired it. Every page is read before anything is returned, so a partial
 * listing can never make a file look deleted; a failure throws and the
 * record is left as it was.
 *
 * Before the first listing the vault's folder may not be in Dropbox yet, so
 * it is made. Once synced, a missing folder is a failure, never a vault
 * emptied: every note would otherwise look deleted.
 */
export async function discover(
  remote: Remote,
  record: SyncRecord,
): Promise<Pick<SyncRecord, "cursor" | "remote" | "remoteFolders">> {
  const { cursor } = record;
  if (cursor) {
    try {
      return await readAll(remote, () => remote.listContinue(cursor), record);
    } catch (error) {
      if (!(error instanceof CursorResetError)) throw error;
    }
  }
  const listAll = () => readAll(remote, () => remote.list(), empty());
  if (cursor) return listAll();
  try {
    return await listAll();
  } catch (error) {
    if (!(error instanceof RemoteNotFoundError)) throw error;
  }
  await remote.createFolder("");
  return listAll();
}

/** Every page from `first` on, applied to a copy of `from`'s picture. */
async function readAll(
  remote: Remote,
  first: () => Promise<ListPage>,
  from: SyncRecord,
): Promise<Pick<SyncRecord, "cursor" | "remote" | "remoteFolders">> {
  const files = { ...from.remote };
  const folders = { ...from.remoteFolders };
  let page = await first();
  for (;;) {
    for (const entry of page.entries) apply(files, folders, entry);
    if (!page.hasMore) break;
    page = await remote.listContinue(page.cursor);
  }
  return { cursor: page.cursor, remote: files, remoteFolders: folders };
}
