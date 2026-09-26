/** @vitest-environment jsdom */
/**
 * What Version History does: opening flushes and loads; choosing shows a
 * version; a restore keeps the note first and Undo puts it back; a delete has
 * Undo; the switch asks what to keep; another note is Now again.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  history: {
    list: vi.fn(),
    read: vi.fn(),
    mark: vi.fn(),
    name: vi.fn(),
    remove: vi.fn(),
    undelete: vi.fn(),
    setOff: vi.fn(),
    clock24h: vi.fn(),
  },
}));
vi.mock("../../src/services/apiProvider", () => ({ getAPI: () => api }));

import { useVersionHistory, versionLabel } from "../../src/hooks/useVersionHistory";

const versions = [
  { id: "v2", at: 2, kind: "point", hash: "b", name: "Submitted" },
  { id: "v1", at: 1, kind: "auto", hash: "a" },
];

function setup(overrides = {}) {
  const noteDataRef = {
    current: { n1: { title: "Essay", content: { blocks: [{ id: "b", type: "p", text: "Now" }] } } },
  } as never;
  const deps = {
    activeNote: "n1" as string | null,
    noteDataRef,
    unflushedNotes: { current: new Set<string>() },
    flushToDisk: vi.fn().mockResolvedValue(undefined),
    commitNoteData: vi.fn(),
    syncGeneration: { current: 0 },
    sourceView: false,
    setSourceView: vi.fn(),
    showToast: vi.fn().mockReturnValue(1),
    requestConfirm: vi.fn(),
    ...overrides,
  };
  const hook = renderHook((props) => useVersionHistory(props), { initialProps: deps });
  return { ...hook, deps };
}

beforeEach(() => {
  for (const fn of Object.values(api.history)) fn.mockReset();
  api.history.list.mockResolvedValue({ versions, off: false });
  api.history.read.mockResolvedValue("Then\n");
  api.history.clock24h.mockResolvedValue(true);
});
afterEach(cleanup);

describe("useVersionHistory", () => {
  it("names a version by its name, else by what made it", () => {
    expect(versionLabel({ kind: "point" })).toBe("Save point");
    expect(versionLabel({ kind: "auto" })).toBe("Autosave");
    expect(versionLabel({ kind: "auto", reason: "Before restore" })).toBe("Before restore");
    expect(versionLabel({ kind: "auto", name: "Mine" })).toBe("Mine");
  });

  it("opens after writing pending edits, with the note's versions and the Mac's clock", async () => {
    const { result, deps } = setup();
    await act(() => result.current.open());
    expect(deps.flushToDisk).toHaveBeenCalled();
    expect(result.current.state).toMatchObject({ noteId: "n1", listOpen: true, versions });
    expect(result.current.hour12).toBe(false);
  });

  it("shows a chosen version, and turns the Markdown view off while it looks back", async () => {
    const { result, deps } = setup({ sourceView: true });
    await act(() => result.current.open());
    expect(deps.setSourceView).toHaveBeenCalledWith(false);
    await act(() => result.current.select("v1"));
    expect(result.current.state.past?.id).toBe("v1");
    act(() => result.current.close());
    expect(deps.setSourceView).toHaveBeenLastCalledWith(true);
    expect(result.current.state.noteId).toBeNull();
  });

  it("restores after keeping the note, and Undo puts the note back", async () => {
    const { result, deps } = setup();
    await act(() => result.current.open());
    await act(() => result.current.restore("v1"));
    expect(api.history.mark).toHaveBeenCalledWith("n1", "Before restore");
    expect(deps.commitNoteData).toHaveBeenCalledTimes(1);
    const [message, , options] = deps.showToast.mock.calls[0];
    expect(message).toBe("Restored Autosave");
    options.action.run();
    expect(deps.commitNoteData).toHaveBeenCalledTimes(2);
    const undo = deps.commitNoteData.mock.calls[1][0];
    const back = undo((deps.noteDataRef as { current: Record<string, unknown> }).current);
    expect(back.n1.content.blocks[0].text).toBe("Now");
  });

  it("deletes a version with Undo, and names one", async () => {
    const { result, deps } = setup();
    await act(() => result.current.open());
    await act(() => result.current.remove("v2"));
    expect(api.history.remove).toHaveBeenCalledWith("n1", "v2");
    const [message, , options] = deps.showToast.mock.calls[0];
    expect(message).toBe("Submitted deleted");
    await act(() => options.action.run());
    expect(api.history.undelete).toHaveBeenCalledWith("n1", versions[0]);
    await act(() => result.current.rename("v1", "Draft"));
    expect(api.history.name).toHaveBeenCalledWith("n1", "v1", "Draft");
  });

  it("asks before turning history off: Keep Them keeps, Delete Them deletes, cancel does nothing", async () => {
    const { result, deps } = setup();
    await act(() => result.current.open());
    deps.requestConfirm.mockResolvedValueOnce("alt");
    await act(() => result.current.setOff(true));
    expect(api.history.setOff).toHaveBeenLastCalledWith("n1", true, true);
    deps.requestConfirm.mockResolvedValueOnce(true);
    await act(() => result.current.setOff(true));
    expect(api.history.setOff).toHaveBeenLastCalledWith("n1", true, false);
    deps.requestConfirm.mockResolvedValueOnce(false);
    api.history.setOff.mockClear();
    await act(() => result.current.setOff(true));
    expect(api.history.setOff).not.toHaveBeenCalled();
    await act(() => result.current.setOff(false));
    expect(api.history.setOff).toHaveBeenCalledWith("n1", false);
  });

  it("is Now again when another note opens, and the question hides the list", async () => {
    const { result, rerender, deps } = setup();
    await act(() => result.current.open());
    act(() => result.current.setAsk(true));
    expect(result.current.state).toMatchObject({ ask: true, listOpen: false });
    rerender({ ...deps, activeNote: "n2" });
    expect(result.current.state.noteId).toBeNull();
  });
});
