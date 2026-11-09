/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      BG: { elevated: "#FFFFFF", divider: "#E9E9E9", hover: "#ECECEC", surface: "#F4F4F5" },
      ACCENT: { primary: "#8FC1C6", text: "#2A737D", onAccent: "#FFFFFF" },
      SEMANTIC: { error: "#D43030" },
      modalShadow: "none",
    },
  }),
}));

import MissingAttachment from "../../src/components/blocks/MissingAttachment";

afterEach(cleanup);

describe("MissingAttachment", () => {
  it("offers Remove in the note", () => {
    render(<MissingAttachment src="https://example.com/cat.png" image onRemove={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Attachment options" }));
    expect(screen.getByRole("menuitem", { name: "Remove" })).toBeTruthy();
  });

  // In a copy (an embed) there is nothing to remove: an options button that
  // opened nothing, and a right-click it swallowed.
  it("shows no options and leaves right-click alone when it has nothing to offer", () => {
    render(<MissingAttachment src="https://example.com/cat.png" image />);
    expect(screen.queryByRole("button", { name: "Attachment options" })).toBeNull();
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    screen.getByTestId("missing-attachment").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
