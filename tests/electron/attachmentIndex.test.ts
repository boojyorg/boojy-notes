import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  attachmentAdded,
  attachmentRemoved,
  locateAttachment,
  nameTaken,
  resetAttachmentIndex,
} from "../../electron/attachmentIndex";

let vault: string;
const put = (rel: string) => {
  const abs = path.join(vault, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, "x");
  return abs;
};

beforeEach(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-att-"));
  resetAttachmentIndex();
});
afterEach(() => fs.rmSync(vault, { recursive: true, force: true }));

// The index is walked once, then kept by the watcher's events
// (`fileWatcher.js`): a picture that arrives later is found by name.
describe("attachment index", () => {
  it("finds a file that arrives after the walk, once the watcher reports it", () => {
    put("Old/a.png");
    expect(locateAttachment(vault, "a.png")).toBe("Old/a.png");
    const abs = put("Synced/b.png");
    expect(locateAttachment(vault, "b.png")).toBeNull();

    attachmentAdded(vault, abs);

    expect(locateAttachment(vault, "b.png")).toBe("Synced/b.png");
  });

  it("forgets a file, and a folder with its files, that went", () => {
    put("A/x.png");
    put("Deep/B/y.png");
    expect(locateAttachment(vault, "y.png")).toBe("Deep/B/y.png");

    fs.rmSync(path.join(vault, "A", "x.png"));
    attachmentRemoved(vault, path.join(vault, "A", "x.png"));
    fs.rmSync(path.join(vault, "Deep"), { recursive: true });
    attachmentRemoved(vault, path.join(vault, "Deep"), true);

    expect(nameTaken(vault, "x.png")).toBe(false);
    expect(nameTaken(vault, "y.png")).toBe(false);
  });

  it("never answers with a file that is gone, even before its event", () => {
    put("A/x.png");
    put("Longer/Path/x.png");
    expect(locateAttachment(vault, "x.png")).toBe("A/x.png");

    fs.rmSync(path.join(vault, "A", "x.png"));

    expect(locateAttachment(vault, "x.png")).toBe("Longer/Path/x.png");
  });

  it("indexes no notes and nothing hidden", () => {
    put("Plan.md");
    put(".obsidian/icon.png");
    put("attachments/kept.png");

    expect(nameTaken(vault, "plan.md")).toBe(false);
    expect(nameTaken(vault, "icon.png")).toBe(false);
    expect(locateAttachment(vault, "kept.png")).toBe("attachments/kept.png");
  });

  it("ignores events for another vault, and walks a switched vault afresh", () => {
    put("a.png");
    expect(nameTaken(vault, "a.png")).toBe(true);
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-att-other-"));
    try {
      attachmentAdded(other, path.join(other, "z.png"));
      expect(nameTaken(vault, "z.png")).toBe(false);
      fs.writeFileSync(path.join(other, "z.png"), "x");
      expect(locateAttachment(other, "z.png")).toBe("z.png");
      expect(nameTaken(other, "a.png")).toBe(false);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });
});
