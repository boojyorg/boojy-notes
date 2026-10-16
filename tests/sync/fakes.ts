import { contentHash } from "../../src/sync/contentHash";
import {
  CursorResetError,
  keyOf,
  type ListPage,
  type LocalStore,
  type Remote,
  RemoteConflictError,
  type RemoteEntry,
  type RemoteFile,
  RemoteNotFoundError,
  type WriteMode,
} from "../../src/sync/types";

export const text = (s: string) => new TextEncoder().encode(s);
export const str = (b: Uint8Array | null | undefined) => (b ? new TextDecoder().decode(b) : null);

/** Thrown by a fake to stand for the app being killed. */
export class Crash extends Error {
  name = "Crash";
}

interface Failure<T> {
  op: T;
  when: "before" | "after";
  skip: number;
  error: Error;
}

/** Throws the first failure set for this call, once its skips are used up. */
function failIfDue<T>(failures: Failure<T>[], op: T, when: "before" | "after") {
  const at = failures.findIndex((f) => f.op === op && f.when === when);
  if (at < 0) return;
  if (failures[at].skip > 0) {
    failures[at].skip--;
    return;
  }
  throw failures.splice(at, 1)[0].error;
}

type Op = "list" | "listContinue" | "download" | "upload" | "move" | "remove" | "createFolder";

interface StoredFile extends RemoteFile {
  bytes: Uint8Array;
}

/**
 * Dropbox as the tests need it: paths without regard to case, a revision per
 * write, an id that survives a move, a change log the cursor points into, and
 * listings split into pages of `pageSize`. `failAt` throws before or after an
 * operation runs (after = the work is done but its answer is lost), and
 * `before` runs a hook first, standing for the Mac acting at that moment.
 */
export class FakeDropbox implements Remote {
  files = new Map<string, StoredFile>();
  folders = new Map<string, string>();
  log: RemoteEntry[] = [];
  pageSize = 1000;
  /** False stands for a vault whose folder isn't in Dropbox (yet, or any more). */
  rootExists = true;
  calls: Op[] = [];
  private nextRev = 1;
  private nextId = 1;
  private generation = 0;
  private failures: Failure<Op>[] = [];
  private hooks: { op: Op; run: () => Promise<void> | void }[] = [];

  /** Throws on the call to `op` after `skip` more calls have passed. */
  failAt(op: Op, when: "before" | "after" = "before", { skip = 0 } = {}) {
    this.failures.push({ op, when, skip, error: new Crash(op) });
  }

  before(op: Op, run: () => Promise<void> | void) {
    this.hooks.push({ op, run });
  }

  /** Cursors issued before now are refused, as Dropbox does after a long time or a big change. */
  expireCursors() {
    this.generation++;
  }

  private async enter(op: Op) {
    this.calls.push(op);
    const hook = this.hooks.findIndex((h) => h.op === op);
    if (hook >= 0) await this.hooks.splice(hook, 1)[0].run();
    failIfDue(this.failures, op, "before");
  }

  private leave(op: Op) {
    failIfDue(this.failures, op, "after");
  }

  private meta(f: StoredFile): RemoteFile {
    return { kind: "file", path: f.path, id: f.id, rev: f.rev, hash: f.hash };
  }

  private async put(path: string, bytes: Uint8Array, id?: string): Promise<RemoteFile> {
    const file: StoredFile = {
      kind: "file",
      path,
      id: id ?? `id:${this.nextId++}`,
      rev: `rev${this.nextRev++}`,
      hash: await contentHash(bytes),
      bytes,
    };
    this.files.set(keyOf(path), file);
    const meta = this.meta(file);
    this.log.push(meta);
    return meta;
  }

  private drop(path: string) {
    this.files.delete(keyOf(path));
    this.log.push({ kind: "deleted", path });
  }

  // ─── What the Mac (through Dropbox's desktop app) does ───

  async macWrite(path: string, content: string) {
    const existing = this.files.get(keyOf(path));
    return this.put(existing?.path ?? path, text(content), existing?.id);
  }

  macDelete(path: string) {
    this.drop(path);
  }

  macMove(from: string, to: string) {
    const file = this.files.get(keyOf(from));
    if (!file) throw new Error(`no ${from}`);
    this.files.delete(keyOf(from));
    this.log.push({ kind: "deleted", path: from });
    const moved = { ...file, path: to, rev: `rev${this.nextRev++}` };
    this.files.set(keyOf(to), moved);
    this.log.push(this.meta(moved));
  }

  macDeleteFolder(path: string) {
    const under = `${keyOf(path)}/`;
    for (const key of [...this.files.keys()]) if (key.startsWith(under)) this.files.delete(key);
    for (const key of [...this.folders.keys()]) {
      if (key === keyOf(path) || key.startsWith(under)) this.folders.delete(key);
    }
    this.log.push({ kind: "deleted", path });
  }

  read(path: string) {
    return str(this.files.get(keyOf(path))?.bytes);
  }

  paths() {
    return [...this.files.values()].map((f) => f.path).sort();
  }

  // ─── The API ───

  private page(
    entries: RemoteEntry[],
    from: number,
    done: string,
    next: (at: number) => string,
  ): ListPage {
    const slice = entries.slice(from, from + this.pageSize);
    const hasMore = from + this.pageSize < entries.length;
    return { entries: slice, hasMore, cursor: hasMore ? next(from + this.pageSize) : done };
  }

  private snapshots = new Map<string, RemoteEntry[]>();

  async list(): Promise<ListPage> {
    await this.enter("list");
    if (!this.rootExists) {
      this.leave("list");
      throw new RemoteNotFoundError("path/not_found/");
    }
    const entries: RemoteEntry[] = [
      ...[...this.folders.values()].map((path) => ({ kind: "folder" as const, path })),
      ...[...this.files.values()].map((f) => this.meta(f)),
    ];
    const id = `snap${this.snapshots.size}`;
    this.snapshots.set(id, entries);
    const at = this.log.length;
    const gen = this.generation;
    const result = this.page(entries, 0, `c:${gen}:${at}`, (n) => `s:${id}:${n}:${at}:${gen}`);
    this.leave("list");
    return result;
  }

  async listContinue(cursor: string): Promise<ListPage> {
    await this.enter("listContinue");
    let result: ListPage;
    if (cursor.startsWith("s:")) {
      const [, id, from, at, gen] = cursor.split(":");
      if (Number(gen) !== this.generation) throw new CursorResetError(cursor);
      const entries = this.snapshots.get(id) ?? [];
      result = this.page(
        entries,
        Number(from),
        `c:${gen}:${at}`,
        (n) => `s:${id}:${n}:${at}:${gen}`,
      );
    } else {
      const [, gen, at] = cursor.split(":");
      if (Number(gen) !== this.generation) throw new CursorResetError(cursor);
      const from = Number(at);
      const end = this.log.length;
      result = this.page(
        this.log.slice(from, end),
        0,
        `c:${gen}:${end}`,
        (n) => `c:${gen}:${from + n}`,
      );
    }
    this.leave("listContinue");
    return result;
  }

  async download(path: string) {
    await this.enter("download");
    const file = this.files.get(keyOf(path));
    if (!file) throw new RemoteNotFoundError(path);
    const result = { file: this.meta(file), bytes: file.bytes };
    this.leave("download");
    return result;
  }

  async upload(path: string, bytes: Uint8Array, mode: WriteMode) {
    await this.enter("upload");
    const existing = this.files.get(keyOf(path));
    if (mode.kind === "add" && existing) throw new RemoteConflictError(path);
    if (mode.kind === "update" && existing?.rev !== mode.rev) throw new RemoteConflictError(path);
    const file = await this.put(existing?.path ?? path, bytes, existing?.id);
    this.leave("upload");
    return file;
  }

  async move(id: string, to: string) {
    await this.enter("move");
    const file = [...this.files.values()].find((f) => f.id === id);
    if (!file) throw new RemoteNotFoundError(id);
    if (this.files.has(keyOf(to))) throw new RemoteConflictError(to);
    this.macMove(file.path, to);
    this.leave("move");
    return this.meta(this.files.get(keyOf(to)) as StoredFile);
  }

  async remove(path: string, rev: string) {
    await this.enter("remove");
    const file = this.files.get(keyOf(path));
    if (!file) throw new RemoteNotFoundError(path);
    if (file.rev !== rev) throw new RemoteConflictError(path);
    this.drop(file.path);
    this.leave("remove");
  }

  async createFolder(path: string) {
    await this.enter("createFolder");
    if (path === "") this.rootExists = true;
    else if (!this.folders.has(keyOf(path))) {
      this.folders.set(keyOf(path), path);
      this.log.push({ kind: "folder", path });
    }
    this.leave("createFolder");
  }
}

type LocalOp = "rename" | "write" | "saveRecord";

/**
 * The phone's private storage: names with case, as Android has them. `before`
 * runs a hook ahead of an operation (the person typing at that moment) and
 * `failAt` throws before or after one (the app killed there).
 */
export class FakeLocal implements LocalStore {
  files = new Map<string, Uint8Array>();
  folders = new Set<string>();
  record: string | null = null;
  private failures: Failure<LocalOp>[] = [];
  private hooks: { op: LocalOp; run: () => void }[] = [];

  failAt(op: LocalOp, when: "before" | "after" = "before", { skip = 0 } = {}) {
    this.failures.push({ op, when, skip, error: new Crash(op) });
  }

  before(op: LocalOp, run: () => void) {
    this.hooks.push({ op, run });
  }

  private enter(op: LocalOp) {
    const hook = this.hooks.findIndex((h) => h.op === op);
    if (hook >= 0) this.hooks.splice(hook, 1)[0].run();
    failIfDue(this.failures, op, "before");
  }

  private leave(op: LocalOp) {
    failIfDue(this.failures, op, "after");
  }

  /** The person writing a note on the phone. */
  type(path: string, content: string) {
    this.files.set(path, text(content));
  }

  text(path: string) {
    return str(this.files.get(path));
  }

  paths() {
    return [...this.files.keys()].sort();
  }

  async list() {
    return { files: [...this.files.keys()], folders: [...this.folders] };
  }

  async read(path: string) {
    return this.files.get(path) ?? null;
  }

  async writeIfUnchanged(path: string, bytes: Uint8Array, expected: string | null) {
    this.enter("write");
    const current = this.files.get(path);
    const currentHash = current ? await contentHash(current) : null;
    if (currentHash !== expected) return false;
    this.files.set(path, bytes);
    this.leave("write");
    return true;
  }

  async removeIfUnchanged(path: string, expected: string) {
    const current = this.files.get(path);
    if (!current || (await contentHash(current)) !== expected) return false;
    this.files.delete(path);
    return true;
  }

  async rename(from: string, to: string) {
    this.enter("rename");
    const bytes = this.files.get(from);
    if (!bytes) throw new Error(`no ${from}`);
    if (this.files.has(to)) throw new Error(`${to} exists`);
    this.files.delete(from);
    this.files.set(to, bytes);
    this.leave("rename");
  }

  async exists(path: string) {
    return this.files.has(path);
  }

  async makeFolder(path: string) {
    this.folders.add(path);
  }

  async removeFolderIfEmpty(path: string) {
    const under = `${path}/`;
    const busy =
      [...this.files.keys()].some((p) => p.startsWith(under)) ||
      [...this.folders].some((p) => p.startsWith(under));
    if (!busy) this.folders.delete(path);
  }

  async loadRecord() {
    return this.record;
  }

  async saveRecord(text: string) {
    this.enter("saveRecord");
    this.record = text;
    this.leave("saveRecord");
  }
}
