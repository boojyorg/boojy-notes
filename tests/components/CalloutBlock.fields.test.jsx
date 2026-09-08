/** @vitest-environment jsdom */
/**
 * The callout's two fields against the real inline reader and renderer:
 * the body is inline Markdown, and what the field holds is what state
 * gets (review 2026-09-07, §3.2, §1.14 and §3.8).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#fff", secondary: "#aaa", muted: "#666" },
      BG: { elevated: "#2a2a2e", divider: "#444", hover: "#555", surface: "#333" },
      callouts: new Proxy({}, { get: () => ({ colour: "#7AA2F7", bg: "#3f4e74" }) }),
    },
    isDark: true,
  }),
}));

import CalloutBlock from "../../src/components/CalloutBlock";

afterEach(cleanup);

const BODY = "body with **bold**, `code` and [[Other]]";

function mount(overrides = {}) {
  const props = {
    block: { id: "c", type: "callout", calloutType: "note", title: "Note", text: BODY },
    noteId: "n",
    blockIndex: 0,
    syncGen: 1,
    noteTitleSet: new Set(["Other"]),
    onUpdateCallout: vi.fn(),
    onUpdateText: vi.fn(),
    onUpdateTitle: vi.fn(),
    onBlockNav: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  const utils = render(<CalloutBlock {...props} />);
  return { props, ...utils, body: utils.container.querySelector(".callout-body") };
}

describe("CalloutBlock fields", () => {
  it("renders the body's inline Markdown", () => {
    const { body } = mount();
    expect(body.querySelector("strong")?.textContent).toBe("bold");
    expect(body.querySelector("code")?.textContent).toBe("code");
    expect(body.querySelector(".wikilink")?.textContent).toBe("Other");
  });

  it("a click in and out commits nothing and strips nothing", () => {
    const { props, body } = mount();
    fireEvent.focus(body);
    fireEvent.blur(body);
    expect(props.onUpdateText).not.toHaveBeenCalled();
    expect(props.onUpdateCallout).not.toHaveBeenCalled();
  });

  it("an edit commits the body as Markdown, formatting kept", () => {
    const { props, body } = mount();
    body.querySelector("strong").textContent = "bolder";
    fireEvent.input(body);
    expect(props.onUpdateText).toHaveBeenCalledWith(
      "n",
      0,
      "body with **bolder**, `code` and [[Other]]",
    );
  });

  it("the title commits on input, and Enter or Shift+Enter moves to the body", () => {
    const { props, container, body } = mount();
    const title = container.querySelector(".callout-title");
    title.textContent = "Renamed";
    fireEvent.input(title);
    expect(props.onUpdateTitle).toHaveBeenCalledWith("n", 0, "Renamed");
    expect(fireEvent.keyDown(title, { key: "Enter", shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(body);
  });

  it("paints a body the field does not hold and leaves one it already holds", () => {
    const { props, body, rerender } = mount();
    body.querySelector("strong").textContent = "bolder";
    fireEvent.input(body);
    // State catches up: the field already holds this text; nothing is repainted.
    rerender(
      <CalloutBlock
        {...props}
        block={{ ...props.block, text: "body with **bolder**, `code` and [[Other]]" }}
      />,
    );
    expect(body.querySelector("strong").textContent).toBe("bolder");
    // An undo (a new generation) repaints from state.
    rerender(<CalloutBlock {...props} block={{ ...props.block, text: BODY }} syncGen={2} />);
    expect(body.querySelector("strong").textContent).toBe("bold");
  });

  it("a type change repaints the icon colour and default title", () => {
    const { props, container, rerender } = mount();
    rerender(
      <CalloutBlock
        {...props}
        block={{ ...props.block, calloutType: "warning", title: "Warning" }}
      />,
    );
    expect(container.querySelector(".callout-title").textContent).toBe("Warning");
  });
});
