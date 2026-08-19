import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp") },
  ipcMain: { handle: vi.fn() },
}));

const { suppressNextUnlink, releaseUnlinkSuppression } = await import(
  "../../electron/fileWatcher.js"
);

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
