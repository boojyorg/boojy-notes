import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Capacitor file plugin as it behaves on Android: a missing path is
 * `OS-PLUG-FILE-0008`, and rename deletes the destination before moving the
 * source (decompiled ionfilesystem 1.1.0). `failNext` makes one call fail.
 */
const disk = new Map<string, string>(); // path → base64 data; a directory is "<dir>"
const failNext = new Map<string, Error>();
const missing = (path: string) =>
  Object.assign(new Error(`'${path}' does not exist`), { code: "OS-PLUG-FILE-0008" });
const fail = (method: string) => {
  const error = failNext.get(method);
  if (error) {
    failNext.delete(method);
    throw error;
  }
};
const children = (dir: string) =>
  [...disk.keys()].filter(
    (p) =>
      p !== dir &&
      p.startsWith(dir ? `${dir}/` : "") &&
      !p.slice(dir ? dir.length + 1 : 0).includes("/"),
  );

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Filesystem: {
    async stat({ path }: { path: string }) {
      fail("stat");
      if (!disk.has(path)) throw missing(path);
      return { type: disk.get(path) === "<dir>" ? "directory" : "file", mtime: 1 };
    },
    async readdir({ path }: { path: string }) {
      fail("readdir");
      if (path && !disk.has(path)) throw missing(path);
      return {
        files: children(path).map((p) => ({
          name: p.split("/").pop(),
          type: disk.get(p) === "<dir>" ? "directory" : "file",
          mtime: 1,
        })),
      };
    },
    async readFile({ path }: { path: string }) {
      fail("readFile");
      if (!disk.has(path)) throw missing(path);
      return { data: disk.get(path) };
    },
    async writeFile({ path, data }: { path: string; data: string }) {
      fail("writeFile");
      disk.set(path, data);
    },
    async rename({ from, to }: { from: string; to: string }) {
      if (!disk.has(from)) throw missing(from);
      disk.delete(to); // the plugin's own first step
      fail("rename");
      disk.set(to, disk.get(from) as string);
      disk.delete(from);
    },
    async deleteFile({ path }: { path: string }) {
      if (!disk.has(path)) throw missing(path);
      disk.delete(path);
    },
    async mkdir({ path }: { path: string }) {
      const parts = path.split("/");
      for (let i = 1; i <= parts.length; i++) disk.set(parts.slice(0, i).join("/"), "<dir>");
    },
    async rmdir({ path }: { path: string }) {
      if (children(path).length) throw new Error("not empty");
      disk.delete(path);
    },
  },
}));

const { capacitorFiles } = await import("../../src/phone/files");

const text = (s: string) => new TextEncoder().encode(s);
const b64 = (s: string) => btoa(s);
const at = (path: string) => (disk.has(path) ? atob(disk.get(path) as string) : undefined);

beforeEach(() => {
  disk.clear();
  failNext.clear();
  disk.set("vault", "<dir>");
});

describe("only a file confirmed absent is missing", () => {
  it("throws when a folder cannot be listed, rather than calling it empty", async () => {
    disk.set("vault/Note.md", b64("text"));
    failNext.set("readdir", new Error("I/O error"));
    await expect(capacitorFiles().list("vault")).rejects.toThrow("I/O error");
  });

  it("throws when a file cannot be checked, rather than calling it missing", async () => {
    failNext.set("stat", new Error("permission denied"));
    await expect(capacitorFiles().read("vault/Note.md")).rejects.toThrow("permission denied");
  });

  it("reads a file that is not there as missing", async () => {
    expect(await capacitorFiles().read("vault/Gone.md")).toBeNull();
    expect(await capacitorFiles().list("vault/No folder")).toEqual([]);
  });
});

describe("a write never leaves the file missing", () => {
  it("replaces a file and leaves nothing beside it", async () => {
    disk.set("vault/Note.md", b64("old"));
    await capacitorFiles().write("vault/Note.md", text("new"));
    expect(at("vault/Note.md")).toBe("new");
    expect(children("vault")).toEqual(["vault/Note.md"]);
  });

  it("keeps the old file when the new one cannot be moved in", async () => {
    disk.set("vault/Note.md", b64("old"));
    const files = capacitorFiles();
    // The first rename moves the old file aside; the second, the new one in, fails.
    const rename = (await import("@capacitor/filesystem")).Filesystem.rename;
    let calls = 0;
    const spy = vi.spyOn((await import("@capacitor/filesystem")).Filesystem, "rename");
    spy.mockImplementation(async (opts) => {
      if (++calls === 2) throw new Error("rename failed");
      return rename(opts);
    });
    await expect(files.write("vault/Note.md", text("new"))).rejects.toThrow("rename failed");
    spy.mockRestore();
    expect(at("vault/Note.md")).toBe("old");
    expect(at("vault/.~Note.md.tmp")).toBe("new");
  });
});

describe("recover finishes or undoes a write a crash cut short", () => {
  it("puts the new version in when the crash came between the two moves", async () => {
    disk.set("vault/.~Note.md.bak", b64("old"));
    disk.set("vault/.~Note.md.tmp", b64("new"));
    await capacitorFiles().recover("vault");
    expect(at("vault/Note.md")).toBe("new");
    expect(children("vault")).toEqual(["vault/Note.md"]);
  });

  it("puts the old version back when only the backup is left", async () => {
    disk.set("vault/.~Note.md.bak", b64("old"));
    await capacitorFiles().recover("vault");
    expect(at("vault/Note.md")).toBe("old");
  });

  it("takes the new version over a half-copied one", async () => {
    disk.set("vault/Note.md", b64("ne"));
    disk.set("vault/.~Note.md.bak", b64("old"));
    disk.set("vault/.~Note.md.tmp", b64("new"));
    await capacitorFiles().recover("vault");
    expect(at("vault/Note.md")).toBe("new");
    expect(children("vault")).toEqual(["vault/Note.md"]);
  });

  it("clears a finished write's backup, and a temp that never began moving", async () => {
    disk.set("vault/Note.md", b64("new"));
    disk.set("vault/.~Note.md.bak", b64("old"));
    disk.set("vault/Other.md", b64("kept"));
    disk.set("vault/.~Other.md.tmp", b64("par"));
    await capacitorFiles().recover("vault");
    expect(at("vault/Note.md")).toBe("new");
    expect(at("vault/Other.md")).toBe("kept");
    expect(children("vault").sort()).toEqual(["vault/Note.md", "vault/Other.md"]);
  });

  it("leaves a new file's temp alone rather than guess whether it is whole", async () => {
    disk.set("vault/.~New.md.tmp", b64("maybe"));
    await capacitorFiles().recover("vault");
    expect(at("vault/.~New.md.tmp")).toBe("maybe");
    expect(at("vault/New.md")).toBeUndefined();
  });
});
