import { contentHash } from "./contentHash";
import { discover, loadRecord, type Synced, type SyncRecord, saveRecord } from "./syncRecord";
import {
  keyOf,
  type LocalStore,
  type Remote,
  RemoteConflictError,
  type RemoteFile,
  RemoteNotFoundError,
  RemoteTooLargeError,
} from "./types";

/**
 * One sync pass between the phone's copy of a vault and Dropbox.
 *
 * Every file is judged on three things: what the phone holds, what Dropbox
 * holds, and what both held at the last sync (the record). Contents are
 * compared by hash, so a pass repeated after a crash finds the work already
 * done and records it rather than copying anything twice. The record is saved
 * after every change, never before the change it describes.
 *
 * When both sides changed a file differently, both versions are kept: the
 * phone's goes up as `Name (conflicted copy YYYY-MM-DD).md`. An edit beats a
 * delete. The phone never deletes a folder in Dropbox: Dropbox cannot make a
 * folder delete conditional, so a file another device just added could go too.
 */

/** A file left alone until a person acts; the rest of the vault syncs meanwhile. */
export type Attention =
  /** Phone names that differ only in case, which Dropbox takes for one. */
  | { kind: "case"; paths: string[] }
  /** Over Dropbox's single-upload limit. */
  | { kind: "too-large"; path: string };

export interface PassResult {
  /** Something changed while the pass ran, or a condition failed: run another pass. */
  again: boolean;
  attention: Attention[];
  /** What the pass did, one line per change. */
  log: string[];
}

export interface PassDeps {
  local: LocalStore;
  remote: Remote;
  now?: () => Date;
}

interface LocalFile {
  path: string;
  hash: string;
}

/** Dot files and folders (`.DS_Store`, a save's `.~Note.md.tmp`) are never synced. */
export const isIgnored = (path: string) => path.split("/").some((part) => part.startsWith("."));

/** `2026-10-15`, in local time. */
const dayOf = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** `Note (conflicted copy 2026-10-15).md`, then `…-2.md` and on, until `taken` says no. */
export function clashCopyPath(path: string, day: string, taken: (key: string) => boolean): string {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  const hasExt = dot > slash + 1;
  const stem = hasExt ? path.slice(0, dot) : path;
  const ext = hasExt ? path.slice(dot) : "";
  for (let n = 1; ; n++) {
    const candidate = `${stem} (conflicted copy ${day})${n === 1 ? "" : `-${n}`}${ext}`;
    if (!taken(keyOf(candidate))) return candidate;
  }
}

const syncedFrom = (file: RemoteFile, hash: string): Synced => ({
  path: file.path,
  id: file.id,
  rev: file.rev,
  hash,
});

export async function syncPass({ local, remote, now = () => new Date() }: PassDeps) {
  return new Pass(local, remote, now).run();
}

class Pass {
  private record!: SyncRecord;
  private files = new Map<string, LocalFile>();
  private folders = new Map<string, string>();
  private skip = new Set<string>();
  private result: PassResult = { again: false, attention: [], log: [] };

  constructor(
    private local: LocalStore,
    private remote: Remote,
    private now: () => Date,
  ) {}

  async run(): Promise<PassResult> {
    this.record = await loadRecord(this.local);
    // The new picture of Dropbox and its cursor are saved before anything is
    // acted on, so the changes they describe are never skipped after a crash.
    Object.assign(this.record, await discover(this.remote, this.record));
    await this.save();
    await this.adoptRestored();
    if (this.record.plan) await this.finishClash();
    await this.scan();
    await this.followRemoteRenames();
    await this.sendLocalRenames();
    const keys = new Set([
      ...this.files.keys(),
      ...Object.keys(this.record.remote),
      ...Object.keys(this.record.synced),
    ]);
    for (const key of [...keys].sort()) {
      if (this.skip.has(key) || isIgnored(key)) continue;
      await this.reconcile(key);
    }
    await this.reconcileFolders();
    return this.result;
  }

  private save() {
    return saveRecord(this.local, this.record);
  }

  /**
   * Notes put back from Recently Deleted. One that Dropbox deleted while the
   * record still holds it as synced was binned by a pass that died before
   * recording it: the delete is recorded now, so the restored note reads as
   * new and goes back up, not as unchanged and deleted again. Any other
   * restore the ordinary rules already handle.
   */
  private async adoptRestored() {
    let changed = false;
    for (const path of (await this.local.takeRestored?.()) ?? []) {
      const key = keyOf(path);
      if (this.record.synced[key] && !this.record.remote[key]) {
        delete this.record.synced[key];
        changed = true;
      }
    }
    if (changed) await this.save();
  }

  private note(line: string) {
    this.result.log.push(line);
  }

  /** The phone's files, hashed. Two names that differ only in case cannot both sync. */
  private async scan() {
    this.files.clear();
    this.folders.clear();
    const { files, folders } = await this.local.list();
    const byKey = new Map<string, string[]>();
    for (const path of files) {
      if (isIgnored(path)) continue;
      const key = keyOf(path);
      byKey.set(key, [...(byKey.get(key) ?? []), path]);
    }
    for (const [key, paths] of byKey) {
      if (paths.length > 1) {
        this.skip.add(key);
        this.result.attention.push({ kind: "case", paths: paths.sort() });
        continue;
      }
      const bytes = await this.local.read(paths[0]);
      if (bytes) this.files.set(key, { path: paths[0], hash: await contentHash(bytes) });
    }
    for (const path of folders) if (!isIgnored(path)) this.folders.set(keyOf(path), path);
  }

  /**
   * A local file the record's note was renamed to on the phone: the only file
   * with no record, nothing in Dropbox at its name, and the record's contents,
   * while no other missing note shares those contents (empty notes all do).
   */
  private renamedHere(synced: Synced): LocalFile | null {
    const missing = Object.entries(this.record.synced).filter(
      ([key, s]) => s.hash === synced.hash && !this.files.has(key),
    );
    if (missing.length !== 1) return null;
    const twins = [...this.files.entries()].filter(
      ([key, f]) => f.hash === synced.hash && !this.record.synced[key] && !this.record.remote[key],
    );
    return twins.length === 1 ? twins[0][1] : null;
  }

  /** A file Dropbox now holds under another name keeps its id: the phone's copy follows it. */
  private async followRemoteRenames() {
    const byId = new Map(Object.values(this.record.remote).map((f) => [f.id, f]));
    for (const [key, synced] of Object.entries(this.record.synced)) {
      if (this.record.remote[key]?.id === synced.id) continue;
      const moved = byId.get(synced.id);
      const target = moved && keyOf(moved.path);
      if (!moved || !target || target === key || this.record.synced[target]) continue;
      if (this.files.has(target)) continue;
      // Renamed on the phone too: Dropbox's name wins, the contents are the same.
      const here = this.files.get(key) ?? this.renamedHere(synced);
      if (here) {
        await this.local.rename(here.path, moved.path);
        this.files.delete(keyOf(here.path));
        this.files.set(target, { path: moved.path, hash: here.hash });
      }
      this.record.synced[target] = { ...synced, path: moved.path };
      delete this.record.synced[key];
      await this.save();
      this.note(`renamed here: ${synced.path} → ${moved.path}`);
    }
  }

  /** A note renamed on the phone is moved in Dropbox, so the Mac sees a rename, not a new note. */
  private async sendLocalRenames() {
    for (const [key, synced] of Object.entries(this.record.synced)) {
      if (this.files.has(key)) continue;
      const there = this.record.remote[key];
      if (!there || there.id !== synced.id) continue;
      const here = this.renamedHere(synced);
      if (!here) continue;
      let file: RemoteFile;
      try {
        file = await this.remote.move(there.id, here.path);
      } catch (error) {
        if (!(error instanceof RemoteConflictError || error instanceof RemoteNotFoundError)) {
          throw error;
        }
        this.result.again = true;
        continue;
      }
      const target = keyOf(here.path);
      delete this.record.remote[key];
      delete this.record.synced[key];
      this.record.remote[target] = file;
      // Both sides held the record's contents under the new name; if Dropbox's
      // were edited meanwhile, the ordinary rules download them next.
      this.record.synced[target] = syncedFrom(file, synced.hash);
      await this.save();
      this.note(`renamed in Dropbox: ${synced.path} → ${here.path}`);
    }
  }

  private async reconcile(key: string) {
    const here = this.files.get(key) ?? null;
    const there = this.record.remote[key] ?? null;
    const synced = this.record.synced[key] ?? null;
    const hereHash = here?.hash ?? null;
    const thereHash = there?.hash ?? null;

    if (hereHash === thereHash) {
      // The same on both sides, or gone from both: only the record may need to catch up.
      if (here && there) {
        if (synced?.rev !== there.rev || synced.path !== there.path) {
          this.record.synced[key] = syncedFrom(there, there.hash);
          await this.save();
        }
      } else if (synced) {
        delete this.record.synced[key];
        await this.save();
      }
      return;
    }

    const changedHere = hereHash !== (synced?.hash ?? null);
    const changedThere = thereHash !== (synced?.hash ?? null);
    if (changedHere && !changedThere) {
      if (here) return this.upload(key, here, there);
      if (there) return this.deleteThere(key, there);
    }
    if (changedThere && !changedHere) {
      if (there) return this.download(key, here, there);
      if (here) return this.deleteHere(key, here);
    }
    // Changed on both sides, differently. An edit beats a delete.
    if (!here && there) return this.download(key, null, there);
    if (here && !there) return this.upload(key, here, null);
    if (here && there) return this.clash(key, here);
  }

  private async upload(key: string, here: LocalFile, there: RemoteFile | null) {
    const bytes = await this.local.read(here.path);
    if (!bytes) {
      this.result.again = true;
      return;
    }
    // The record takes the hash of the bytes sent, not of the file now: typing
    // during the upload leaves the note changed for the next pass.
    const hash = await contentHash(bytes);
    let file: RemoteFile;
    try {
      file = await this.remote.upload(
        there?.path ?? here.path,
        bytes,
        there ? { kind: "update", rev: there.rev } : { kind: "add" },
      );
    } catch (error) {
      if (error instanceof RemoteTooLargeError) {
        this.result.attention.push({ kind: "too-large", path: here.path });
        return;
      }
      if (!(error instanceof RemoteConflictError)) throw error;
      this.result.again = true;
      return;
    }
    this.record.remote[key] = file;
    this.record.synced[key] = syncedFrom(file, hash);
    await this.save();
    this.note(`uploaded: ${file.path}`);
  }

  private async download(key: string, here: LocalFile | null, there: RemoteFile) {
    let got: { file: RemoteFile; bytes: Uint8Array };
    try {
      got = await this.remote.download(there.path);
    } catch (error) {
      if (!(error instanceof RemoteNotFoundError)) throw error;
      this.result.again = true;
      return;
    }
    const hash = await contentHash(got.bytes);
    // Written only over what the pass saw: a note edited since is left alone,
    // and the next pass judges the two versions.
    if (
      !(await this.local.writeIfUnchanged(
        here?.path ?? got.file.path,
        got.bytes,
        here?.hash ?? null,
      ))
    ) {
      this.result.again = true;
      return;
    }
    this.record.remote[key] = got.file;
    this.record.synced[key] = syncedFrom(got.file, hash);
    await this.save();
    this.note(`downloaded: ${got.file.path}`);
  }

  private async deleteThere(key: string, there: RemoteFile) {
    try {
      await this.remote.remove(there.path, there.rev);
    } catch (error) {
      if (error instanceof RemoteConflictError) {
        this.result.again = true;
        return;
      }
      if (!(error instanceof RemoteNotFoundError)) throw error;
    }
    delete this.record.remote[key];
    delete this.record.synced[key];
    await this.save();
    this.note(`deleted in Dropbox: ${there.path}`);
  }

  private async deleteHere(key: string, here: LocalFile) {
    if (!(await this.local.removeIfUnchanged(here.path, here.hash))) {
      this.result.again = true;
      return;
    }
    delete this.record.synced[key];
    await this.save();
    this.note(`deleted here: ${here.path}`);
  }

  /** Both changed: write down the plan, then carry it out. */
  private async clash(key: string, here: LocalFile) {
    const taken = (k: string) =>
      this.files.has(k) || k in this.record.remote || k in this.record.synced;
    const copyPath = clashCopyPath(here.path, dayOf(this.now()), taken);
    this.record.plan = { path: here.path, copyPath, step: 0 };
    await this.save();
    await this.finishClash();
    this.skip.add(key);
    this.skip.add(keyOf(copyPath));
  }

  /**
   * Carries a clash plan through from whatever step it reached. Each step is
   * checked against the files themselves, so a crash between a step and its
   * tick in the record is found and not repeated.
   */
  private async finishClash() {
    const plan = this.record.plan;
    if (!plan) return;
    if (plan.step === 0) {
      if (!(await this.local.exists(plan.copyPath))) {
        if (!(await this.local.exists(plan.path))) {
          this.record.plan = null;
          await this.save();
          return;
        }
        await this.local.rename(plan.path, plan.copyPath);
      }
      plan.step = 1;
      await this.save();
    }
    if (plan.step === 1) {
      const key = keyOf(plan.path);
      try {
        const got = await this.remote.download(plan.path);
        const hash = await contentHash(got.bytes);
        const placed =
          (await this.local.writeIfUnchanged(plan.path, got.bytes, null)) ||
          (await this.hashOf(plan.path)) === hash;
        if (placed) {
          this.record.remote[key] = got.file;
          this.record.synced[key] = syncedFrom(got.file, hash);
        } else {
          // A new note took the name meanwhile; the next pass judges it.
          this.result.again = true;
        }
      } catch (error) {
        if (!(error instanceof RemoteNotFoundError)) throw error;
        delete this.record.synced[key];
      }
      plan.step = 2;
      await this.save();
    }
    const bytes = await this.local.read(plan.copyPath);
    if (bytes) {
      const hash = await contentHash(bytes);
      try {
        const file = await this.remote.upload(plan.copyPath, bytes, { kind: "add" });
        this.record.remote[keyOf(file.path)] = file;
        this.record.synced[keyOf(file.path)] = syncedFrom(file, hash);
      } catch (error) {
        if (error instanceof RemoteTooLargeError) {
          // The copy stays on the phone, a file with no record, and each pass
          // holds it back as any other file too big.
          this.result.attention.push({ kind: "too-large", path: plan.copyPath });
        } else if (error instanceof RemoteConflictError) {
          // Already there (an upload whose answer was lost): the next pass
          // compares the two and records them if they match.
          this.result.again = true;
        } else throw error;
      }
    }
    this.note(`kept both: ${plan.path} and ${plan.copyPath}`);
    this.record.plan = null;
    await this.save();
  }

  private async hashOf(path: string) {
    const bytes = await this.local.read(path);
    return bytes ? contentHash(bytes) : null;
  }

  /**
   * Folders exist on both sides, so an empty one shows everywhere. A folder
   * gone from Dropbox goes here once it is empty; a folder gone here stays in
   * Dropbox, and the record keeps it from coming back.
   */
  private async reconcileFolders() {
    const { remoteFolders, syncedFolders } = this.record;
    const keys = new Set([
      ...this.folders.keys(),
      ...Object.keys(remoteFolders),
      ...Object.keys(syncedFolders),
    ]);
    let changed = false;
    // Deepest first, so a folder is emptied of its folders before it is judged.
    for (const key of [...keys].sort((a, b) => b.length - a.length)) {
      if (isIgnored(key)) continue;
      const here = this.folders.get(key);
      const there = remoteFolders[key];
      const known = key in syncedFolders;
      if (here && there) {
        if (!known) syncedFolders[key] = there;
      } else if (here) {
        if (known) {
          await this.local.removeFolderIfEmpty(here);
          delete syncedFolders[key];
        } else {
          await this.remote.createFolder(here);
          remoteFolders[key] = here;
          syncedFolders[key] = here;
        }
      } else if (there) {
        if (!known) {
          await this.local.makeFolder(there);
          syncedFolders[key] = there;
        }
      } else if (known) {
        delete syncedFolders[key];
      }
      changed = true;
    }
    if (changed) await this.save();
  }
}
