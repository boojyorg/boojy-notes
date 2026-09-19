/** @vitest-environment jsdom */
/**
 * The scale's own feedback. `Cmd+±` used to change the size of everything with
 * nothing to say what it had changed it to, and `Cmd+0` was the only way back
 * with nothing to say so. The chip says the figure once and carries the reset
 * shortcut while there is something to reset.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      BG: { elevated: "#fff", divider: "#E9E9E9", surface: "#F4F4F5" },
      TEXT: { primary: "#14110F", secondary: "#47403A" },
      modalShadow: "0 24px 48px rgba(0,0,0,0.12)",
    },
  }),
}));

import UiScaleChip, { SCALE_HINT_MS } from "../../src/components/UiScaleChip";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("UiScaleChip", () => {
  it("says nothing until a press", () => {
    render(<UiScaleChip hint={null} onHide={vi.fn()} left={0} />);
    expect(screen.queryByTestId("ui-scale-chip")).toBeNull();
  });

  it("says the scale, with the reset shortcut while there is something to reset", () => {
    const { rerender } = render(
      <UiScaleChip hint={{ at: 1, scale: 120 }} onHide={vi.fn()} left={240} />,
    );
    expect(screen.getByTestId("ui-scale-chip")).toHaveTextContent("Interface size 120%");
    expect(screen.getByTestId("ui-scale-chip")).toHaveTextContent(/resets/);

    // At 100% there is nothing to reset to, so it is the figure alone.
    rerender(<UiScaleChip hint={{ at: 2, scale: 100 }} onHide={vi.fn()} left={240} />);
    expect(screen.getByTestId("ui-scale-chip")).toHaveTextContent("Interface size 100%");
    expect(screen.getByTestId("ui-scale-chip")).not.toHaveTextContent(/resets/);
  });

  it("goes after one beat, and a second press re-times it rather than stacking", () => {
    const onHide = vi.fn();
    const { rerender } = render(
      <UiScaleChip hint={{ at: 1, scale: 110 }} onHide={onHide} left={0} />,
    );
    act(() => {
      vi.advanceTimersByTime(SCALE_HINT_MS - 100);
    });
    expect(onHide).not.toHaveBeenCalled();

    // A press before it hides: the timer starts again from that press.
    rerender(<UiScaleChip hint={{ at: 2, scale: 120 }} onHide={onHide} left={0} />);
    act(() => {
      vi.advanceTimersByTime(SCALE_HINT_MS - 100);
    });
    expect(onHide).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("is centred on the editor pane and never takes the pointer", () => {
    render(<UiScaleChip hint={{ at: 1, scale: 120 }} onHide={vi.fn()} left={264} />);
    const holder = screen.getByTestId("ui-scale-chip").parentElement as HTMLElement;
    expect(holder.style.left).toBe("264px");
    expect(holder.style.justifyContent).toBe("center");
    expect(holder.style.pointerEvents).toBe("none");
  });
});
