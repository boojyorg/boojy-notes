import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp") },
  ipcMain: { handle: vi.fn() },
}));

const {
  claimWrite,
  claimUnlink,
  releaseUnlinkClaim,
  claimTree,
  isUnderOwnTree,
  isOwnWriteEvent,
  isOwnUnlinkEvent,
  isIgnoredPath,
  startWatcher,
  closeWatcher,
} = await import("../../electron/fileWatcher.js");

// The rule (2026-09-08): the app drops only an event it can identify as the
// consequence of its own operation. A write is claimed by its bytes until
// the first event that shows the file has left the app's hands; an unlink
// the app causes is claimed once and consumed by that unlink; nothing about
// a note file is decided on the clock alone.

// An unlink claim is consumed by the event (or an explicit release), NOT a
// short fixed timer — shell.trashItem() latency is unbounded, and an expired
// claim would let our own delete masquerade as an external one and trigger
// the renderer's full-state rebuild.
describe("unlink claim", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds until the unlink consumes it, however long the Trash move takes", () => {
    claimUnlink("/notes/Slow.md");

    vi.advanceTimersByTime(30_000);

    expect(isOwnUnlinkEvent("/notes/Slow.md")).toBe(true);
  });

  it("is consumed exactly once", () => {
    claimUnlink("/notes/Note.md");

    expect(isOwnUnlinkEvent("/notes/Note.md")).toBe(true);
    expect(isOwnUnlinkEvent("/notes/Note.md")).toBe(false);
  });

  it("can be given back when the operation fails and no unlink is coming", () => {
    claimUnlink("/notes/Note.md");

    expect(releaseUnlinkClaim("/notes/Note.md")).toBe(true);
    expect(releaseUnlinkClaim("/notes/Note.md")).toBe(false);
    expect(isOwnUnlinkEvent("/notes/Note.md")).toBe(false);
  });

  it("expires via the leak-guard fallback if no unlink ever arrives", () => {
    claimUnlink("/notes/Never-deleted.md");

    vi.advanceTimersByTime(60_000);

    expect(isOwnUnlinkEvent("/notes/Never-deleted.md")).toBe(false);
  });
});

// A write's echo is recognised by its bytes, never by a timer. macOS delivers
// a second `change` for one write 1.5–2.7s later — the file's mtime and size
// are those of the write, only the inode change time has moved — past any
// window a timer could hold (traced live on the daily driver 2026-09-05: every
// such event rebuilt the note from disk mid-typing).
describe("own-bytes claim", () => {
  let dir;
  beforeEach(() => {
    vi.useFakeTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-watcher-"));
  });
  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("recognises the written bytes however late the echo arrives", () => {
    const file = path.join(dir, "Note.md");
    fs.writeFileSync(file, "hello\n");
    claimWrite(file, "hello\n");

    expect(isOwnWriteEvent(file)).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(isOwnWriteEvent(file)).toBe(true);
  });

  it("lets an outside edit through however soon after the write it lands", () => {
    const file = path.join(dir, "Note.md");
    fs.writeFileSync(file, "ours\n");
    claimWrite(file, "ours\n");
    vi.advanceTimersByTime(200);
    fs.writeFileSync(file, "theirs\n");

    expect(isOwnWriteEvent(file)).toBe(false);
  });

  it("compares against the LATEST write, so a late echo of an older write is still ours", () => {
    const file = path.join(dir, "Note.md");
    fs.writeFileSync(file, "first\n");
    claimWrite(file, "first\n");
    fs.writeFileSync(file, "second\n");
    claimWrite(file, "second\n");

    vi.advanceTimersByTime(10_000);

    expect(isOwnWriteEvent(file)).toBe(true);
  });

  it("is never an echo for a file the app has not written, or one that is gone", () => {
    const file = path.join(dir, "Foreign.md");
    fs.writeFileSync(file, "theirs\n");
    expect(isOwnWriteEvent(file)).toBe(false);

    const missing = path.join(dir, "Gone.md");
    claimWrite(missing, "was here\n");
    expect(isOwnWriteEvent(missing)).toBe(false);
  });

  // Review 2026-09-07 §2.2: the claim was never dropped, so after an outside
  // edit had been delivered, an outside change BACK to the app's bytes (git
  // checkout, Undo in Obsidian, a sync restore) was taken for an echo and
  // the renderer's next save wrote the outside edit over the user's revert.
  it("ends at a delivered outside change: a return to the app's bytes is a real change", () => {
    const file = path.join(dir, "Note.md");
    fs.writeFileSync(file, "v1\n");
    claimWrite(file, "v1\n");

    fs.writeFileSync(file, "v2\n");
    expect(isOwnWriteEvent(file)).toBe(false);

    fs.writeFileSync(file, "v1\n");
    expect(isOwnWriteEvent(file)).toBe(false);
  });

  // §2.2, the `add` case: delete a note, Put Back from the Trash with the
  // same bytes, and it never reappeared until relaunch.
  it("ends at the app's own unlink claim: the same bytes put back are a real add", () => {
    const file = path.join(dir, "Note.md");
    fs.writeFileSync(file, "keep\n");
    claimWrite(file, "keep\n");

    claimUnlink(file);
    fs.unlinkSync(file);
    expect(isOwnUnlinkEvent(file)).toBe(true);

    fs.writeFileSync(file, "keep\n");
    expect(isOwnWriteEvent(file)).toBe(false);
  });

  it("ends at an outside unlink: the same bytes restored are a real add", () => {
    const file = path.join(dir, "Note.md");
    fs.writeFileSync(file, "keep\n");
    claimWrite(file, "keep\n");

    fs.unlinkSync(file);
    expect(isOwnUnlinkEvent(file)).toBe(false);

    fs.writeFileSync(file, "keep\n");
    expect(isOwnWriteEvent(file)).toBe(false);
  });
});

// Review 2026-09-07 §2.9: the unlink branch was the one place that still
// decided on the clock alone, so a real outside delete inside 1.5 s of the
// app's own save of that file was ignored. The app's own writes never unlink
// the path they write, so an unclaimed unlink is real whenever it lands.
describe("outside unlink", () => {
  let dir;
  beforeEach(() => {
    vi.useFakeTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-watcher-"));
  });
  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("is real right after the app's own write of the same file", () => {
    const file = path.join(dir, "Note.md");
    fs.writeFileSync(file, "ours\n");
    claimWrite(file, "ours\n");
    vi.advanceTimersByTime(100);
    fs.unlinkSync(file);

    expect(isOwnUnlinkEvent(file)).toBe(false);
  });
});

// A folder rename or removal is one operation the app already knows the
// outcome of, reported by chokidar as one event per entry underneath. The
// whole subtree is claimed for a short window, the directory itself included.
describe("tree claim", () => {
  let dir;
  beforeEach(() => {
    vi.useFakeTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-watcher-"));
  });
  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("covers the directory and everything under it, and nothing beside it", () => {
    claimTree("/notes/Work");

    expect(isUnderOwnTree("/notes/Work")).toBe(true);
    expect(isOwnWriteEvent("/notes/Work/Note.md")).toBe(true);
    expect(isOwnUnlinkEvent("/notes/Work/Deep/Note.md")).toBe(true);
    expect(isOwnWriteEvent("/notes/Workshop/Note.md")).toBe(false);
    expect(isOwnUnlinkEvent("/notes/Other.md")).toBe(false);
  });

  it("expires with its window", () => {
    claimTree("/notes/Work");
    vi.advanceTimersByTime(1499);
    expect(isUnderOwnTree("/notes/Work/Note.md")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isUnderOwnTree("/notes/Work/Note.md")).toBe(false);
  });

  it("ends the app's bytes claims under it: a file restored at the old path later is a real add", () => {
    const work = path.join(dir, "Work");
    const file = path.join(work, "Note.md");
    fs.mkdirSync(work);
    fs.writeFileSync(file, "keep\n");
    claimWrite(file, "keep\n");

    claimTree(work);
    fs.renameSync(work, path.join(dir, "Done"));
    vi.advanceTimersByTime(1500);

    fs.mkdirSync(work);
    fs.writeFileSync(file, "keep\n");
    expect(isOwnWriteEvent(file)).toBe(false);
  });
});

// A restarted watcher (a vault change) owns nothing: a claim carried across
// could swallow a real outside event at the same path.
describe("startWatcher", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-watcher-"));
  });
  afterEach(async () => {
    await closeWatcher();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("drops every claim of the previous session", () => {
    const file = path.join(dir, "Note.md");
    fs.writeFileSync(file, "ours\n");
    claimWrite(file, "ours\n");
    claimUnlink(path.join(dir, "Gone.md"));
    claimTree(path.join(dir, "Work"));

    startWatcher(
      () => dir,
      () => null,
    );

    expect(isOwnWriteEvent(file)).toBe(false);
    expect(isOwnUnlinkEvent(path.join(dir, "Gone.md"))).toBe(false);
    expect(isUnderOwnTree(path.join(dir, "Work", "Note.md"))).toBe(false);
  });
});

// The ignore rule is judged on the path inside the vault. The old regex ran
// on the absolute path, root included, so a vault under a dot-directory
// (`~/.notes`) matched at its root and got no watcher and no error.
describe("isIgnoredPath", () => {
  const vault = path.join(os.homedir(), ".notes", "vault");

  it("watches a vault that lives under a dot-directory", () => {
    expect(isIgnoredPath(vault, vault)).toBe(false);
    expect(isIgnoredPath(vault, path.join(vault, "Note.md"))).toBe(false);
    expect(isIgnoredPath(vault, path.join(vault, "Work", "Plan.md"))).toBe(false);
  });

  it("skips dot-entries, the attachment store and the legacy index, at any depth", () => {
    expect(isIgnoredPath(vault, path.join(vault, ".git", "HEAD"))).toBe(true);
    expect(isIgnoredPath(vault, path.join(vault, ".Note.md.tmp"))).toBe(true);
    expect(isIgnoredPath(vault, path.join(vault, "Work", ".hidden", "x.md"))).toBe(true);
    expect(isIgnoredPath(vault, path.join(vault, "attachments"))).toBe(true);
    expect(isIgnoredPath(vault, path.join(vault, "Work", "attachments", "a.png"))).toBe(true);
    expect(isIgnoredPath(vault, path.join(vault, ".boojy-index.json"))).toBe(true);
  });

  it("does not judge a path outside the vault as hidden", () => {
    expect(isIgnoredPath(vault, path.join(os.homedir(), ".notes"))).toBe(false);
  });
});
