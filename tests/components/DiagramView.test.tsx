/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: false,
    theme: {
      codeBlockBg: "#F4F4F5",
      BG: { elevated: "#FFFFFF" },
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#6F6861" },
      SEMANTIC: { error: "#C62D2D" },
      scrollbar: { thumbHover: "#C4C2BF" },
    },
  }),
}));

// Each call answers when the test says so, so the order of answers can be staged.
const pending: Array<{ source: string; resolve: (v: unknown) => void }> = [];
vi.mock("../../src/utils/mermaid", () => ({
  drawDiagram: (source: string) =>
    source.trim()
      ? new Promise((resolve) => pending.push({ source, resolve }))
      : Promise.resolve({ empty: true }),
}));

import DiagramView from "../../src/components/DiagramView";

beforeEach(() => {
  vi.useFakeTimers();
  pending.length = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const answer = async (i: number, value: unknown) => {
  await act(async () => {
    pending[i].resolve(value);
    await Promise.resolve();
  });
};

describe("DiagramView", () => {
  it("draws, then keeps the last drawing faded with the reason while the source is broken", async () => {
    const view = render(<DiagramView source="graph TD; A-->B" emptyText="Empty diagram" />);
    await act(async () => vi.advanceTimersByTime(0));
    await answer(0, { svg: "<svg data-test='one'></svg>" });
    expect(document.querySelector("[data-test='one']")).not.toBeNull();
    view.rerender(<DiagramView source="graph TD; A--" emptyText="Empty diagram" />);
    await act(async () => vi.advanceTimersByTime(250));
    await answer(1, { error: "Parse error on line 1" });
    expect(screen.getByRole("status").textContent).toMatch(/last version that worked/);
    expect(document.querySelector("[data-test='one']")).not.toBeNull();
  });

  it("drops a drawing that answers after a newer one was asked for", async () => {
    const view = render(<DiagramView source="graph TD; A" emptyText="Empty diagram" />);
    await act(async () => vi.advanceTimersByTime(0));
    view.rerender(<DiagramView source="graph TD; B" emptyText="Empty diagram" />);
    await act(async () => vi.advanceTimersByTime(250));
    await answer(1, { svg: "<svg data-test='new'></svg>" });
    await answer(0, { svg: "<svg data-test='old'></svg>" });
    expect(document.querySelector("[data-test='new']")).not.toBeNull();
    expect(document.querySelector("[data-test='old']")).toBeNull();
  });

  it("says what it will show when there is nothing to draw", async () => {
    render(<DiagramView source="" emptyText="Your diagram appears here" />);
    expect(screen.getByText("Your diagram appears here")).toBeTruthy();
  });
});
