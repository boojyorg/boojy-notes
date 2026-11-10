/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../src/context/ThemeContext";
import RecentCards from "../../src/phone/RecentCards";
import type { NoteData } from "../../src/types/notes";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a card's time on Home", () => {
  // It was worked out once, as Home was drawn: "Just now" stood for hours.
  it("moves on as time passes, and at once when the app comes back to the front", () => {
    const edited = new Date(2026, 10, 10, 12, 0).getTime();
    vi.setSystemTime(edited + 5_000);
    const noteData = {
      a: {
        id: "a",
        title: "Shopping",
        folder: null,
        lastModified: edited,
        content: { blocks: [] },
      },
    } as unknown as NoteData;
    render(
      <ThemeProvider>
        <RecentCards noteData={noteData} editedAt={{}} onOpen={() => {}} inset={24} />
      </ThemeProvider>,
    );
    const foot = () => screen.getByTestId("recent-card").lastChild?.textContent;
    expect(foot()).toBe("Just now");
    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(foot()).toBe("5 min ago");
    // Timers do not run while Android holds the app in the background.
    vi.setSystemTime(edited + 40 * 60_000);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(foot()).toBe("40 min ago");
  });
});
