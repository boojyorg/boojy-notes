/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTableInteractions } from "../../src/hooks/useTableInteractions";

afterEach(cleanup);

// The rows as rendered; the reshape is handed the rows the keystroke ref holds.
const block = {
  rows: [
    ["Name", "Qty"],
    ["Tea", "2"],
  ],
  alignments: ["left", "right"],
};
const setup = () => {
  const onUpdateTableRows = vi.fn();
  const onRowsAdded = vi.fn();
  const { result } = renderHook(() =>
    useTableInteractions({ block, noteId: "n", blockIndex: 3, onUpdateTableRows, onRowsAdded }),
  );
  const reshapeOf = (call = 0) => onUpdateTableRows.mock.calls[call][2];
  return { result, onUpdateTableRows, onRowsAdded, reshapeOf };
};
const pending = [
  ["Name", "Qty"],
  ["typed", "2", "wide"],
];

describe("useTableInteractions: the add bars", () => {
  it("adds rows as wide as the widest row, from the rows as the ref holds them, and hands the caret the first", () => {
    const { result, onUpdateTableRows, onRowsAdded, reshapeOf } = setup();
    act(() => result.current.addRows(2));
    expect(onUpdateTableRows).toHaveBeenCalledWith("n", 3, expect.any(Function));
    expect(onRowsAdded).toHaveBeenCalledExactlyOnceWith(2);
    expect(reshapeOf()(pending, [])).toEqual({
      rows: [...pending, ["", "", ""], ["", "", ""]],
    });
  });

  it("adds columns after the widest row's last, padding short rows, each aligned left", () => {
    const { result, reshapeOf } = setup();
    act(() => result.current.handleRightZoneClick());
    const { rows, alignments } = reshapeOf()(pending, ["left", "right"]);
    expect(rows.map((r) => r.length)).toEqual([4, 4]);
    expect(alignments).toEqual(["left", "right", "left"]);
  });

  it("a drag outward adds one per step on release, and the click that ends it adds nothing", () => {
    const { result, onUpdateTableRows, reshapeOf } = setup();
    act(() => result.current.handleBottomZonePointerDown({ clientX: 0, clientY: 0 }));
    act(() =>
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 0, clientY: 3 * 36 + 5 })),
    );
    expect(result.current.previewRows).toBe(3);
    expect(result.current.createBadge).toMatchObject({ count: 3 });
    act(() => window.dispatchEvent(new MouseEvent("pointerup")));
    act(() => result.current.handleBottomZoneClick());
    expect(onUpdateTableRows).toHaveBeenCalledTimes(1);
    expect(reshapeOf()(block.rows, []).rows).toHaveLength(5);
    expect(result.current.previewRows).toBe(0);
    expect(result.current.createBadge).toBeNull();
  });
});
