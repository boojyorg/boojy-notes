import { describe, expect, it } from "vitest";
import { DropboxHttpError } from "../../src/sync/dropboxClient";
import type { PassResult } from "../../src/sync/engine";
import {
  createSyncStatus,
  describeProblem,
  FAILING_AFTER,
  failureMeaning,
  problemsKey,
} from "../../src/sync/syncStatus";

const done = (over: Partial<PassResult> = {}): PassResult => ({
  again: false,
  attention: [],
  log: [],
  ...over,
});
const offline = () => new TypeError("Failed to fetch");

function settled() {
  const sync = createSyncStatus({ now: () => 1000 });
  sync.started();
  sync.finished(done());
  return sync;
}

describe("sync's state", () => {
  it("is syncing until a first pass settles, never assumed synced", () => {
    const sync = createSyncStatus({ now: () => 1000 });
    expect(sync.status()).toEqual({ state: "syncing", lastSynced: null, problems: [] });
    sync.started();
    sync.finished(done());
    expect(sync.status()).toEqual({ state: "synced", lastSynced: 1000, problems: [] });
  });

  it("is not synced while a save waits for its pass", () => {
    const sync = settled();
    sync.changed();
    expect(sync.status().state).toBe("syncing");
  });

  it("keeps a save made during a pass unsent until a pass after it", () => {
    const sync = settled();
    sync.started();
    sync.changed(); // typed while the pass ran
    expect(sync.status().state).toBe("syncing");
    sync.finished(done());
    expect(sync.status().state).toBe("syncing");
    sync.started();
    sync.finished(done());
    expect(sync.status().state).toBe("synced");
  });

  it("is not synced when the last pass asked for another", () => {
    const sync = settled();
    sync.started();
    sync.finished(done({ again: true }));
    expect(sync.status().state).toBe("syncing");
    expect(sync.status().lastSynced).toBe(1000);
  });

  it("is offline when Dropbox can't be reached, until a pass gets through", () => {
    const sync = settled();
    sync.started();
    sync.failed(offline());
    expect(sync.status().state).toBe("offline");
    sync.started(); // a retry
    expect(sync.status().state).toBe("offline");
    sync.failed(offline());
    sync.started();
    sync.finished(done());
    expect(sync.status().state).toBe("synced");
  });

  it("shows a held-back file until a pass no longer meets it", () => {
    const sync = settled();
    const big = { kind: "too-large" as const, path: "Big.pdf" };
    sync.started();
    sync.finished(done({ attention: [big] }));
    expect(sync.status()).toMatchObject({ state: "problem", problems: [big] });
    // An unrelated pass that meets it again keeps it.
    sync.started();
    sync.finished(done({ attention: [big] }));
    expect(sync.status().problems).toEqual([big]);
    // A pass that fails keeps what the last one found.
    sync.started();
    sync.failed(offline());
    expect(sync.status()).toMatchObject({ state: "problem", problems: [big] });
    sync.started();
    sync.finished(done());
    expect(sync.status().state).toBe("synced");
  });

  it("keeps a stopping problem until a pass settles", () => {
    const sync = settled();
    sync.started();
    sync.failed(new DropboxHttpError(409, "path/insufficient_space/..", null));
    expect(sync.status().problems).toEqual([{ kind: "dropbox-full" }]);
    sync.started();
    sync.finished(done({ again: true }));
    expect(sync.status().problems).toEqual([{ kind: "dropbox-full" }]);
    sync.started();
    sync.finished(done());
    expect(sync.status()).toMatchObject({ state: "synced", problems: [] });
  });

  it(`calls unknown failures a problem only after ${FAILING_AFTER} passes in a row`, () => {
    const sync = settled();
    for (let i = 1; i < FAILING_AFTER; i++) {
      sync.started();
      sync.failed(new Error("odd"));
      expect(sync.status().problems).toEqual([]);
    }
    sync.started();
    sync.failed(new Error("odd"));
    expect(sync.status().problems).toEqual([{ kind: "failing", message: "odd" }]);
  });

  it("starts the count again after a pass gets through", () => {
    const sync = settled();
    for (let i = 1; i < FAILING_AFTER; i++) sync.failed(new Error("odd"));
    sync.finished(done({ again: true }));
    sync.failed(new Error("odd"));
    expect(sync.status().problems).toEqual([]);
  });

  it("tells each listener of every change", () => {
    const sync = createSyncStatus();
    const seen: string[] = [];
    const stop = sync.subscribe((s) => seen.push(s.state));
    sync.started();
    sync.finished(done());
    stop();
    sync.changed();
    expect(seen).toEqual(["syncing", "synced"]);
  });
});

describe("what a failure means", () => {
  it("reads a dead sign-in as signed out", () => {
    expect(failureMeaning(new DropboxHttpError(400, '{"error": "invalid_grant"}', null))).toEqual({
      problem: { kind: "signed-out" },
    });
    expect(failureMeaning(new DropboxHttpError(401, "invalid_access_token/", null))).toEqual({
      problem: { kind: "signed-out" },
    });
  });

  it("reads Dropbox too busy as offline, with its wait", () => {
    expect(failureMeaning(new DropboxHttpError(429, "too_many_requests/", 30))).toEqual({
      offline: true,
      retryAfterMs: 30_000,
    });
    expect(failureMeaning(new DropboxHttpError(503, "", null))).toEqual({
      offline: true,
      retryAfterMs: null,
    });
  });

  it("reads no network as offline, and other type errors as failures", () => {
    expect(failureMeaning(offline())).toEqual({ offline: true, retryAfterMs: null });
    expect(failureMeaning(new TypeError("x is undefined"))).toEqual({ other: "x is undefined" });
  });

  it("reads a full phone", () => {
    expect(failureMeaning(new Error("ENOSPC: no space left on device"))).toEqual({
      problem: { kind: "phone-full" },
    });
  });
});

describe("what a problem says", () => {
  it("names both files that differ only in capitals", () => {
    const { text, action } = describeProblem({ kind: "case", paths: ["Note.md", "note.md"] });
    expect(text).toContain("“Note.md” and “note.md”");
    expect(action).toBeUndefined();
  });

  it("names a file too big and says what to change", () => {
    const { text, action } = describeProblem({ kind: "too-large", path: "Films/Trip.mov" });
    expect(text).toContain("“Films/Trip.mov” is over 150 MB");
    expect(text).toContain("Make it smaller or move it out of the folder");
    expect(action).toBeUndefined();
  });

  it("names a file Dropbox refused and asks for a new name", () => {
    const { text, action } = describeProblem({ kind: "refused", path: "Work/a:b.md" });
    expect(text).toBe("“Work/a:b.md” has a name Dropbox won't take. Rename it.");
    expect(action).toBeUndefined();
  });

  it("offers sign-in for a dead sign-in and another account", () => {
    expect(describeProblem({ kind: "signed-out" }).action).toBe("sign-in");
    expect(describeProblem({ kind: "other-account" }).action).toBe("sign-in");
    expect(describeProblem({ kind: "dropbox-full" }).action).toBe("retry");
  });

  it("keys a set of problems by what they are", () => {
    expect(problemsKey([])).toBe("");
    expect(problemsKey([{ kind: "signed-out" }])).toBe(problemsKey([{ kind: "signed-out" }]));
    expect(problemsKey([{ kind: "signed-out" }])).not.toBe(problemsKey([{ kind: "phone-full" }]));
  });
});
