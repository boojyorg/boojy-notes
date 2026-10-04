/** @vitest-environment jsdom */
/**
 * A row's small action: muted at rest, full ink under the pointer and never a
 * box, named by the app's chip (label and key), never a native title.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#6F6861" },
      BG: { elevated: "#FFFFFF", divider: "#E9E9E9", hover: "#ECECEC", editor: "#FFFFFF" },
    },
  }),
}));

import RowAction from "../../src/components/RowAction";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RowAction", () => {
  it("darkens under the pointer with no box, and shows its chip with the key", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    render(
      <RowAction
        label="Restore “Plan”"
        tip="Restore note"
        shortcut="↵"
        icon={<span />}
        onClick={onClick}
      />,
    );
    const b = screen.getByRole("button", { name: "Restore “Plan”" });
    expect(b).not.toHaveAttribute("title");
    expect(b.style.color).toBe("rgb(111, 104, 97)");
    fireEvent.mouseEnter(b);
    expect(b.style.color).toBe("rgb(20, 17, 15)");
    expect(b.style.background).toBe("transparent");
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByTestId("row-action-tooltip")).toHaveTextContent("Restore note");
    expect(screen.getByTestId("row-action-tooltip")).toHaveTextContent("↵");
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
