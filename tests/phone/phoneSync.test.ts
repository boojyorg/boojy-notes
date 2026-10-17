/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PassResult } from "../../src/sync/engine";
import { memoryFiles } from "./memoryFiles";

type Listener = (event: never) => void;
const listeners = new Map<string, Set<Listener>>();
const fire = (event: string, payload?: unknown) => {
  for (const listener of [...(listeners.get(event) ?? [])]) listener(payload as never);
};

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async (event: string, listener: Listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(listener);
      return { remove: async () => listeners.get(event)?.delete(listener) };
    }),
  },
}));
const browserOpen = vi.fn(async (_: { url: string }) => {});
vi.mock("@capacitor/browser", () => ({
  Browser: { open: (o: { url: string }) => browserOpen(o), close: async () => {} },
}));

const remotes: { token: () => Promise<string> }[] = [];
let dropboxReachable = true;
const exchangeCode = vi.fn();
vi.mock("../../src/sync/dropboxClient", async (actual) => ({
  ...(await actual<typeof import("../../src/sync/dropboxClient")>()),
  createDropboxRemote: (opts: { token: () => Promise<string> }) => {
    remotes.push(opts);
    return {
      longpoll: () => new Promise(() => {}),
      accountId: async () => {
        if (!dropboxReachable) throw new TypeError("Failed to fetch");
        return "dbid:A";
      },
    };
  },
  refreshingToken:
    ({ refreshToken }: { refreshToken: string }) =>
    async () =>
      `access-for-${refreshToken}`,
  exchangeCode: (...args: unknown[]) => exchangeCode(...args),
  // Web Crypto answers outside the fake clock.
  createPkce: async () => ({ verifier: "v", challenge: "c" }),
}));

const passes = vi.fn<() => Promise<PassResult>>();
const tokensUsed: string[] = [];
vi.mock("../../src/sync/engine", () => ({
  syncPass: async () => {
    tokensUsed.push(await remotes[remotes.length - 1].token());
    return passes();
  },
}));

import { App } from "@capacitor/app";
import { DropboxHttpError } from "../../src/sync/dropboxClient";
import { FAILING_AFTER } from "../../src/sync/syncStatus";
import { createPhoneSync } from "../../src/phone/phoneSync";

const done = (again = false): PassResult => ({ again, attention: [], log: [] });
const encode = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const decode = (b: Uint8Array | null) => (b ? JSON.parse(new TextDecoder().decode(b)) : null);

/** A pass that waits until the test lets it end, with what it should answer. */
function gate() {
  const waiting: ((answer: () => PassResult) => void)[] = [];
  passes.mockImplementation(
    () =>
      new Promise<PassResult>((resolve, reject) =>
        waiting.push((answer) => {
          try {
            resolve(answer());
          } catch (error) {
            reject(error);
          }
        }),
      ),
  );
  return {
    async end(answer: () => PassResult = () => done()) {
      while (!waiting.length) await vi.advanceTimersByTimeAsync(0);
      waiting.shift()?.(answer);
      await vi.advanceTimersByTimeAsync(0);
    },
  };
}

async function started(secrets: object = { refreshToken: "old", accountId: "dbid:A" }) {
  const files = memoryFiles();
  await files.write("state/dropbox.json", encode(secrets));
  const local = { loadRecord: async () => null } as never;
  const sync = createPhoneSync(files, local);
  await sync.start();
  return { files, sync };
}

/** Dropbox sends the browser back to the app with a code for this sign-in. */
function dropboxAnswers(files: ReturnType<typeof memoryFiles>) {
  browserOpen.mockImplementation(async () => {
    const { state } = decode(await files.read("state/sign-in.json"));
    setTimeout(() => fire("appUrlOpen", { url: `boojynotes://oauth?code=c&state=${state}` }), 0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  listeners.clear();
  remotes.length = 0;
  dropboxReachable = true;
  tokensUsed.length = 0;
  passes.mockReset();
  browserOpen.mockReset();
  exchangeCode.mockReset();
  vi.mocked(App.addListener).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the phone's sync worker", () => {
  it("keeps a save made during a pass unsynced until the pass after it", async () => {
    const passGate = gate();
    const { sync } = await started();
    sync.localChanged();
    await passGate.end();
    expect(sync.status.status().state).toBe("syncing");
    await vi.advanceTimersByTimeAsync(1500); // the save's own pass
    await passGate.end();
    expect(sync.status.status().state).toBe("synced");
    expect(passes).toHaveBeenCalledTimes(2);
  });

  it("comes back to work left when the runner stops repeating", async () => {
    passes.mockResolvedValue(done(true));
    const { sync } = await started();
    await vi.advanceTimersByTimeAsync(0);
    expect(passes).toHaveBeenCalledTimes(4); // one, then three repeats
    expect(sync.status.status().state).toBe("syncing");
    passes.mockResolvedValue(done());
    await vi.advanceTimersByTimeAsync(15_000);
    expect(passes).toHaveBeenCalledTimes(5);
    expect(sync.status.status().state).toBe("synced");
  });

  it("counts a failed pass once, however many requests waited on it", async () => {
    const passGate = gate();
    const { sync } = await started();
    sync.localChanged();
    await vi.advanceTimersByTimeAsync(1500);
    fire("appStateChange", { isActive: true });
    await passGate.end(() => {
      throw new Error("odd");
    });
    expect(passes).toHaveBeenCalledTimes(1);
    expect(sync.status.status().problems).toEqual([]);
    for (let i = 1; i < FAILING_AFTER; i++) {
      await vi.advanceTimersByTimeAsync(15_000);
      await passGate.end(() => {
        throw new Error("odd");
      });
    }
    expect(passes).toHaveBeenCalledTimes(FAILING_AFTER);
    expect(sync.status.status().problems).toEqual([{ kind: "failing", message: "odd" }]);
  });

  it("waits as long as Dropbox asks before trying again", async () => {
    passes.mockRejectedValueOnce(new DropboxHttpError(429, "too_many_requests/", 30));
    passes.mockResolvedValue(done());
    const { sync } = await started();
    await vi.advanceTimersByTimeAsync(0);
    expect(sync.status.status().state).toBe("offline");
    await vi.advanceTimersByTimeAsync(15_000);
    expect(passes).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(passes).toHaveBeenCalledTimes(2);
    expect(sync.status.status().state).toBe("synced");
  });

  it("learns the account of a sign-in kept before accounts were checked, once online", async () => {
    dropboxReachable = false;
    passes.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    passes.mockResolvedValue(done());
    const { files } = await started({ refreshToken: "old" });
    await vi.advanceTimersByTimeAsync(0);
    expect(decode(await files.read("state/dropbox.json")).accountId).toBeUndefined();
    dropboxReachable = true;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(decode(await files.read("state/dropbox.json"))).toEqual({
      refreshToken: "old",
      accountId: "dbid:A",
    });
  });
});

describe("signing in again", () => {
  async function signedOut() {
    passes.mockRejectedValueOnce(new DropboxHttpError(400, '{"error": "invalid_grant"}', null));
    const env = await started();
    await vi.advanceTimersByTimeAsync(0);
    expect(env.sync.status.status().problems).toEqual([{ kind: "signed-out" }]);
    return env;
  }

  it("doesn't retry a dead sign-in on a timer", async () => {
    await signedOut();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(passes).toHaveBeenCalledTimes(1);
  });

  it("swaps the token in the one worker, never starting a second", async () => {
    const { files, sync } = await signedOut();
    passes.mockResolvedValue(done());
    exchangeCode.mockResolvedValue({ refreshToken: "new", accountId: "dbid:A" });
    dropboxAnswers(files);
    const appStateListeners = () =>
      vi.mocked(App.addListener).mock.calls.filter(([event]) => event === "appStateChange").length;
    expect(appStateListeners()).toBe(1);
    const attempt = sync.signInAgain();
    await vi.advanceTimersByTimeAsync(0);
    await attempt;
    await vi.advanceTimersByTimeAsync(0);
    expect(remotes).toHaveLength(1);
    expect(appStateListeners()).toBe(1);
    expect(tokensUsed).toEqual(["access-for-old", "access-for-new"]);
    expect(sync.status.status()).toMatchObject({ state: "synced", problems: [] });
    expect(decode(await files.read("state/dropbox.json"))).toEqual({
      refreshToken: "new",
      accountId: "dbid:A",
    });
    // The sign-in's own listeners are gone.
    expect(listeners.get("appUrlOpen")?.size ?? 0).toBe(0);
    expect(listeners.get("resume")?.size ?? 0).toBe(0);
  });

  it("refuses another Dropbox account, keeping the sign-in it had", async () => {
    const { files, sync } = await signedOut();
    exchangeCode.mockResolvedValue({ refreshToken: "theirs", accountId: "dbid:B" });
    dropboxAnswers(files);
    const attempt = sync.signInAgain();
    await vi.advanceTimersByTimeAsync(0);
    await attempt;
    expect(sync.status.status().problems).toEqual([{ kind: "other-account" }]);
    expect(decode(await files.read("state/dropbox.json")).refreshToken).toBe("old");
    expect(passes).toHaveBeenCalledTimes(1);
  });

  it("treats coming back without an answer as cancelled, changing nothing", async () => {
    const { files, sync } = await signedOut();
    const attempt = sync.signInAgain();
    const failed = expect(attempt).rejects.toThrow("the page was closed");
    await vi.advanceTimersByTimeAsync(0);
    fire("resume");
    await vi.advanceTimersByTimeAsync(2000);
    await failed;
    expect(await files.read("state/sign-in.json")).toBeNull();
    expect(decode(await files.read("state/dropbox.json")).refreshToken).toBe("old");
    expect(sync.status.status().problems).toEqual([{ kind: "signed-out" }]);
    expect(listeners.get("appUrlOpen")?.size ?? 0).toBe(0);
  });

  it("waits a moment after coming back, for Dropbox's answer to arrive", async () => {
    const { files, sync } = await signedOut();
    passes.mockResolvedValue(done());
    exchangeCode.mockResolvedValue({ refreshToken: "new", accountId: "dbid:A" });
    browserOpen.mockImplementation(async () => {
      const { state } = decode(await files.read("state/sign-in.json"));
      setTimeout(() => fire("resume"), 0);
      setTimeout(
        () => fire("appUrlOpen", { url: `boojynotes://oauth?code=c&state=${state}` }),
        500,
      );
    });
    const attempt = sync.signInAgain();
    await vi.advanceTimersByTimeAsync(3000);
    await attempt;
    expect(decode(await files.read("state/dropbox.json")).refreshToken).toBe("new");
  });
});
