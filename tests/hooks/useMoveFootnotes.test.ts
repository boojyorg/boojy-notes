/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteData } from "../../src/types/notes";
import { blocksToMarkdown, markdownToBlocks } from "../../src/utils/markdown";

type Mark = { ok: true } | { ok: false; reason: "off" | "unknown" | "failed" };
let api: { history?: { mark: ReturnType<typeof vi.fn> } } | null = null;
vi.mock("../../src/services/apiProvider", () => ({ getAPI: () => api }));

import { MOVE_FOOTNOTES_REASON, useMoveFootnotes } from "../../src/hooks/useMoveFootnotes";

const NOTE = "One.[^b] Two.[^a]\n\n[^a]: Ay.\n\nMiddle.\n\n[^b]: Bee.\n";
const MOVED = "One.[^b] Two.[^a]\n\nMiddle.\n\n[^b]: Bee.\n[^a]: Ay.\n";

/** The hook over one note, `n1`, with its commit applied to the ref as useHistory applies it. */
function setup({
  md = NOTE,
  outside = false,
  flush = async () => true as boolean | undefined,
}: {
  md?: string;
  outside?: boolean;
  flush?: () => Promise<boolean | undefined>;
} = {}) {
  const noteDataRef = {
    current: {
      n1: {
        id: "n1",
        title: "F",
        ...(outside ? { outside: "/x" } : {}),
        content: { title: "F", blocks: markdownToBlocks(md) },
      },
    } as unknown as NoteData,
  };
  const activeNoteRef = { current: "n1" as string | null };
  const commitNoteData = vi.fn((updater: (prev: NoteData) => NoteData, _opts?: unknown) => {
    noteDataRef.current = updater(noteDataRef.current);
  });
  const showToast = vi.fn(() => 1);
  const flushAll = vi.fn(flush);
  const { result } = renderHook(() =>
    useMoveFootnotes({
      noteDataRef,
      activeNoteRef,
      flushAll,
      commitNoteData,
      syncGeneration: { current: 0 },
      showToast,
    }),
  );
  const text = () =>
    blocksToMarkdown(
      (noteDataRef.current.n1 as unknown as { content: { blocks: never[] } }).content.blocks,
    );
  /** The note edited as a keystroke edits it: a new blocks array in the ref. */
  const type = () => {
    const n = noteDataRef.current.n1 as unknown as { content: { blocks: { text?: string }[] } };
    const blocks = n.content.blocks.map((b, i) => (i === 0 ? { ...b, text: `${b.text}!` } : b));
    noteDataRef.current = {
      n1: { ...n, content: { ...n.content, blocks } },
    } as unknown as NoteData;
  };
  return { result, commitNoteData, showToast, flushAll, activeNoteRef, text, type };
}
const toasts = (s: ReturnType<typeof setup>) =>
  s.showToast.mock.calls.map((c) => (c as unknown[]).slice(0, 2));

beforeEach(() => {
  api = { history: { mark: vi.fn(async (): Promise<Mark> => ({ ok: true })) } };
});
afterEach(() => {
  cleanup();
  api = null;
});

describe("useMoveFootnotes", () => {
  it("writes, keeps the version, then moves in one commit that spells its own gaps", async () => {
    const s = setup();
    expect(s.result.current.canMoveFootnotes()).toBe(true);
    await s.result.current.moveFootnotes();
    expect(api?.history?.mark).toHaveBeenCalledWith("n1", MOVE_FOOTNOTES_REASON);
    expect(s.commitNoteData).toHaveBeenCalledTimes(1);
    expect(s.commitNoteData.mock.calls[0][1]).toEqual({ ownGaps: true });
    expect(s.text()).toBe(MOVED);
    expect(toasts(s)).toEqual([["Footnotes moved to the bottom", "done"]]);
    expect(s.result.current.canMoveFootnotes()).toBe(false);
  });

  it("does nothing when the footnotes are in place", async () => {
    const s = setup({ md: MOVED });
    await s.result.current.moveFootnotes();
    expect(s.flushAll).not.toHaveBeenCalled();
    expect(s.commitNoteData).not.toHaveBeenCalled();
  });

  it("moves with undo the only way back where there is no history: the phone, an outside note, history off", async () => {
    api = null;
    const phone = setup();
    await phone.result.current.moveFootnotes();
    expect(phone.text()).toBe(MOVED);

    api = { history: { mark: vi.fn(async (): Promise<Mark> => ({ ok: true })) } };
    const outside = setup({ outside: true });
    await outside.result.current.moveFootnotes();
    expect(api.history?.mark).not.toHaveBeenCalled();
    expect(outside.text()).toBe(MOVED);

    api = { history: { mark: vi.fn(async (): Promise<Mark> => ({ ok: false, reason: "off" })) } };
    const off = setup();
    await off.result.current.moveFootnotes();
    expect(off.text()).toBe(MOVED);
  });

  it("refuses, saying why, when the write or the safety save fails", async () => {
    const unwritten = setup({ flush: async () => false });
    await unwritten.result.current.moveFootnotes();
    expect(unwritten.text()).toBe(NOTE);
    expect(toasts(unwritten)).toEqual([
      ["Footnotes not moved: the note couldn't be saved first.", "warning"],
    ]);

    for (const answer of [
      async (): Promise<Mark> => ({ ok: false, reason: "failed" }),
      async (): Promise<Mark> => ({ ok: false, reason: "unknown" }),
      async (): Promise<Mark> => {
        throw new Error("ipc gone");
      },
    ]) {
      api = { history: { mark: vi.fn(answer) } };
      const s = setup();
      await s.result.current.moveFootnotes();
      expect(s.text()).toBe(NOTE);
      expect(toasts(s)[0][0]).toMatch(/couldn't be kept in its version history/);
    }
  });

  it("writes again when the note changed during the write, and refuses if it never settles", async () => {
    let s: ReturnType<typeof setup>;
    let changes = 1;
    s = setup({
      flush: async () => {
        if (changes-- > 0) s.type();
        return true;
      },
    });
    await s.result.current.moveFootnotes();
    expect(s.flushAll).toHaveBeenCalledTimes(2);
    expect(s.text()).toBe(MOVED.replace("Two.[^a]", "Two.[^a]!"));

    s = setup({
      flush: async () => {
        s.type();
        return true;
      },
    });
    await s.result.current.moveFootnotes();
    expect(s.commitNoteData).not.toHaveBeenCalled();
    expect(toasts(s)[0][0]).toMatch(/kept changing/);
  });

  it("drops it silently when another note is opened during a wait", async () => {
    let s: ReturnType<typeof setup>;
    s = setup({
      flush: async () => {
        s.activeNoteRef.current = "n2";
        return true;
      },
    });
    await s.result.current.moveFootnotes();
    expect(s.commitNoteData).not.toHaveBeenCalled();
    expect(s.showToast).not.toHaveBeenCalled();

    api = {
      history: {
        mark: vi.fn(async (): Promise<Mark> => {
          s.activeNoteRef.current = "n2";
          return { ok: true };
        }),
      },
    };
    s = setup();
    await s.result.current.moveFootnotes();
    expect(s.commitNoteData).not.toHaveBeenCalled();
    expect(s.showToast).not.toHaveBeenCalled();
  });
});
