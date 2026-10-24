/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#fff", secondary: "#aaa", muted: "#666" },
      BG: { elevated: "#2a2a2e", divider: "#444", hover: "#555" },
    },
    isDark: true,
  }),
}));

vi.mock("../../../src/utils/inlineFormatting", () => ({
  inlineMarkdownToHtml: (md) => md || "",
}));

// The vault's live note data, which the embed reads (EmbedBlock's context).
const live = { noteData: {} };
vi.mock("../../../src/context/NoteDataContext", () => ({ useNoteData: () => live }));

import EmbedBlock from "../../../src/components/blocks/EmbedBlock";

describe("EmbedBlock", () => {
  const noteData = {
    "note-2": {
      id: "note-2",
      title: "My Target Note",
      content: {
        blocks: [
          { id: "eb1", type: "p", text: "First paragraph" },
          { id: "eb2", type: "p", text: "Second paragraph" },
        ],
      },
    },
  };

  const defaultProps = {
    block: { id: "e1", type: "embed", target: "My Target Note" },
    accentColor: "#A4CACE",
    onNavigate: vi.fn(),
    depth: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    live.noteData = noteData;
  });

  afterEach(cleanup);

  it('renders "not found" message when target note does not exist', () => {
    const props = {
      ...defaultProps,
      block: { id: "e2", type: "embed", target: "Nonexistent Note" },
    };
    const { container } = render(<EmbedBlock {...props} />);
    expect(container.textContent).toContain('"Nonexistent Note" not found');
  });

  // The button said Create note and only showed a refusal: the app makes no
  // note from a link (wikilinkTarget).
  it("offers no Create note button for a missing note", () => {
    const props = { ...defaultProps, block: { id: "e2", type: "embed", target: "Nonexistent" } };
    const { container } = render(<EmbedBlock {...props} />);
    expect(container.querySelector("button")).toBeNull();
  });

  // Resolved as a click on [[target]] is: a folder path is the path, and a
  // shared name is said, never guessed (it took whichever note came first).
  it("finds a note by its folder path, and never guesses between namesakes", () => {
    live.noteData = {
      a: {
        id: "a",
        title: "Goals",
        folder: "Work",
        content: { blocks: [{ id: "x", type: "p", text: "work goals" }] },
      },
      b: {
        id: "b",
        title: "Goals",
        folder: "Home",
        content: { blocks: [{ id: "y", type: "p", text: "home goals" }] },
      },
    };
    const atPath = render(
      <EmbedBlock {...defaultProps} block={{ id: "e5", type: "embed", target: "Work/Goals" }} />,
    );
    expect(atPath.container.textContent).toContain("work goals");
    cleanup();
    const shared = render(
      <EmbedBlock {...defaultProps} block={{ id: "e6", type: "embed", target: "Goals" }} />,
    );
    expect(shared.container.textContent).toContain('"Goals" names 2 notes');
    expect(shared.container.textContent).not.toContain("goals");
  });

  it("follows edits to its note", () => {
    const { container, rerender } = render(<EmbedBlock {...defaultProps} />);
    expect(container.textContent).toContain("First paragraph");
    const edited = structuredClone(noteData);
    edited["note-2"].content.blocks[0].text = "Edited paragraph";
    live.noteData = edited;
    rerender(<EmbedBlock {...defaultProps} />);
    expect(container.textContent).toContain("Edited paragraph");
  });

  it("renders the embedded note content when target exists", () => {
    const { container } = render(<EmbedBlock {...defaultProps} />);
    expect(container.textContent).toContain("My Target Note");
    expect(container.textContent).toContain("First paragraph");
    expect(container.textContent).toContain("Second paragraph");
  });

  it("calls onNavigate with note id when embedded content is clicked", () => {
    const { container } = render(<EmbedBlock {...defaultProps} />);
    // The clickable wrapper has the border-left style
    const wrapper = container.firstChild;
    fireEvent.click(wrapper);
    expect(defaultProps.onNavigate).toHaveBeenCalledWith("note-2");
  });

  it("shows heading suffix when block has a heading", () => {
    const props = {
      ...defaultProps,
      block: { id: "e3", type: "embed", target: "My Target Note", heading: "Section 1" },
    };
    const { container } = render(<EmbedBlock {...props} />);
    expect(container.textContent).toContain("My Target Note");
    expect(container.textContent).toContain("> Section 1");
  });

  it("renders depth limit message at depth >= 3", () => {
    const props = { ...defaultProps, depth: 3 };
    const { container } = render(<EmbedBlock {...props} />);
    expect(container.textContent).toContain("Embed depth limit reached");
  });

  it("does case-insensitive matching for target note", () => {
    const props = {
      ...defaultProps,
      block: { id: "e4", type: "embed", target: "my target note" },
    };
    const { container } = render(<EmbedBlock {...props} />);
    expect(container.textContent).toContain("First paragraph");
  });
});
