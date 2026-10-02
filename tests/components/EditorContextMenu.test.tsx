/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#6F6861" },
      BG: { elevated: "#FFFFFF", divider: "#E9E9E9", hover: "#ECECEC" },
      ACCENT: { primary: "#8FC1C6" },
      SEMANTIC: { error: "#B3261E" },
      modalShadow: "none",
    },
  }),
}));

import EditorContextMenu from "../../src/components/EditorContextMenu";

afterEach(cleanup);

function mount(suggestions?: string[] | null) {
  const props = {
    anchor: { top: 100, bottom: 120, left: 200, right: 240 },
    link: null,
    suggestions,
    onReplaceWord: vi.fn(),
    onAddWord: vi.fn(),
    onOpenLink: vi.fn(),
    onCopyLink: vi.fn(),
    onEditLink: vi.fn(),
    onRemoveLink: vi.fn(),
    canCutCopy: true,
    canPaste: true,
    onCut: vi.fn(),
    onCopy: vi.fn(),
    onPaste: vi.fn(),
    onClose: vi.fn(),
  };
  render(<EditorContextMenu {...props} />);
  const rows = screen.getAllByRole("menuitem");
  const labels = rows.map((r) => r.textContent?.replace(/(⌘|Ctrl\+).$/, ""));
  return { props, rows, labels };
}

describe("EditorContextMenu spelling", () => {
  it("puts a misspelled word's guesses and Add to dictionary above Cut, Copy and Paste", () => {
    const { labels, rows, props } = mount(["receive", "relieve"]);
    expect(labels).toEqual(["receive", "relieve", "Add to dictionary", "Cut", "Copy", "Paste"]);
    fireEvent.click(rows[0]);
    expect(props.onReplaceWord).toHaveBeenCalledWith("receive");
    fireEvent.click(rows[2]);
    expect(props.onAddWord).toHaveBeenCalled();
  });

  it("says when there are no guesses, greyed, and still offers Add to dictionary", () => {
    const { labels, rows } = mount([]);
    expect(labels.slice(0, 2)).toEqual(["No suggestions", "Add to dictionary"]);
    expect(rows[0]).toHaveAttribute("aria-disabled", "true");
  });

  it("is Cut, Copy and Paste alone for a word spelled right", () => {
    expect(mount(null).labels).toEqual(["Cut", "Copy", "Paste"]);
  });
});
