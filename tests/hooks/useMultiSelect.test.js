/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useMultiSelect } from "../../src/hooks/useMultiSelect";

afterEach(cleanup);

// Four root notes in sidebar order; no folders.
const setup = () => {
  const openNote = vi.fn();
  const hook = renderHook(() =>
    useMultiSelect({ filteredTree: [], fNotes: ["a", "b", "c", "d"], expanded: {}, openNote }),
  );
  const click = (id, mods = {}) =>
    act(() =>
      hook.result.current.handleNoteClick(id, {
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        ...mods,
      }),
    );
  const selected = () => [...hook.result.current.selectedNotes].sort();
  return { openNote, click, selected };
};

describe("Shift-click ranges", () => {
  it("from the note a plain click opened", () => {
    const { openNote, click, selected } = setup();
    click("a");
    expect(openNote).toHaveBeenCalledWith("a");
    click("c", { shiftKey: true });
    expect(selected()).toEqual(["a", "b", "c"]);
    // The range is a selection; it opens nothing new.
    expect(openNote).toHaveBeenCalledTimes(1);
  });

  it("upwards as well as down", () => {
    const { click, selected } = setup();
    click("d");
    click("b", { shiftKey: true });
    expect(selected()).toEqual(["b", "c", "d"]);
  });

  it("from the note a Cmd-click added", () => {
    const { click, selected } = setup();
    click("b", { metaKey: true });
    click("d", { shiftKey: true });
    expect(selected()).toEqual(["b", "c", "d"]);
  });

  it("a plain click clears the selection and moves the anchor", () => {
    const { click, selected } = setup();
    click("a");
    click("b", { shiftKey: true });
    click("d");
    expect(selected()).toEqual([]);
    click("c", { shiftKey: true });
    expect(selected()).toEqual(["c", "d"]);
  });
});
