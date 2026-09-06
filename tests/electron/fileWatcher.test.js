import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp") },
  ipcMain: { handle: vi.fn() },
}));

const {
  suppressNextUnlink,
  releaseUnlinkSuppression,
  suppressWatcher,
  suppressWatcherTree,
  isWriteSuppressed,
  isOwnEcho,
  isOwnWriteEvent,
} = await import("../../electron/fileWatcher.js");

// The unlink suppression must be consumed by the event (or an explicit
// release), NOT a short fixed timer — shell.trashItem() latency is unbounded,
// and an expired suppression would let our own delete masquerade as an
// external one and trigger the renderer's full-state rebuild.
describe("unlink suppression", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds until explicitly released, well past the old 1500ms write-suppression window", () => {
    suppressNextUnlink("/notes/Slow.md");

    vi.advanceTimersByTime(30_000);

    expect(releaseUnlinkSuppression("/notes/Slow.md")).toBe(true);
  });

  it("is consumed exactly once", () => {
    suppressNextUnlink("/notes/Note.md");

    expect(releaseUnlinkSuppression("/notes/Note.md")).toBe(true);
    expect(releaseUnlinkSuppression("/notes/Note.md")).toBe(false);
  });

  it("expires via the leak-guard fallback if no unlink ever arrives", () => {
    suppressNextUnlink("/notes/Never-deleted.md");

    vi.advanceTimersByTime(60_000);

    expect(releaseUnlinkSuppression("/notes/Never-deleted.md")).toBe(false);
  });
});

// Write suppression is one resettable timer per PATH, not one timer per write.
// With per-write timers on a shared set, the first write's timer expired and
// un-suppressed a path a later write still relied on: two saves 1.15–1.5s apart
// let the second echo through, and the renderer rebuilt the note from disk —
// caret to the top of the note, keystrokes since the write lost (2026-09-03).
describe("write suppression", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("expires 1500ms after a lone write", () => {
    suppressWatcher("/notes/Note.md");

    vi.advanceTimersByTime(1499);
    expect(isWriteSuppressed("/notes/Note.md")).toBe(true);

    vi.advanceTimersByTime(1);
    expect(isWriteSuppressed("/notes/Note.md")).toBe(false);
  });

  it("keeps a path suppressed for the full window after the LATEST write", () => {
    suppressWatcher("/notes/Note.md");
    vi.advanceTimersByTime(1300);
    suppressWatcher("/notes/Note.md");

    // The first write's window would have ended here; the echo of the second
    // write lands ~350ms after it, i.e. right inside this gap
    vi.advanceTimersByTime(350);
    expect(isWriteSuppressed("/notes/Note.md")).toBe(true);

    vi.advanceTimersByTime(1149);
    expect(isWriteSuppressed("/notes/Note.md")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isWriteSuppressed("/notes/Note.md")).toBe(false);
  });

  it("tracks paths independently", () => {
    suppressWatcher("/notes/A.md");
    vi.advanceTimersByTime(1000);
    suppressWatcher("/notes/B.md");
    vi.advanceTimersByTime(600);

    expect(isWriteSuppressed("/notes/A.md")).toBe(false);
    expect(isWriteSuppressed("/notes/B.md")).toBe(true);
  });
});

// A folder rename or removal is one operation the app already knows the
// outcome of, reported by chokidar as one event per file underneath. The whole
// subtree is suppressed for the write window, the directory itself included.
describe("subtree suppression", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("covers the directory and everything under it, and nothing beside it", () => {
    suppressWatcherTree("/notes/Work");

    expect(isWriteSuppressed("/notes/Work")).toBe(true);
    expect(isWriteSuppressed("/notes/Work/Note.md")).toBe(true);
    expect(isWriteSuppressed("/notes/Work/Deep/Note.md")).toBe(true);
    expect(isWriteSuppressed("/notes/Workshop/Note.md")).toBe(false);
    expect(isWriteSuppressed("/notes/Other.md")).toBe(false);
  });

  it("expires with the write window", () => {
    suppressWatcherTree("/notes/Work");
    vi.advanceTimersByTime(1499);
    expect(isWriteSuppressed("/notes/Work/Note.md")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isWriteSuppressed("/notes/Work/Note.md")).toBe(false);
  });
});

// The timer is not the whole story. macOS delivers a second `change` for one
// of our writes 1.5–2.7s later — the file's mtime and size are those of our
// write, only the inode change time has moved (metadata, not content) — which
// is past any window the timer could reasonably hold. Traced live on the
// daily driver 2026-09-05: every such event rebuilt the note from disk
// mid-typing. A write therefore also records the bytes it wrote, and an event
// whose file still holds exactly those bytes is an echo whenever it arrives.
describe("own-write echo by content", () => {
  let dir;
  beforeEach(() => {
    vi.useFakeTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-watcher-"));
  });
  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("recognises the written bytes long after the timer window", () => {
    const file = path.join(dir, "Note.md");
    suppressWatcher(file, "hello\n");
    fs.writeFileSync(file, "hello\n");

    vi.advanceTimersByTime(10_000);

    expect(isWriteSuppressed(file)).toBe(false);
    expect(isOwnEcho(file)).toBe(true);
  });

  it("lets a real outside edit through", () => {
    const file = path.join(dir, "Note.md");
    suppressWatcher(file, "hello\n");
    fs.writeFileSync(file, "hello from another editor\n");

    vi.advanceTimersByTime(10_000);

    expect(isOwnEcho(file)).toBe(false);
  });

  it("compares against the LATEST write, so a late echo of an older write is still ours", () => {
    const file = path.join(dir, "Note.md");
    suppressWatcher(file, "first\n");
    fs.writeFileSync(file, "first\n");
    suppressWatcher(file, "second\n");
    fs.writeFileSync(file, "second\n");

    vi.advanceTimersByTime(10_000);

    expect(isOwnEcho(file)).toBe(true);
  });

  it("is never an echo for a file we have not written, or one that is gone", () => {
    const file = path.join(dir, "Foreign.md");
    fs.writeFileSync(file, "theirs\n");
    expect(isOwnEcho(file)).toBe(false);

    const missing = path.join(dir, "Gone.md");
    suppressWatcher(missing, "was here\n");
    expect(isOwnEcho(missing)).toBe(false);
  });
});

// What reaches the renderer is decided by the bytes first and the timer only
// for a path with no recorded bytes. The old order asked the timer first, so an
// outside edit landing inside the 1.5s window was dropped whatever it held
// (traced 2026-09-06: an edit ~1s after a save never appeared, and the next
// keystroke wrote the stale note back over it).
describe("own-write event: bytes before the timer", () => {
  let dir;
  beforeEach(() => {
    vi.useFakeTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-watcher-"));
  });
  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("passes an outside edit made inside the write window when the bytes differ", () => {
    const file = path.join(dir, "Note.md");
    suppressWatcher(file, "ours\n");
    fs.writeFileSync(file, "ours\n");
    vi.advanceTimersByTime(700);
    fs.writeFileSync(file, "theirs\n");

    expect(isWriteSuppressed(file)).toBe(true);
    expect(isOwnWriteEvent(file)).toBe(false);
  });

  it("drops an echo of our own bytes inside the window and long after it", () => {
    const file = path.join(dir, "Note.md");
    suppressWatcher(file, "ours\n");
    fs.writeFileSync(file, "ours\n");

    expect(isOwnWriteEvent(file)).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(isOwnWriteEvent(file)).toBe(true);
  });

  it("falls back to the timer for a path with no recorded bytes, such as the old path of a rename", () => {
    const file = path.join(dir, "Old.md");
    suppressWatcher(file);

    expect(isOwnWriteEvent(file)).toBe(true);
    vi.advanceTimersByTime(1500);
    expect(isOwnWriteEvent(file)).toBe(false);
  });
});
