/**
 * A note opened from outside the app is answered from its real path: which
 * storage location holds it, if any, whatever path named it. Requests wait,
 * in order, until the window has read its notes.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classifyOpen, notePathsIn, openRequestQueue } from "../../electron/openRequests";

let root: string;
let vault: string;
let other: string;
beforeEach(() => {
  // The real path as the app reads it: Windows' temp folder can be an 8.3 short name.
  root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "open-req-")));
  vault = path.join(root, "Notes");
  other = path.join(root, "Uni");
  fs.mkdirSync(path.join(vault, "Ideas"), { recursive: true });
  fs.mkdirSync(other);
  fs.writeFileSync(path.join(vault, "Ideas", "Plan.md"), "Plan.\n");
  fs.writeFileSync(path.join(other, "Week 1.md"), "W1.\n");
  fs.writeFileSync(path.join(root, "Loose.md"), "Loose.\n");
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("notePathsIn", () => {
  it("takes the .md paths after the executable, resolved where the launch ran", () => {
    expect(
      notePathsIn(["/app/Boojy", "--flag", "a.md", "/abs/B.MD", "pic.png", "main.mjs"], "/home/t"),
    ).toEqual([path.resolve("/home/t", "a.md"), path.resolve("/abs/B.MD")]);
  });
});

describe("classifyOpen", () => {
  it("finds the location holding the file, at the index's own spelling", () => {
    expect(classifyOpen(path.join(vault, "Ideas", "Plan.md"), [vault, other])).toEqual({
      kind: "note",
      vault,
      rel: path.join("Ideas", "Plan.md"),
    });
    expect(classifyOpen(path.join(other, "Week 1.md"), [vault, other])).toEqual({
      kind: "note",
      vault: other,
      rel: "Week 1.md",
    });
  });

  it("follows a symlink to the file it names", () => {
    const link = path.join(root, "Shortcut.md");
    fs.symlinkSync(path.join(vault, "Ideas", "Plan.md"), link);
    expect(classifyOpen(link, [vault])).toMatchObject({ kind: "note", vault });
  });

  it.runIf(process.platform === "darwin")(
    "answers a path typed in another casing with the disk's own (a Mac's case-blind disk)",
    () => {
      expect(classifyOpen(path.join(vault, "ideas", "PLAN.md"), [vault])).toEqual({
        kind: "note",
        vault,
        rel: path.join("Ideas", "Plan.md"),
      });
    },
  );

  it("reads a location reached through a symlink as that location", () => {
    const linked = path.join(root, "Linked");
    fs.symlinkSync(vault, linked);
    expect(classifyOpen(path.join(vault, "Ideas", "Plan.md"), [linked])).toMatchObject({
      kind: "note",
      vault: linked,
      rel: path.join("Ideas", "Plan.md"),
    });
  });

  it("is outside when no location holds it, even one beside a location", () => {
    expect(classifyOpen(path.join(root, "Loose.md"), [vault, other])).toEqual({
      kind: "outside",
      path: path.join(root, "Loose.md"),
    });
    fs.mkdirSync(`${vault}-old`);
    fs.writeFileSync(path.join(`${vault}-old`, "X.md"), "X.\n");
    expect(classifyOpen(path.join(`${vault}-old`, "X.md"), [vault])).toMatchObject({
      kind: "outside",
    });
  });

  it("is missing when the file has gone, or is a folder", () => {
    expect(classifyOpen(path.join(vault, "Gone.md"), [vault]).kind).toBe("missing");
    fs.mkdirSync(path.join(vault, "Dir.md"));
    expect(classifyOpen(path.join(vault, "Dir.md"), [vault]).kind).toBe("missing");
  });

  it("skips a listed location that is not there", () => {
    expect(
      classifyOpen(path.join(other, "Week 1.md"), [path.join(root, "Unplugged"), other]),
    ).toMatchObject({ kind: "note", vault: other });
  });
});

describe("openRequestQueue", () => {
  it("holds requests until the window takes them, then sends each as it comes", () => {
    const sent: unknown[] = [];
    const q = openRequestQueue({ send: (r) => sent.push(r) > 0, vaults: () => [vault] });
    q.add([path.join(vault, "Ideas", "Plan.md"), path.join(root, "Loose.md")]);
    expect(sent).toEqual([]);
    expect(q.take().map((r) => r.kind)).toEqual(["note", "outside"]);
    expect(q.take()).toEqual([]);
    q.add([path.join(vault, "Gone.md")]);
    expect(sent).toEqual([{ kind: "missing", path: path.join(vault, "Gone.md") }]);
  });

  it("holds again while a page reloads, and when there is no window to send to", () => {
    let window = true;
    const sent: unknown[] = [];
    const q = openRequestQueue({
      send: (r) => window && sent.push(r) > 0,
      vaults: () => [vault],
    });
    q.take();
    q.reset();
    q.add([path.join(root, "Loose.md")]);
    expect(sent).toEqual([]);
    q.take();
    window = false;
    q.add([path.join(vault, "Ideas", "Plan.md")]);
    expect(sent).toEqual([]);
    expect(q.take().map((r) => r.kind)).toEqual(["note"]);
  });

  it("answers against the locations as they are when it answers", () => {
    let list = [vault];
    const q = openRequestQueue({ send: () => true, vaults: () => list });
    q.add([path.join(other, "Week 1.md")]);
    list = [vault, other];
    expect(q.take()).toEqual([{ kind: "note", vault: other, rel: "Week 1.md" }]);
  });
});
