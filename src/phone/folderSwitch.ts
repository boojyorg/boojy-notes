import type { FileOps } from "./files";

/**
 * The phone's copy of a vault belongs to one Dropbox folder of one account.
 * When the folder the app syncs (`SYNC_FOLDER`) is not the one the copy
 * belongs to, the copy is set aside before sync can start, and the new folder
 * is downloaded from nothing: synced as it stood, the old folder's notes would
 * read as new and go up into the new one.
 *
 * Setting aside moves, never deletes: the old folder's notes, bin, ids and
 * sync record go under `old-folders/`, so anything it had not yet synced can
 * be recovered. The sign-in stays. The switch is written down before the
 * first move and each move is skipped once made, so a switch cut short is
 * finished at the next start; the copy is bound to the new folder only once
 * everything has moved.
 */

const BINDING = "state/binding.json";
const SWITCH = "state/switch.json";
const ARCHIVE = "old-folders";
/** The only folder the phone synced before it remembered which. */
const FIRST_FOLDER = "test";

/** Everything that is the copy's own: its notes, its bin, and what it knows of them. */
const OWN = [
  "vault",
  "deleted",
  "state/ids.json",
  "state/deleted.json",
  "state/restored.json",
  "state/sync-record.json",
];

interface Binding {
  folder: string;
  accountId?: string;
}

interface Switch {
  from: string;
  to: string;
  accountId?: string;
  /** Where the old copy goes, chosen once so a resumed switch keeps to it. */
  into: string;
}

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const decode = <T>(bytes: Uint8Array | null): T | null =>
  bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null;

/** A name beside `path` that nothing holds yet. */
async function freePath(files: FileOps, path: string) {
  for (let n = 2; ; n++) {
    const candidate = `${path} (${n})`;
    if (!(await files.exists(candidate))) return candidate;
  }
}

/**
 * Before the vault opens or sync starts: binds the copy to `folder` (and the
 * signed-in account, when known), setting the old copy aside if it belonged to
 * another folder or another account. Run after interrupted writes are recovered.
 */
export async function settleFolder(
  files: FileOps,
  { folder, accountId, now = Date.now }: { folder: string; accountId?: string; now?: () => number },
) {
  let pending = decode<Switch>(await files.read(SWITCH));
  if (!pending) {
    const bound = decode<Binding>(await files.read(BINDING)) ?? { folder: FIRST_FOLDER };
    const otherAccount = !!(bound.accountId && accountId && bound.accountId !== accountId);
    if (bound.folder === folder && !otherAccount) {
      if (!bound.accountId && accountId) await files.write(BINDING, encode({ folder, accountId }));
      else if (!(await files.exists(BINDING))) await files.write(BINDING, encode(bound));
      return;
    }
    pending = {
      from: bound.folder,
      to: folder,
      accountId,
      into: `${ARCHIVE}/${bound.folder} ${now()}`,
    };
    await files.write(SWITCH, encode(pending));
  }
  for (const path of OWN) {
    if (!(await files.exists(path))) continue;
    const target = `${pending.into}/${path}`;
    // Already there (a move whose copy finished but whose source stayed): the
    // source still goes aside, beside it, never deleted.
    await files.rename(path, (await files.exists(target)) ? await freePath(files, target) : target);
  }
  await files.write(BINDING, encode({ folder: pending.to, accountId: pending.accountId }));
  await files.remove(SWITCH);
  // A switch resumed from an earlier start was for the folder asked for then:
  // the one asked for now is settled the same way (nothing more when it matches).
  if (pending.to !== folder || pending.accountId !== accountId) {
    await settleFolder(files, { folder, accountId, now });
  }
}
