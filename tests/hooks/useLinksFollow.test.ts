/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Note, NoteData } from "../../src/types/notes";

const mark = vi.fn(async (_id: string, _reason: string) => ({ ok: true }) as const);
let api: { history: { mark: typeof mark } } | null = { history: { mark } };
vi.mock("../../src/services/apiProvider", () => ({ getAPI: () => api }));

import {
  LINKS_FOLLOW_REASON,
  linksFollowedMessage,
  useLinksFollow,
} from "../../src/hooks/useLinksFollow";

const note = (id: string, title: string, text: string, folder: string | null = null): Note =>
  ({ id, title, folder, content: { title, blocks: [{ id: `${id}-b`, type: "p", text }] } }) as Note;

function setup(data: NoteData, over: Record<string, unknown> = {}) {
  const noteDataRef = { current: data };
  const adoptNoteData = vi.fn((updater: (prev: NoteData) => NoteData) => {
    noteDataRef.current = updater(noteDataRef.current);
  });
  const showToast = vi.fn();
  const field = document.body.appendChild(document.createElement("div"));
  field.tabIndex = 0;
  const deps = {
    noteDataRef,
    adoptNoteData,
    unflushedNotes: { current: new Set<string>() },
    activeNoteRef: { current: null as string | null },
    titleRef: { current: field },
    syncGeneration: { current: 0 },
    showToast,
    ...over,
  };
  const { result } = renderHook(() => useLinksFollow(deps));
  return { ...deps, field, result };
}

const textOf = (data: NoteData, id: string) => data[id].content.blocks[0].text;

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  mark.mockClear();
  api = { history: { mark } };
});

describe("linksFollowedMessage", () => {
  it("counts the links and the notes, and says what could not be read", () => {
    expect(linksFollowedMessage(1, 1, 0)).toBe("Updated 1 link in 1 note.");
    expect(linksFollowedMessage(12, 5, 0)).toBe("Updated 12 links in 5 notes.");
    expect(linksFollowedMessage(2, 1, 3)).toBe(
      "Updated 2 links in 1 note; 3 notes kept online or not readable were not checked.",
    );
    expect(linksFollowedMessage(0, 0, 1)).toBe(
      "Links: 1 note kept online or not readable was not checked.",
    );
    expect(linksFollowedMessage(0, 0, 0)).toBe("");
  });
});

describe("useLinksFollow", () => {
  const renamed = () =>
    setup({ a: note("a", "Alpha", "see [[Beta]]"), b: note("b", "Gamma", "body") });
  const from = { title: "Beta", folder: null };
  const to = { title: "Gamma", folder: null };

  it("follows a rename the app wrote: a version first, one adopted change, one toast", async () => {
    const h = renamed();
    h.result.current.onNoteRenamed("b", from, to);
    await act(() => h.result.current.settle());

    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledWith("a", LINKS_FOLLOW_REASON);
    expect(textOf(h.noteDataRef.current, "a")).toBe("see [[Gamma]]");
    expect(h.adoptNoteData).toHaveBeenCalledTimes(1);
    // The rewritten note's undo entries hold its old links: they go.
    expect(h.adoptNoteData.mock.calls[0][1]).toEqual({ forget: ["a"] });
    expect(h.showToast).toHaveBeenCalledWith("Updated 1 link in 1 note.", "done", {
      key: "links-follow",
    });

    // Followed once: a later flush finds nothing left to do.
    await act(() => h.result.current.settle());
    expect(h.adoptNoteData).toHaveBeenCalledTimes(1);
    expect(h.showToast).toHaveBeenCalledTimes(1);
  });

  it("follows from the first name when the file was renamed more than once on the way", async () => {
    const h = renamed();
    h.result.current.onNoteRenamed("b", from, { title: "Ga", folder: null });
    // The note is called Gamma but the file is still `Ga`: not settled.
    await act(() => h.result.current.settle());
    expect(h.adoptNoteData).not.toHaveBeenCalled();
    h.result.current.onNoteRenamed("b", { title: "Ga", folder: null }, to);
    await act(() => h.result.current.settle());
    expect(textOf(h.noteDataRef.current, "a")).toBe("see [[Gamma]]");
  });

  it("waits while the name is under the caret or keystrokes are unwritten", async () => {
    const h = renamed();
    h.activeNoteRef.current = "b";
    h.field.focus();
    h.result.current.onNoteRenamed("b", from, to);
    await act(() => h.result.current.settle());
    expect(h.adoptNoteData).not.toHaveBeenCalled();

    h.field.blur();
    h.unflushedNotes.current.add("b");
    await act(() => h.result.current.settle());
    expect(h.adoptNoteData).not.toHaveBeenCalled();

    h.unflushedNotes.current.delete("b");
    await act(() => h.result.current.settle());
    expect(textOf(h.noteDataRef.current, "a")).toBe("see [[Gamma]]");
  });

  it("on the app's close, takes a name still under the caret as settled, and says it left more to write", async () => {
    const h = renamed();
    h.activeNoteRef.current = "b";
    h.field.focus();
    h.result.current.onNoteRenamed("b", from, to);
    let more = true;
    await act(async () => {
      more = await h.result.current.settle();
    });
    expect(more).toBe(false);
    await act(async () => {
      more = await h.result.current.settle({ final: true });
    });
    expect(more).toBe(true);
    expect(textOf(h.noteDataRef.current, "a")).toBe("see [[Gamma]]");
  });

  it("a new note has no name to follow from until its first name settles", async () => {
    // `[[Project]]` names no note. A new one is typed as far as `Project`
    // (written under that name at the pause), then on to `Project Plan`.
    const h = setup({ a: note("a", "Alpha", "see [[Project]]"), n: note("n", "Project Plan", "") });
    const half = { title: "Project", folder: null };
    const full = { title: "Project Plan", folder: null };
    h.result.current.onNoteWritten("n", half, { created: true });
    h.result.current.onNoteWritten("n", full, { from: half });
    await act(() => h.result.current.settle());
    expect(textOf(h.noteDataRef.current, "a")).toBe("see [[Project]]");
    expect(h.adoptNoteData).not.toHaveBeenCalled();

    // Settled under its first name, it is a note like any other: a later rename is followed.
    h.noteDataRef.current = {
      ...h.noteDataRef.current,
      a: note("a", "Alpha", "see [[Project Plan]]"),
      n: note("n", "Scheme", ""),
    };
    h.result.current.onNoteWritten("n", { title: "Scheme", folder: null }, { from: full });
    await act(() => h.result.current.settle());
    expect(textOf(h.noteDataRef.current, "a")).toBe("see [[Scheme]]");
  });

  it("a rename made outside before the app's own has settled takes its origin with it", async () => {
    const h = renamed();
    h.activeNoteRef.current = "b";
    h.field.focus();
    h.result.current.onNoteRenamed("b", from, to);
    await act(() => h.result.current.settle());
    // Finder renames it on; the app's rename is overtaken and is never followed,
    h.result.current.onOutsideMove("b");
    h.field.blur();
    await act(() => h.result.current.settle());
    expect(h.adoptNoteData).not.toHaveBeenCalled();
    // nor is its stale origin the place a later rename is followed from.
    h.noteDataRef.current = {
      a: note("a", "Alpha", "see [[Beta]] and [[Carol]]"),
      b: note("b", "Dora", "body"),
    };
    h.result.current.onNoteRenamed(
      "b",
      { title: "Carol", folder: null },
      { title: "Dora", folder: null },
    );
    await act(() => h.result.current.settle());
    expect(textOf(h.noteDataRef.current, "a")).toBe("see [[Beta]] and [[Dora]]");
  });

  it("a settle asked for while one is running waits for it, and a closing one reports its rewrite", async () => {
    const h = renamed();
    let release: (r: { ok: true }) => void = () => {};
    mark.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)) as never);
    h.result.current.onNoteRenamed("b", from, to);
    // The flush's own settle is waiting on the version when the app closes.
    const first = h.result.current.settle();
    const closing = h.result.current.settle({ final: true });
    let done = false;
    closing.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    release({ ok: true });
    let more = false;
    await act(async () => {
      await first;
      more = await closing;
    });
    // Nothing was left for the closing settle itself, but there is more to write.
    expect(more).toBe(true);
    expect(textOf(h.noteDataRef.current, "a")).toBe("see [[Gamma]]");
  });

  it("bumps the paint signal only when the open note is one it rewrote", async () => {
    const h = renamed();
    h.activeNoteRef.current = "a";
    h.result.current.onNoteRenamed("b", from, to);
    await act(() => h.result.current.settle());
    expect(h.syncGeneration.current).toBe(1);

    const other = renamed();
    other.activeNoteRef.current = "b";
    other.result.current.onNoteRenamed("b", from, to);
    await act(() => other.result.current.settle());
    expect(other.syncGeneration.current).toBe(0);
  });

  it("leaves a note whose version could not be kept, and rewrites one whose history is off", async () => {
    const h = setup({
      a: note("a", "Alpha", "[[Beta]]"),
      c: note("c", "Carol", "[[Beta]]"),
      b: note("b", "Gamma", "body"),
    });
    mark.mockImplementation(async (id: string) =>
      id === "a"
        ? ({ ok: false, reason: "failed" } as never)
        : ({ ok: false, reason: "off" } as never),
    );
    h.result.current.onNoteRenamed("b", from, to);
    await act(() => h.result.current.settle());
    expect(textOf(h.noteDataRef.current, "a")).toBe("[[Beta]]");
    expect(textOf(h.noteDataRef.current, "c")).toBe("[[Gamma]]");
    expect(h.showToast).toHaveBeenCalledWith("Updated 1 link in 1 note.", "done", {
      key: "links-follow",
    });
    mark.mockImplementation(async () => ({ ok: true }) as const);
  });

  it("rewrites nothing where there is no history to keep a version in", async () => {
    api = null;
    const h = renamed();
    h.result.current.onNoteRenamed("b", from, to);
    await act(() => h.result.current.settle());
    expect(h.adoptNoteData).not.toHaveBeenCalled();
    expect(h.showToast).not.toHaveBeenCalled();
  });

  it("what could not be read is said in a toast that fades and replaces the last one", async () => {
    const data = {
      a: note("a", "Alpha", "no links"),
      b: note("b", "Gamma", "body"),
      c: note("c", "Cloud", ""),
    };
    data.c = { ...data.c, offloaded: true };
    const h = setup(data);
    h.result.current.onNoteRenamed("b", from, to);
    await act(() => h.result.current.settle());
    expect(h.showToast).toHaveBeenCalledWith(
      "Links: 1 note kept online or not readable was not checked.",
      "done",
      { key: "links-follow" },
    );
  });

  it("says nothing when no link named the note, and forgets a note that is gone", async () => {
    const h = setup({ a: note("a", "Alpha", "no links"), b: note("b", "Gamma", "body") });
    h.result.current.onNoteRenamed("b", from, to);
    h.result.current.onNoteRenamed("gone", from, to);
    await act(() => h.result.current.settle());
    expect(mark).not.toHaveBeenCalled();
    expect(h.adoptNoteData).not.toHaveBeenCalled();
    expect(h.showToast).not.toHaveBeenCalled();
  });
});
