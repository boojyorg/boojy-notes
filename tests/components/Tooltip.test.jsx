/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#fff", secondary: "#aaa", muted: "#666" },
      BG: { surface: "#333", divider: "#444", hover: "#555", elevated: "#2a2a2e" },
      ACCENT: { primary: "#A4CACE", text: "#A4CACE", onAccent: "#FFFFFF" },
    },
    isDark: true,
  }),
}));
vi.mock("../../src/context/LayoutContext", () => ({
  useLayout: () => ({ sidebarVisible: true, sidebarWidth: 260, toggleSidebar: vi.fn() }),
}));
vi.mock("../../src/context/NoteDataContext", () => ({
  useNoteDataActions: () => ({ canUndo: false, canRedo: false, undo: vi.fn(), redo: vi.fn() }),
}));
// jsdom reports no platform; the labels are tested on a Mac here and both ways below.
vi.mock("../../src/utils/platform", () => ({ isMac: true, isElectronMac: false }));

import { ChromeButton } from "../../src/components/EditorChrome.jsx";
import { TOOLTIP_REST_MS, TOOLTIP_WARM_MS, shortcutLabel } from "../../src/components/Tooltip";

const chip = (q) => q.queryByTestId("chrome-tooltip");

afterEach(() => {
  cleanup();
  // The warm window is module state: let it lapse so the next test starts cold.
  if (vi.isFakeTimers()) {
    act(() => vi.advanceTimersByTime(TOOLTIP_WARM_MS + 1));
    vi.useRealTimers();
  }
});

const renderPair = (props = {}) => {
  vi.useFakeTimers();
  return render(
    <div>
      <ChromeButton label="Undo" shortcut="⌘Z" {...props}>
        u
      </ChromeButton>
      <ChromeButton label="Redo" shortcut="⇧⌘Z">
        r
      </ChromeButton>
    </div>,
  );
};

describe("ChromeButton's chip", () => {
  // The browser's `title` tooltip arrives a second late, unstyled and without
  // the shortcut; a control that shows the chip carries none, or both show.
  it("names the control for assistive tech without a native title", () => {
    const q = renderPair();
    const undo = q.getByLabelText("Undo");
    expect(undo.hasAttribute("title")).toBe(false);
    expect(chip(q)).toBeNull();
  });

  it("shows the name and shortcut after the pointer rests, and hides on leave", () => {
    const q = renderPair();
    const undo = q.getByLabelText("Undo");
    fireEvent.mouseEnter(undo);
    act(() => vi.advanceTimersByTime(TOOLTIP_REST_MS - 1));
    expect(chip(q)).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(chip(q).textContent).toBe("Undo⌘Z");
    expect(chip(q).dataset.placement).toBe("below");
    fireEvent.mouseLeave(undo);
    expect(chip(q)).toBeNull();
  });

  // The rest is paid once per pass over a group: a neighbour hovered right
  // after a chip has hidden shows its own at once.
  it("shows a neighbour's chip at once while the group is warm", () => {
    const q = renderPair();
    const undo = q.getByLabelText("Undo");
    fireEvent.mouseEnter(undo);
    act(() => vi.advanceTimersByTime(TOOLTIP_REST_MS));
    fireEvent.mouseLeave(undo);
    act(() => vi.advanceTimersByTime(TOOLTIP_WARM_MS - 1));
    fireEvent.mouseEnter(q.getByLabelText("Redo"));
    expect(chip(q).textContent).toBe("Redo⇧⌘Z");
    fireEvent.mouseLeave(q.getByLabelText("Redo"));
    // Past the window the rest is owed again.
    act(() => vi.advanceTimersByTime(TOOLTIP_WARM_MS + 1));
    fireEvent.mouseEnter(undo);
    expect(chip(q)).toBeNull();
  });

  // A press hides the chip and it stays hidden until the pointer leaves and
  // returns, so a toggle never flashes its old name after it has acted; the
  // focus a press gives is not keyboard focus and shows nothing either.
  it("hides on a press and does not come back for the focus the press gives", () => {
    const q = renderPair();
    const undo = q.getByLabelText("Undo");
    fireEvent.mouseEnter(undo);
    act(() => vi.advanceTimersByTime(TOOLTIP_REST_MS));
    expect(chip(q)).not.toBeNull();
    fireEvent.mouseDown(undo);
    expect(chip(q)).toBeNull();
    fireEvent.focus(undo);
    expect(chip(q)).toBeNull();
    fireEvent.mouseUp(undo);
    act(() => vi.advanceTimersByTime(TOOLTIP_REST_MS * 2));
    expect(chip(q)).toBeNull();
  });

  // A keyboard user is on the control on purpose: no rest, and Enter, Space
  // or Escape put the chip away without leaving the control.
  it("shows at once on keyboard focus and hides on blur or an activating key", () => {
    const q = renderPair();
    const undo = q.getByLabelText("Undo");
    fireEvent.focus(undo);
    expect(chip(q).textContent).toBe("Undo⌘Z");
    fireEvent.keyDown(undo, { key: "Enter" });
    expect(chip(q)).toBeNull();
    fireEvent.blur(undo);
    fireEvent.focus(undo);
    expect(chip(q)).not.toBeNull();
    fireEvent.keyDown(undo, { key: "Escape" });
    expect(chip(q)).toBeNull();
    fireEvent.focus(undo);
    fireEvent.blur(undo);
    expect(chip(q)).toBeNull();
  });

  // Disabled is `aria-disabled` so the control still takes the pointer and
  // focus and still names itself, shortcut included; only the click is dropped.
  it("still names a disabled control, and drops its click", () => {
    const onClick = vi.fn();
    const q = renderPair({ disabled: true, onClick });
    const undo = q.getByLabelText("Undo");
    expect(undo.getAttribute("aria-disabled")).toBe("true");
    expect(undo.hasAttribute("disabled")).toBe(false);
    fireEvent.click(undo);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.mouseEnter(undo);
    act(() => vi.advanceTimersByTime(TOOLTIP_REST_MS));
    expect(chip(q).textContent).toBe("Undo⌘Z");
    fireEvent.mouseLeave(undo);
    fireEvent.focus(undo);
    expect(chip(q).textContent).toBe("Undo⌘Z");
  });

  // The chip is portalled to body and fixed, so the sidebar's overflow never
  // clips it and it sits over the note; the shortcut is its own pill.
  it("draws the chip at the top of the page with the shortcut on a pill", () => {
    const q = renderPair();
    const undo = q.getByLabelText("Undo");
    fireEvent.focus(undo);
    const c = chip(q);
    expect(c.parentElement).toBe(document.body);
    expect(c.style.position).toBe("fixed");
    expect(c.style.borderRadius).toBe("8px");
    expect(c.style.fontSize).toBe("13px");
    const pill = c.lastElementChild;
    expect(pill.textContent).toBe("⌘Z");
    expect(pill.style.fontSize).toBe("11px");
    expect(pill.style.background).not.toBe("");
  });
});

describe("shortcutLabel", () => {
  it("writes the shell's shortcuts in each platform's own form", () => {
    expect(shortcutLabel({ key: "Z" }, true)).toBe("⌘Z");
    expect(shortcutLabel({ key: "Z" }, false)).toBe("Ctrl+Z");
    // Redo: ⇧⌘Z on a Mac, Ctrl+Y elsewhere; the handler takes both.
    const redo = { key: "Z", shift: true, win: { key: "Y" } };
    expect(shortcutLabel(redo, true)).toBe("⇧⌘Z");
    expect(shortcutLabel(redo, false)).toBe("Ctrl+Y");
  });
});
