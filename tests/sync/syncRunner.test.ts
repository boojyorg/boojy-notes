import { describe, expect, it } from "vitest";
import { type PassResult, syncPass } from "../../src/sync/engine";
import { createSyncRunner } from "../../src/sync/syncRunner";
import { FakeDropbox, FakeLocal } from "./fakes";

const done = (again = false): PassResult => ({ again, attention: [], log: [] });

/** A pass that waits to be released, recording whether two ever ran at once. */
function gatedPasses() {
  let running = 0;
  let overlapped = false;
  let count = 0;
  const releases: (() => void)[] = [];
  const pass = async () => {
    count++;
    running++;
    if (running > 1) overlapped = true;
    await new Promise<void>((resolve) => releases.push(resolve));
    running--;
    return done();
  };
  const releaseNext = async () => {
    while (!releases.length) await Promise.resolve();
    releases.shift()?.();
  };
  return {
    pass,
    releaseNext,
    get count() {
      return count;
    },
    get overlapped() {
      return overlapped;
    },
  };
}

describe("createSyncRunner", () => {
  it("answers requests made during a pass with one more pass after it, never alongside", async () => {
    const gate = gatedPasses();
    const runner = createSyncRunner(gate.pass);
    const first = runner.request();
    const second = runner.request(); // a save
    const third = runner.request(); // pull-to-refresh
    expect(runner.busy).toBe(true);
    await gate.releaseNext();
    await gate.releaseNext();
    await Promise.all([first, second, third]);
    expect(gate.count).toBe(2);
    expect(gate.overlapped).toBe(false);
    expect(runner.busy).toBe(false);
  });

  it("starts afresh once idle", async () => {
    const gate = gatedPasses();
    const runner = createSyncRunner(gate.pass);
    const first = runner.request();
    await gate.releaseNext();
    await first;
    const next = runner.request();
    await gate.releaseNext();
    await next;
    expect(gate.count).toBe(2);
  });

  it("repeats a pass that asks again, up to a limit", async () => {
    let count = 0;
    const runner = createSyncRunner(
      async () => {
        count++;
        return done(true);
      },
      { maxRepeats: 3 },
    );
    const result = await runner.request();
    expect(count).toBe(4);
    expect(result.again).toBe(true);
  });

  it("lets a failed pass end, and the next request start", async () => {
    let fail = true;
    const runner = createSyncRunner(async () => {
      if (fail) throw new Error("offline");
      return done();
    });
    await expect(runner.request()).rejects.toThrow("offline");
    fail = false;
    await expect(runner.request()).resolves.toEqual(done());
  });

  it("keeps one clash copy when a save and a refresh arrive during a transfer", async () => {
    const phone = new FakeLocal();
    const dropbox = new FakeDropbox();
    await dropbox.macWrite("A.md", "alpha");
    const runner = createSyncRunner(() => syncPass({ local: phone, remote: dropbox }));
    await runner.request();
    phone.type("A.md", "phone's words");
    await dropbox.macWrite("A.md", "Mac's words");
    const extra: Promise<PassResult>[] = [];
    dropbox.before("download", () => {
      extra.push(runner.request(), runner.request());
    });
    await runner.request();
    await Promise.all(extra);
    expect(phone.paths()).toHaveLength(2);
    expect(dropbox.paths()).toEqual(phone.paths());
  });
});
