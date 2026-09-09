/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, cleanup } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#111", secondary: "#555", muted: "#888" },
      BG: { elevated: "#fff", divider: "#ddd" },
      ACCENT: { primary: "#2A737D", onAccent: "#fff" },
    },
  }),
}));

import TagMenu from "../../src/components/TagMenu.jsx";

const noteData = {
  n1: { title: "A", content: { blocks: [{ type: "p", text: "#review #reading" }] } },
  n2: { title: "B", content: { blocks: [{ type: "p", text: "#review" }] } },
};

function setup(filter = "rev") {
  const onSelect = vi.fn();
  const onDismiss = vi.fn();
  const utils = render(
    <TagMenu
      position={{ top: 10, left: 10 }}
      filter={filter}
      noteData={noteData}
      onSelect={onSelect}
      onDismiss={onDismiss}
    />,
  );
  return { ...utils, onSelect, onDismiss };
}

/**
 * The menu listens on the window in the capture phase, so the key is seen
 * here before the editor's own handler. Dispatching on an element inside the
 * body is how the real keystroke arrives: from the focused block.
 */
function pressInEditor(key) {
  const editor = document.createElement("div");
  document.body.appendChild(editor);
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  act(() => {
    editor.dispatchEvent(event);
  });
  editor.remove();
  return event;
}

afterEach(cleanup);

describe("TagMenu", () => {
  it("lists the matching tags, most used first, with the first selected", () => {
    const { getAllByRole } = setup();
    const options = getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["#review2"]);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
  });

  it("Enter accepts the highlighted tag and consumes the key so the editor never splits the block", () => {
    const { onSelect } = setup();
    const event = pressInEditor("Enter");
    expect(onSelect).toHaveBeenCalledWith("review");
    // The editor's keydown handler returns on a consumed event; this is the signal it reads.
    expect(event.defaultPrevented).toBe(true);
  });

  it("the arrows move the highlight and are consumed too", () => {
    const { getAllByRole, onSelect } = setup("re");
    expect(getAllByRole("option").map((o) => o.textContent)).toEqual(["#review2", "#reading1"]);
    expect(pressInEditor("ArrowDown").defaultPrevented).toBe(true);
    expect(getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
    pressInEditor("Enter");
    expect(onSelect).toHaveBeenCalledWith("reading");
  });

  it("Escape dismisses without selecting", () => {
    const { onSelect, onDismiss } = setup();
    expect(pressInEditor("Escape").defaultPrevented).toBe(true);
    expect(onDismiss).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  // A menu that pops up under a word owns a key only while it is offering a
  // completion (review 2026-09-07, §1.2).
  it("with no match, nothing shows and Enter is the editor's", () => {
    const { onSelect, container } = setup("zzz");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    const event = pressInEditor("Enter");
    expect(onSelect).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("Enter after a tag typed in full is the editor's, whatever the case", () => {
    const { onSelect, getAllByRole } = setup("Review");
    expect(getAllByRole("option").map((o) => o.textContent)).toEqual(["#review2"]);
    const event = pressInEditor("Enter");
    expect(onSelect).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("Enter accepts a tag typed in full once the user has moved the highlight to it", () => {
    const { onSelect } = setup("review");
    pressInEditor("ArrowDown");
    const event = pressInEditor("Enter");
    expect(onSelect).toHaveBeenCalledWith("review");
    expect(event.defaultPrevented).toBe(true);
  });

  it("Space is never the menu's: it ends the tag in the text", () => {
    const { onSelect, onDismiss } = setup();
    const event = pressInEditor(" ");
    expect(event.defaultPrevented).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("renders nothing without a position", () => {
    const { container } = render(
      <TagMenu
        position={null}
        filter=""
        noteData={noteData}
        onSelect={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });
});
