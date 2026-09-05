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
