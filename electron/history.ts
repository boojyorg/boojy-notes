import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { app, ipcMain } from "electron";
import { writeFileAtomic } from "./atomicWrite.js";
import { trace } from "./trace.js";

// ─── Version history ───
// Every note's past, kept outside the vault beside the note index (a vault is
// the user's folder; opening one never writes into it). A version is the text
// the note's file held, exactly: it is taken at the write seam, from the bytes
// `write-note` put on disk, or from what a read found there, never from the
// editor's state. So a version can only ever be something the file really was.
//
// The store is git's idea, not git: each text is kept once, gzipped, named by
// its hash (`objects/`), and each note has an append-only log of what happened
// to it (`notes/<id>.jsonl`). Nothing is rewritten in place except by the
// thinning pass, which writes a whole log atomically.
//
// What makes a version:
// - a session's end (the note left, the window closed, 30 minutes without a
//   write): an Autosave, replacing the previous session's if that is under an
//   hour old, so short breaks don't make rows;
// - a risky moment, before it happens: a large delete, a change from outside
//   the app, Replace All, a restore;
// - ⌘S: a save point, the one kind the user makes.
// Autosaves older than a month thin to one a day; save points are kept for
// good. A deleted note's history outlives it by 30 days (Recently Deleted).

export interface Version {
  id: string;
  at: number;
  kind: "auto" | "point";
  hash: string;
  name?: string;
  reason?: string;
  /** How the version came to be: a session's end (the only kind merged), a
   *  session's baseline, a safety save or a save point. */
  src?: "session" | "base" | "safety" | "point";
}

type Op =
  | { op: "add"; v: Version }
  | { op: "drop"; id: string }
  | { op: "name"; id: string; name: string }
  | { op: "off" }
  | { op: "on" }
  | { op: "deleted"; at: number }
  | { op: "undeleted" };

interface NoteLog {
  versions: Version[]; // oldest first
  off: boolean;
  deletedAt: number | null;
}

interface Head {
  text: string;
  hash: string;
  session: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** A session is over after this long without a write to the note. */
const SESSION_IDLE_MS = Number(process.env.BOOJY_SESSION_IDLE_MS) || 30 * 60 * 1000;
/** A session that ends this soon after the last one replaces its Autosave. */
const MERGE_MS = HOUR;
/** Leaving a note ends its session once the leaving write has had time to land. */
const LEAVE_GRACE_MS = 3000;
const THIN_AFTER_MS = 30 * DAY;
const DELETED_KEEP_MS = 30 * DAY;
/** A write that takes out this much text, or a third of the note, is a large delete. */
const LARGE_DELETE_CHARS = 200;

const NOTE_ID = /^[A-Za-z0-9_-]{1,120}$/;

let _rootOverride: string | null = null;
let _clock: () => number = () => Date.now();
let _vaultDir: string | null = null;
const _logs = new Map<string, NoteLog>();
const _heads = new Map<string, Head>();

export const hashText = (text: string): string =>
  crypto.createHash("sha256").update(text).digest("hex");

/** Tests point the store at a temp dir and drive the clock. */
export function setHistoryRoot(dir: string | null): void {
  _rootOverride = dir;
}
export function setClock(clock: (() => number) | null): void {
  _clock = clock || (() => Date.now());
}

function vaultKey(notesDir: string): string {
  return crypto.createHash("sha1").update(path.resolve(notesDir)).digest("hex").slice(0, 12);
}

function storeDir(): string | null {
  if (!_vaultDir) return null;
  let root = _rootOverride;
  try {
    root ??= path.join(app.getPath("userData"), "history");
  } catch {
    return null; // no app (a unit test of another module): history stands aside
  }
  return path.join(root, vaultKey(_vaultDir));
}

function logPath(id: string): string | null {
  const dir = storeDir();
  return dir && NOTE_ID.test(id) ? path.join(dir, "notes", `${id}.jsonl`) : null;
}

function objectPath(hash: string): string | null {
  const dir = storeDir();
  return dir && /^[0-9a-f]{64}$/.test(hash)
    ? path.join(dir, "objects", hash.slice(0, 2), `${hash}.gz`)
    : null;
}

// ─── Reading and writing the store ───

function foldLog(lines: string[]): NoteLog {
  const log: NoteLog = { versions: [], off: false, deletedAt: null };
  for (const line of lines) {
    let op: Op;
    try {
      op = JSON.parse(line);
    } catch {
      continue; // a torn last line from a crash: everything before it stands
    }
    if (op.op === "add") log.versions.push(op.v);
    else if (op.op === "drop") log.versions = log.versions.filter((v) => v.id !== op.id);
    else if (op.op === "name") {
      const v = log.versions.find((x) => x.id === op.id);
      if (v) {
        if (op.name) v.name = op.name;
        else delete v.name;
        // Naming an Autosave makes it the user's: kept for good, never thinned.
        if (op.name) {
          v.kind = "point";
          v.src = "point";
        }
      }
    } else if (op.op === "off") log.off = true;
    else if (op.op === "on") log.off = false;
    else if (op.op === "deleted") log.deletedAt = op.at;
    else if (op.op === "undeleted") log.deletedAt = null;
  }
  return log;
}

function readLog(id: string): NoteLog {
  const cached = _logs.get(id);
  if (cached) return cached;
  const file = logPath(id);
  let lines: string[] = [];
  if (file) {
    try {
      lines = fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);
    } catch {
      /* no history yet */
    }
  }
  const log = foldLog(lines);
  _logs.set(id, log);
  return log;
}

function append(id: string, op: Op): void {
  const file = logPath(id);
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(op)}\n`);
  _logs.set(id, foldLog([...serialise(readLog(id)), JSON.stringify(op)]));
}

/** A log as the ops that rebuild it: the compact form thinning writes. */
function serialise(log: NoteLog): string[] {
  const lines = log.versions.map((v) => JSON.stringify({ op: "add", v }));
  if (log.off) lines.push(JSON.stringify({ op: "off" }));
  if (log.deletedAt !== null) lines.push(JSON.stringify({ op: "deleted", at: log.deletedAt }));
  return lines;
}

function rewriteLog(id: string, log: NoteLog): void {
  const file = logPath(id);
  if (!file) return;
  if (log.versions.length === 0 && !log.off && log.deletedAt === null) {
    fs.rmSync(file, { force: true });
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileAtomic(file, `${serialise(log).join("\n")}\n`);
  }
  _logs.set(id, log);
}

function putObject(text: string): string {
  const hash = hashText(text);
  const file = objectPath(hash);
  if (file && !fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, zlib.gzipSync(text));
    fs.renameSync(tmp, file);
  }
  return hash;
}

function getObject(hash: string): string | null {
  const file = objectPath(hash);
  if (!file) return null;
  try {
    return zlib.gunzipSync(fs.readFileSync(file)).toString("utf-8");
  } catch {
    return null;
  }
}

function latest(id: string): Version | undefined {
  const { versions } = readLog(id);
  return versions[versions.length - 1];
}

function addVersion(
  id: string,
  text: string,
  fields: Omit<Version, "id" | "at" | "hash">,
): Version {
  const at = _clock();
  const v: Version = {
    id: `v${at.toString(36)}${crypto.randomBytes(2).toString("hex")}`,
    at,
    hash: putObject(text),
    ...fields,
  };
  append(id, { op: "add", v });
  trace("M", "history add", id, v.kind, v.src ?? "", v.reason ?? "", `${text.length}b`);
  return v;
}

/** `text` as a new Autosave unless the latest version already holds it. */
function autosave(id: string, text: string, src: Version["src"], reason?: string): void {
  if (readLog(id).off) return;
  if (latest(id)?.hash === hashText(text)) return;
  addVersion(id, text, reason ? { kind: "auto", src, reason } : { kind: "auto", src });
}

// ─── Sessions ───

function armTimer(id: string, head: Head, ms: number): void {
  if (head.timer) clearTimeout(head.timer);
  head.timer = setTimeout(() => endSession(id), ms);
  head.timer.unref?.();
}

/**
 * Whether going from `before` to `after` took out a lot of text: what differs
 * between them, once the common start and end are set aside, is a stretch of
 * `before` that the write mostly did not replace.
 */
export function isLargeDelete(before: string, after: string): boolean {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let end = 0;
  while (end < max - start && before[before.length - 1 - end] === after[after.length - 1 - end])
    end++;
  const removed = before.length - start - end;
  const added = after.length - start - end;
  if (removed <= added * 2) return false;
  const net = removed - added;
  return net >= LARGE_DELETE_CHARS || (before.length >= 60 && net >= before.length / 3);
}

/**
 * The text a read found in the note's file. A head that differs is a change
 * from outside the app (the app's own writes set the head as they happen, and
 * their echoes never reach a read): the text it replaces is kept first.
 */
export function observe(id: string, text: string): void {
  const head = _heads.get(id);
  const hash = hashText(text);
  if (head && head.hash !== hash) {
    autosave(id, head.text, "safety", "Before an outside change");
    head.text = text;
    head.hash = hash;
    return;
  }
  if (!head) _heads.set(id, { text, hash, session: false, timer: null });
}

/** The app wrote `text` to the note's file. */
export function recordWrite(id: string, text: string): void {
  const hash = hashText(text);
  let head = _heads.get(id);
  if (!head) {
    head = { text, hash, session: false, timer: null };
    _heads.set(id, head);
  }
  if (!readLog(id).off && head.hash !== hash) {
    // The note as it stood before this session touched it, when no version
    // holds it yet (its first edit in the app, or a session a crash cut short).
    if (!head.session) autosave(id, head.text, "base");
    if (isLargeDelete(head.text, text)) autosave(id, head.text, "safety", "Before a large delete");
  }
  if (head.hash !== hash) head.session = true;
  head.text = text;
  head.hash = hash;
  if (head.session) armTimer(id, head, SESSION_IDLE_MS);
}

/**
 * The session is over: an Autosave of the note as the session left it. One
 * that follows the previous session's by under an hour takes its place.
 */
export function endSession(id: string): void {
  const head = _heads.get(id);
  if (!head) return;
  if (head.timer) clearTimeout(head.timer);
  head.timer = null;
  if (!head.session) return;
  head.session = false;
  const log = readLog(id);
  if (log.off) return;
  const last = latest(id);
  if (last?.hash === head.hash) return;
  if (last && last.src === "session" && !last.name && _clock() - last.at < MERGE_MS)
    append(id, { op: "drop", id: last.id });
  autosave(id, head.text, "session");
}

/** The note was left: its session ends once the leaving write has landed. */
export function leaveNote(id: string): void {
  const head = _heads.get(id);
  if (head?.session) armTimer(id, head, LEAVE_GRACE_MS);
}

export function endAllSessions(): void {
  for (const id of [..._heads.keys()]) endSession(id);
}

// ─── What the user asks for ───

export type SavePointResult =
  | { ok: true; id: string; at: number }
  | { ok: false; reason: "off" | "nothing" | "unknown"; at?: number };

/** ⌘S: the note as its file holds it now, as a save point. */
export function savePoint(id: string): SavePointResult {
  const head = _heads.get(id);
  if (!head) return { ok: false, reason: "unknown" };
  if (readLog(id).off) return { ok: false, reason: "off" };
  const last = latest(id);
  if (last?.kind === "point" && last.hash === head.hash)
    return { ok: false, reason: "nothing", at: last.at };
  // The session's text is now a version; the session starts afresh from it.
  head.session = false;
  if (head.timer) clearTimeout(head.timer);
  head.timer = null;
  const v = addVersion(id, head.text, { kind: "point", src: "point" });
  return { ok: true, id: v.id, at: v.at };
}

/** A safety save before something the app is about to do (Replace All, a restore). */
export function mark(id: string, reason: string): void {
  const head = _heads.get(id);
  if (head) autosave(id, head.text, "safety", reason);
}

export function nameVersion(id: string, versionId: string, name: string): boolean {
  if (!readLog(id).versions.some((v) => v.id === versionId)) return false;
  append(id, { op: "name", id: versionId, name: name.trim().slice(0, 200) });
  return true;
}

export function deleteVersion(id: string, versionId: string): boolean {
  if (!readLog(id).versions.some((v) => v.id === versionId)) return false;
  append(id, { op: "drop", id: versionId });
  return true;
}

/** Newest first, without their text. */
export function listVersions(id: string): { versions: Version[]; off: boolean } {
  const log = readLog(id);
  return { versions: [...log.versions].reverse(), off: log.off };
}

export function readVersion(id: string, versionId: string): string | null {
  const v = readLog(id).versions.find((x) => x.id === versionId);
  return v ? getObject(v.hash) : null;
}

/** History off for one note: nothing new is kept; `keep` false deletes what was. */
export function setOff(id: string, off: boolean, keep = true): void {
  const log = readLog(id);
  if (off) {
    if (!keep) {
      // Deleted means gone from disk now, not at the next launch's tidy.
      rewriteLog(id, { versions: [], off: true, deletedAt: log.deletedAt });
      tidy();
    } else if (!log.off) append(id, { op: "off" });
  } else if (log.off) append(id, { op: "on" });
}

/** The note went to the Trash: its last state is kept, and so is its history for 30 days. */
export function noteDeleted(id: string): void {
  endSession(id);
  const head = _heads.get(id);
  // Its last state, even untouched this session: Recently Deleted brings back this.
  if (head) autosave(id, head.text, "base");
  _heads.delete(id);
  if (readLog(id).versions.length) append(id, { op: "deleted", at: _clock() });
}

/** The newest version's hash, for recognising a note renamed while the app was closed. */
export function latestHash(id: string): string | null {
  return latest(id)?.hash ?? null;
}

// ─── The vault ───

/**
 * Open the store for a vault: the previous vault's sessions end, then old
 * Autosaves thin to one a day and a deleted note's history past its 30 days
 * goes, and texts no version names any more are removed.
 */
export function openVault(notesDir: string): void {
  endAllSessions();
  for (const head of _heads.values()) if (head.timer) clearTimeout(head.timer);
  _heads.clear();
  _logs.clear();
  _vaultDir = notesDir;
  try {
    tidy();
  } catch (error) {
    trace("M", "history tidy failed", String(error));
  }
}

/** Autosaves over a month old kept one a day (the day's last); save points kept. */
export function thin(versions: Version[], now: number): Version[] {
  const lastOfDay = new Map<string, string>();
  for (const v of versions) {
    if (v.kind !== "auto" || now - v.at < THIN_AFTER_MS) continue;
    lastOfDay.set(new Date(v.at).toDateString(), v.id);
  }
  return versions.filter(
    (v) =>
      v.kind !== "auto" ||
      now - v.at < THIN_AFTER_MS ||
      lastOfDay.get(new Date(v.at).toDateString()) === v.id,
  );
}

function tidy(): void {
  const dir = storeDir();
  if (!dir || !fs.existsSync(dir)) return;
  const now = _clock();
  const kept = new Set<string>();
  const notesDir = path.join(dir, "notes");
  for (const file of fs.existsSync(notesDir) ? fs.readdirSync(notesDir) : []) {
    if (!file.endsWith(".jsonl")) continue;
    const id = file.slice(0, -".jsonl".length);
    const log = readLog(id);
    if (log.deletedAt !== null && now - log.deletedAt > DELETED_KEEP_MS) {
      fs.rmSync(path.join(notesDir, file), { force: true });
      _logs.delete(id);
      continue;
    }
    const thinned = thin(log.versions, now);
    if (thinned.length !== log.versions.length) rewriteLog(id, { ...log, versions: thinned });
    for (const v of thinned) kept.add(v.hash);
  }
  const objectsDir = path.join(dir, "objects");
  for (const sub of fs.existsSync(objectsDir) ? fs.readdirSync(objectsDir) : []) {
    const subDir = path.join(objectsDir, sub);
    for (const obj of fs.readdirSync(subDir)) {
      if (!kept.has(obj.replace(/\.gz(\.tmp)?$/, "")))
        fs.rmSync(path.join(subDir, obj), { force: true });
    }
  }
}

// ─── IPC ───

/** The reasons the renderer may give for a safety save. */
const MARK_REASONS = new Set(["Before Replace All", "Before restore"]);

const isId = (x: unknown): x is string => typeof x === "string" && NOTE_ID.test(x);

export function registerHistoryIPC(): void {
  ipcMain.handle("history-save-point", (_e, id: unknown) =>
    isId(id) ? savePoint(id) : { ok: false, reason: "unknown" },
  );
  ipcMain.handle("history-name", (_e, id: unknown, versionId: unknown, name: unknown) =>
    isId(id) && typeof versionId === "string" && typeof name === "string"
      ? nameVersion(id, versionId, name)
      : false,
  );
  ipcMain.handle("history-mark", (_e, id: unknown, reason: unknown) => {
    if (isId(id) && typeof reason === "string" && MARK_REASONS.has(reason)) mark(id, reason);
  });
  ipcMain.handle("history-leave", (_e, id: unknown) => {
    if (isId(id)) leaveNote(id);
  });
  ipcMain.handle("history-list", (_e, id: unknown) =>
    isId(id) ? listVersions(id) : { versions: [], off: false },
  );
  ipcMain.handle("history-read", (_e, id: unknown, versionId: unknown) =>
    isId(id) && typeof versionId === "string" ? readVersion(id, versionId) : null,
  );
  ipcMain.handle("history-delete", (_e, id: unknown, versionId: unknown) =>
    isId(id) && typeof versionId === "string" ? deleteVersion(id, versionId) : false,
  );
  ipcMain.handle("history-set-off", (_e, id: unknown, off: unknown, keep: unknown) => {
    if (isId(id)) setOff(id, off === true, keep !== false);
  });
}
