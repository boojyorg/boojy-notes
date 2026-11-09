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
/** Dropbox's long-poll; by default it never answers. */
const hang = () => new Promise<never>(() => {});
let longpoll: () => Promise<unknown> = hang;
const exchangeCode = vi.fn();
vi.mock("../../src/sync/dropboxClient", async (actual) => ({
  ...(await actual<typeof import("../../src/sync/dropboxClient")>()),
  createDropboxRemote: (opts: { token: () => Promise<string> }) => {
    remotes.push(opts);
    return {
      longpoll: () => longpoll(),
      accountId: async () => {
        if (!dropboxReachable) throw new TypeError("Failed to fetch");
        return (await opts.token()) === "access-for-theirs" ? "dbid:B" : "dbid:A";
      },
      // Account A's files are found only by A's sign-ins.
      holdsAnyOf: async () => (await opts.token()) !== "access-for-theirs",
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
    tokensUsed.push(await remotes[0].token()); // the worker's, made first
    return passes();
  },
}));

import { App } from "@capacitor/app";
import { DropboxHttpError } from "../../src/sync/dropboxClient";
import { CursorResetError } from "../../src/sync/types";
import { FAILING_AFTER } from "../../src/sync/syncStatus";
import { createPhoneSync, readBinding, readSecrets } from "../../src/phone/phoneSync";

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

/** A record that has synced one note, whose Dropbox id is account A's. */
const SYNCED_ONE = JSON.stringify({
  version: 1,
  cursor: "C1",
  remote: {},
  remoteFolders: {},
  synced: { "a.md": { path: "A.md", id: "id:1", rev: "r1", hash: "h" } },
  syncedFolders: {},
  plan: null,
});

const RECORD = "state/sync-record.json";
const SECRETS = "state/dropbox.json";
const BINDING = "state/binding.json";
const BOUND_TO_A = { folder: "Personal", accountId: "dbid:A" };

/** The vault's store, as far as sync uses it: the record, kept in the phone's files. */
const storeOn = (files: ReturnType<typeof memoryFiles>) =>
  ({
    loadRecord: async () => {
      const bytes = await files.read(RECORD);
      return bytes ? new TextDecoder().decode(bytes) : null;
    },
    forgetSync: async () => {
      if (await files.exists(RECORD)) await files.remove(RECORD);
    },
  }) as never;

/** What the phone holds: each left out when null; a string is written as it is (damaged). */
async function holding(
  files: ReturnType<typeof memoryFiles>,
  {
    secrets = { refreshToken: "old", accountId: "dbid:A" },
    record = SYNCED_ONE,
    binding = BOUND_TO_A,
  }: { secrets?: object | string | null; record?: string | null; binding?: object | null } = {},
) {
  const raw = (v: object | string) =>
    typeof v === "string" ? new TextEncoder().encode(v) : encode(v);
  if (secrets) await files.write(SECRETS, raw(secrets));
  if (record) await files.write(RECORD, new TextEncoder().encode(record));
  if (binding) await files.write(BINDING, encode(binding));
}

async function started(
  secrets: object | string | null = { refreshToken: "old", accountId: "dbid:A" },
  record: string | null = SYNCED_ONE,
  binding: object | null = BOUND_TO_A,
  files = memoryFiles(),
) {
  await holding(files, { secrets, record, binding });
  const sync = createPhoneSync(files, storeOn(files));
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

const windowListeners: [string, EventListenerOrEventListenerObject][] = [];
const addWindowListener = window.addEventListener.bind(window);
window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject) => {
  windowListeners.push([type, listener]);
  addWindowListener(type, listener);
}) as typeof window.addEventListener;

beforeEach(() => {
  vi.useFakeTimers();
  listeners.clear();
  remotes.length = 0;
  dropboxReachable = true;
  longpoll = hang;
  tokensUsed.length = 0;
  passes.mockReset();
  browserOpen.mockReset();
  exchangeCode.mockReset();
  vi.mocked(App.addListener).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  // An earlier test's worker must not answer a later test's `online`.
  for (const [type, listener] of windowListeners.splice(0)) {
    window.removeEventListener(type, listener);
  }
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

  it("asks for a pass at once when Dropbox expires the long-poll's cursor", async () => {
    // The pass lists afresh and saves a new cursor; without it, edits made on
    // the Mac went unnoticed until the next save or return to the app.
    passes.mockResolvedValue(done());
    longpoll = async () => {
      longpoll = hang;
      throw new CursorResetError("reset/");
    };
    await started();
    // The long-poll waits for the first pass to find the sign-in's account the binding's.
    await vi.advanceTimersByTimeAsync(5_100);
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

  // A pass that cannot move the saved cursor (signed out, the phone full,
  // Dropbox's wait) left the long-poll answering at once, over and over.
  it("pauses the long-poll while passes cannot move the cursor", async () => {
    passes.mockRejectedValue(new Error("the phone is full"));
    let polls = 0;
    longpoll = async () => {
      polls++;
      if (polls >= 50) return hang(); // the old loop's spin, stopped for the test
      return { changes: true, backoff: null };
    };
    await started();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(polls).toBeLessThan(5);
  });

  it("holds saves, returns and reconnects to Dropbox's wait; a tap is the person's", async () => {
    passes.mockRejectedValueOnce(new DropboxHttpError(429, "too_many_requests/", 30));
    passes.mockResolvedValue(done());
    const { sync } = await started();
    await vi.advanceTimersByTimeAsync(0);
    sync.localChanged();
    await vi.advanceTimersByTimeAsync(1500);
    fire("appStateChange", { isActive: true });
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(passes).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(passes).toHaveBeenCalledTimes(2);

    passes.mockRejectedValueOnce(new DropboxHttpError(429, "too_many_requests/", 30));
    sync.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(passes).toHaveBeenCalledTimes(3);
    sync.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(passes).toHaveBeenCalledTimes(4);
  });

  it("learns a binding's account before its first pass, once Dropbox can be reached", async () => {
    dropboxReachable = false;
    passes.mockResolvedValue(done());
    const { files, sync } = await started(undefined, undefined, { folder: "Personal" });
    await vi.advanceTimersByTimeAsync(0);
    expect(sync.status.status().state).toBe("offline");
    expect(passes).not.toHaveBeenCalled();
    expect(await readBinding(files)).toEqual({ folder: "Personal" });
    dropboxReachable = true;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await readBinding(files)).toEqual(BOUND_TO_A);
    expect(passes).toHaveBeenCalledOnce();
  });
});

describe("signing in again", () => {
  async function signedOut(...args: Parameters<typeof started>) {
    passes.mockRejectedValueOnce(new DropboxHttpError(400, '{"error": "invalid_grant"}', null));
    const env = await started(...args);
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
    expect(appStateListeners()).toBe(1);
    expect(windowListeners.filter(([type]) => type === "online")).toHaveLength(1);
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
    // The kept sign-in is still the dead one: both are said.
    expect(sync.status.status().problems).toEqual([
      { kind: "other-account" },
      { kind: "signed-out" },
    ]);
    expect(decode(await files.read("state/dropbox.json")).refreshToken).toBe("old");
    expect(passes).toHaveBeenCalledTimes(1);
    // The kept sign-in syncs a save; the warning stays…
    passes.mockResolvedValue(done());
    sync.localChanged();
    await vi.advanceTimersByTimeAsync(1500);
    expect(passes).toHaveBeenCalledTimes(2);
    expect(sync.status.status().problems).toEqual([{ kind: "other-account" }]);
    // …until the right account signs in.
    exchangeCode.mockResolvedValue({ refreshToken: "new", accountId: "dbid:A" });
    const again = sync.signInAgain();
    await vi.advanceTimersByTimeAsync(0);
    await again;
    expect(sync.status.status().problems).toEqual([]);
  });

  it("reads a damaged sign-in as signed out, reaching nothing, and takes only the binding's account", async () => {
    const { files, sync } = await started('{"refreshTo');
    await vi.advanceTimersByTimeAsync(0);
    expect(sync.status.status()).toMatchObject({
      state: "problem",
      problems: [{ kind: "signed-out" }],
    });
    expect(passes).not.toHaveBeenCalled();
    expect(await readSecrets(files)).toBeNull();

    dropboxAnswers(files);
    exchangeCode.mockResolvedValue({ refreshToken: "theirs", accountId: "dbid:B" });
    const other = sync.signInAgain();
    await vi.advanceTimersByTimeAsync(0);
    await other;
    expect(await readSecrets(files)).toBeNull();
    expect(passes).not.toHaveBeenCalled();

    passes.mockResolvedValue(done());
    exchangeCode.mockResolvedValue({ refreshToken: "new", accountId: "dbid:A" });
    const own = sync.signInAgain();
    await vi.advanceTimersByTimeAsync(0);
    await own;
    expect(await readSecrets(files)).toEqual({ refreshToken: "new", accountId: "dbid:A" });
    expect(sync.status.status()).toMatchObject({ state: "synced", problems: [] });
  });

  describe("a binding made before accounts were bound", () => {
    async function signInAs(refreshToken: string, accountId: string, record = SYNCED_ONE) {
      // Signed out before its account was learnt: the binding still has none.
      const env = await started(null, record, { folder: "Personal" });
      passes.mockResolvedValue(done());
      exchangeCode.mockResolvedValue({ refreshToken, accountId });
      dropboxAnswers(env.files);
      const attempt = env.sync.signInAgain();
      await vi.advanceTimersByTimeAsync(0);
      await attempt;
      return env;
    }

    it("refuses an account that holds none of the notes it synced", async () => {
      const { files, sync } = await signInAs("theirs", "dbid:B");
      expect(sync.status.status().problems).toEqual([
        { kind: "other-account" },
        { kind: "signed-out" },
      ]);
      expect(await readSecrets(files)).toBeNull();
      expect(passes).not.toHaveBeenCalled();
    });

    it("takes the account that holds them, and binds it", async () => {
      const { files } = await signInAs("new", "dbid:A");
      expect(await readSecrets(files)).toEqual({ refreshToken: "new", accountId: "dbid:A" });
      expect(await readBinding(files)).toEqual(BOUND_TO_A);
      expect(passes).toHaveBeenCalledOnce();
    });

    it("takes any account while nothing has synced, and binds it", async () => {
      const { files } = await signInAs("theirs", "dbid:B", null as never);
      expect(await readSecrets(files)).toEqual({ refreshToken: "theirs", accountId: "dbid:B" });
      expect(await readBinding(files)).toEqual({ folder: "Personal", accountId: "dbid:B" });
    });
  });

  it("treats coming back without an answer as cancelled, changing nothing", async () => {
    const { files, sync } = await signedOut();
    const attempt = sync.signInAgain();
    const failed = expect(attempt).rejects.toMatchObject({ name: "SignInCancelled" });
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

describe("with no Dropbox connected", () => {
  it("is off and reaches nothing, whatever happens on the phone", async () => {
    let polls = 0;
    longpoll = async () => {
      polls++;
      return hang();
    };
    // A sign-in and record left behind count for nothing without a binding.
    const { sync } = await started(undefined, undefined, null);
    sync.localChanged();
    fire("appStateChange", { isActive: true });
    window.dispatchEvent(new Event("online"));
    sync.syncNow();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(sync.status.status()).toEqual({
      state: "off",
      folder: null,
      lastSynced: null,
      problems: [],
    });
    expect(remotes).toHaveLength(0);
    expect(passes).not.toHaveBeenCalled();
    expect(polls).toBe(0);
  });
});

describe("connecting", () => {
  async function connect(
    files = memoryFiles(),
    fresh = { refreshToken: "new", accountId: "dbid:A" },
  ) {
    const sync = createPhoneSync(files, storeOn(files));
    await sync.start();
    passes.mockResolvedValue(done());
    exchangeCode.mockResolvedValue(fresh);
    dropboxAnswers(files);
    const attempt = sync.connect();
    attempt.catch(() => {}); // asserted by the test, after it settles
    await vi.advanceTimersByTimeAsync(0);
    return { files, sync, attempt };
  }

  it("binds the folder to the account signed in, and syncs from no record so both sides merge", async () => {
    const files = memoryFiles();
    // A record left by a binding that didn't last.
    await holding(files, { secrets: null, binding: null });
    const { sync, attempt } = await connect(files);
    await attempt;
    expect(await readBinding(files)).toEqual(BOUND_TO_A);
    expect(await readSecrets(files)).toEqual({ refreshToken: "new", accountId: "dbid:A" });
    expect(await files.read(RECORD)).toBeNull();
    expect(passes).toHaveBeenCalledOnce();
    expect(sync.status.status()).toMatchObject({ state: "synced", folder: "Personal" });
  });

  it("leaves the notes unconnected when cut short before the binding is written", async () => {
    const files = memoryFiles({ failOn: (op, path) => op === "write" && path === BINDING });
    const { attempt } = await connect(files);
    await expect(attempt).rejects.toThrow(/killed/);
    expect(passes).not.toHaveBeenCalled();
    // The next start: the sign-in left behind reaches nothing.
    remotes.length = 0;
    const again = createPhoneSync(files, storeOn(files));
    await again.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(again.status.status().state).toBe("off");
    expect(remotes).toHaveLength(0);
    expect(passes).not.toHaveBeenCalled();
  });

  it("changes nothing when the page is closed", async () => {
    const files = memoryFiles();
    const sync = createPhoneSync(files, storeOn(files));
    await sync.start();
    const attempt = sync.connect();
    const failed = expect(attempt).rejects.toMatchObject({ name: "SignInCancelled" });
    await vi.advanceTimersByTimeAsync(0);
    fire("resume");
    await vi.advanceTimersByTimeAsync(2000);
    await failed;
    expect(await readBinding(files)).toBeNull();
    expect(sync.status.status().state).toBe("off");
  });
});

describe("disconnecting", () => {
  it("keeps every note and forgets the record, then the binding, then the sign-in", async () => {
    passes.mockResolvedValue(done());
    const files = memoryFiles();
    await files.write("vault/A.md", new TextEncoder().encode("alpha"));
    const removed: string[] = [];
    const remove = files.remove;
    files.remove = async (path) => {
      removed.push(path);
      return remove(path);
    };
    const { sync } = await started(undefined, undefined, undefined, files);
    await vi.advanceTimersByTimeAsync(0);
    await sync.disconnect();
    expect(removed).toEqual([RECORD, BINDING, SECRETS]);
    expect(new TextDecoder().decode((await files.read("vault/A.md")) as Uint8Array)).toBe("alpha");
    expect(sync.status.status()).toEqual({
      state: "off",
      folder: null,
      lastSynced: null,
      problems: [],
    });
    // Nothing goes up after it.
    sync.localChanged();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(passes).toHaveBeenCalledOnce();
  });

  it("waits out a pass under way before forgetting what it knew", async () => {
    const passGate = gate();
    const { files, sync } = await started();
    let finished = false;
    const leaving = sync.disconnect().then(() => {
      finished = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(finished).toBe(false);
    expect(await files.read(RECORD)).not.toBeNull();
    await passGate.end();
    await leaving;
    expect(await files.read(RECORD)).toBeNull();
  });

  it("cut short after the record, stays connected from no record: the next pass merges", async () => {
    passes.mockResolvedValue(done());
    const files = memoryFiles({ failOn: (op, path) => op === "remove" && path === BINDING });
    const { sync } = await started(undefined, undefined, undefined, files);
    await vi.advanceTimersByTimeAsync(0);
    await expect(sync.disconnect()).rejects.toThrow(/killed/);
    await vi.advanceTimersByTimeAsync(0);
    expect(await files.read(RECORD)).toBeNull();
    expect(sync.status.status()).toMatchObject({ state: "synced", folder: "Personal" });
    expect(passes).toHaveBeenCalledTimes(2);
    // Asked again, it finishes.
    await sync.disconnect();
    expect(await readBinding(files)).toBeNull();
    expect(sync.status.status().state).toBe("off");
  });

  it("cut short after the binding, starts unconnected, the sign-in left reaching nothing", async () => {
    passes.mockResolvedValue(done());
    const files = memoryFiles({ failOn: (op, path) => op === "remove" && path === SECRETS });
    const { sync } = await started(undefined, undefined, undefined, files);
    await vi.advanceTimersByTimeAsync(0);
    await sync.disconnect();
    expect(sync.status.status().state).toBe("off");
    remotes.length = 0;
    const again = createPhoneSync(files, storeOn(files));
    await again.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(again.status.status().state).toBe("off");
    expect(remotes).toHaveLength(0);
    expect(passes).toHaveBeenCalledOnce();
  });
});

describe("the binding's account, before any file call", () => {
  it("stops a sign-in from another account, reaching no file and never retrying", async () => {
    let polls = 0;
    longpoll = async () => {
      polls++;
      return hang();
    };
    // Credentials left behind that claim A but are B's.
    const { sync } = await started({ refreshToken: "theirs", accountId: "dbid:A" });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(sync.status.status().problems).toEqual([{ kind: "other-account" }]);
    expect(passes).not.toHaveBeenCalled();
    expect(polls).toBe(0);
  });

  it("checks once per sign-in, not once per pass", async () => {
    passes.mockResolvedValue(done());
    const { sync } = await started();
    await vi.advanceTimersByTimeAsync(0);
    const lookups = remotes.length;
    sync.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(passes).toHaveBeenCalledTimes(2);
    expect(remotes).toHaveLength(lookups);
  });
});
