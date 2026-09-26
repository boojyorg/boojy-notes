import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type TreeWatcher, watchTree } from "../../electron/treeWatcher";

/**
 * One watch for a whole tree, reported in chokidar's words: what happened at a
 * path is decided by looking at it once it holds still.
 */
let root: string;
let watcher: TreeWatcher | null = null;
let events: string[];

const rel = (p: string) => path.relative(root, p);
const until = async (want: string, ms = 3000) => {
  const start = Date.now();
  while (!events.includes(want)) {
    if (Date.now() - start > ms) throw new Error(`no "${want}" in ${JSON.stringify(events)}`);
    await new Promise((r) => setTimeout(r, 25));
  }
};

function start() {
  watcher = watchTree(root, {
    stabilityMs: 60,
    pollMs: 20,
    ignored: (p) =>
      rel(p)
        .split(path.sep)
        .some((s) => s.startsWith(".")),
  });
  watcher.on("all", (event, p) => events.push(`${event} ${rel(p)}`));
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "boojy-tree-")));
  events = [];
});
afterEach(async () => {
  await watcher?.close();
  watcher = null;
  fs.rmSync(root, { recursive: true, force: true });
});

describe("watchTree", () => {
  it("reports nothing for what was there when it started", async () => {
    fs.writeFileSync(path.join(root, "a.md"), "a");
    start();
    await new Promise((r) => setTimeout(r, 200));
    expect(events).toEqual([]);
  });

  it("reports a file added, changed and removed", async () => {
    start();
    fs.writeFileSync(path.join(root, "a.md"), "a");
    await until("add a.md");
    fs.writeFileSync(path.join(root, "a.md"), "a changed");
    await until("change a.md");
    fs.rmSync(path.join(root, "a.md"));
    await until("unlink a.md");
  });

  it("reports every file in a folder that arrives whole, and every file in one that goes", async () => {
    start();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-tree-out-"));
    fs.mkdirSync(path.join(outside, "Sub"));
    fs.writeFileSync(path.join(outside, "Sub", "one.md"), "1");
    fs.writeFileSync(path.join(outside, "Sub", "two.md"), "2");
    fs.renameSync(path.join(outside, "Sub"), path.join(root, "Moved"));
    await until("addDir Moved");
    await until(`add ${path.join("Moved", "one.md")}`);
    await until(`add ${path.join("Moved", "two.md")}`);
    fs.rmSync(path.join(root, "Moved"), { recursive: true });
    await until("unlinkDir Moved");
    expect(events).toContain(`unlink ${path.join("Moved", "one.md")}`);
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it("never reports what is ignored", async () => {
    start();
    fs.writeFileSync(path.join(root, ".hidden.md"), "h");
    fs.writeFileSync(path.join(root, "seen.md"), "s");
    await until("add seen.md");
    expect(events.some((e) => e.includes(".hidden"))).toBe(false);
  });

  it("takes a case-only rename as the old spelling gone and the new one added", async () => {
    fs.writeFileSync(path.join(root, "Alpha.md"), "a");
    start();
    fs.renameSync(path.join(root, "Alpha.md"), path.join(root, "alpha.md"));
    await until("add alpha.md");
    await until("unlink Alpha.md");
  });
});
