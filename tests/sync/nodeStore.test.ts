import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nodeStore } from "../../dev/dropbox-poc/nodeStore";
import { syncPass } from "../../src/sync/engine";
import { FakeDropbox } from "./fakes";

let dir: string;
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function setup() {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-sync-"));
  const root = path.join(dir, "phone");
  fs.mkdirSync(root);
  const local = nodeStore(root, path.join(dir, "record.json"));
  const dropbox = new FakeDropbox();
  const settle = async () => {
    for (let i = 0; i < 6; i++) if (!(await syncPass({ local, remote: dropbox })).again) return;
    throw new Error("never settled");
  };
  const file = (rel: string) => path.join(root, ...rel.split("/"));
  return { root, local, dropbox, settle, file };
}

describe("the dev script's folder store, under the real engine", () => {
  it("syncs real files both ways, keeping the record outside the folder", async () => {
    const env = setup();
    await env.dropbox.macWrite("Ideas/Plan.md", "from the Mac");
    fs.writeFileSync(env.file("Phone.md"), "from the phone");
    await env.settle();
    expect(fs.readFileSync(env.file("Ideas/Plan.md"), "utf8")).toBe("from the Mac");
    expect(env.dropbox.read("Phone.md")).toBe("from the phone");
    expect(fs.existsSync(path.join(dir, "record.json"))).toBe(true);
    expect(fs.readdirSync(env.root).sort()).toEqual(["Ideas", "Phone.md"]);
  });

  it("keeps both on a clash and leaves no temporary files", async () => {
    const env = setup();
    await env.dropbox.macWrite("A.md", "alpha");
    await env.settle();
    fs.writeFileSync(env.file("A.md"), "phone");
    await env.dropbox.macWrite("A.md", "Mac");
    await env.settle();
    const names = fs.readdirSync(env.root).sort();
    expect(names).toHaveLength(2);
    expect(names[0]).toMatch(/^A \(conflicted copy \d{4}-\d{2}-\d{2}\)\.md$/);
    expect(names[1]).toBe("A.md");
    expect(fs.readFileSync(env.file(names[0]), "utf8")).toBe("phone");
    expect(fs.readFileSync(env.file("A.md"), "utf8")).toBe("Mac");
  });

  it("puts a note deleted from Dropbox in the trash folder, never away for good", async () => {
    const env = setup();
    await env.dropbox.macWrite("A.md", "alpha");
    await env.settle();
    env.dropbox.macDelete("A.md");
    await env.settle();
    expect(fs.existsSync(env.file("A.md"))).toBe(false);
    const trash = path.join(env.root, ".sync-trash");
    const [stamp] = fs.readdirSync(trash);
    expect(fs.readFileSync(path.join(trash, stamp, "A.md"), "utf8")).toBe("alpha");
    // The trash is a dot folder: never synced.
    expect(env.dropbox.paths()).toEqual([]);
  });

  it("refuses to write over a file that changed since the engine looked", async () => {
    const env = setup();
    fs.writeFileSync(env.file("A.md"), "typed just now");
    expect(await env.local.writeIfUnchanged("A.md", new Uint8Array([1]), null)).toBe(false);
    expect(fs.readFileSync(env.file("A.md"), "utf8")).toBe("typed just now");
  });
});
