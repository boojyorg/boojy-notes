/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";

// ── Theme mock ──────────────────────────────────────────────────────────────
vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#fff", secondary: "#aaa", muted: "#666" },
      BG: {
        dark: "#1a1a1e",
        editor: "#1a1a1e",
        elevated: "#2a2a2e",
        surface: "#333",
        divider: "#444",
        hover: "#555",
        darkest: "#111",
      },
      ACCENT: { primary: "#A4CACE" },
      SEMANTIC: { error: "#ef4444" },
      mark: { bg: "rgba(164, 202, 206, 0.35)" },
      modalShadow: "0 24px 48px rgba(0,0,0,0.4)",
      overlay: (a) => `rgba(255,255,255,${a})`,
    },
    isDark: true,
    themeMode: "night",
    setThemeMode: vi.fn(),
  }),
}));

// jsdom reports no platform; the labels are tested on a Mac here and both ways below.
vi.mock("../../src/utils/platform", () => ({ isMac: true }));

// ── Import component after mocks ────────────────────────────────────────────
import FloatingToolbar, {
  FORMATS,
  TOOLTIP_REST_MS,
  chipWouldClip,
  shortcutLabel,
} from "../../src/components/FloatingToolbar.jsx";

// ── Helpers ─────────────────────────────────────────────────────────────────
const defaultFormats = {
  bold: false,
  italic: false,
  strikethrough: false,
  highlight: false,
  code: false,
  link: false,
};

const shown = (props = {}) =>
  render(
    <FloatingToolbar
      position={{ top: 50, left: 100 }}
      activeFormats={defaultFormats}
      onFormat={vi.fn()}
      {...props}
    />,
  );

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FloatingToolbar", () => {
  it("renders nothing when position is null", () => {
    const { container } = shown({ position: null });
    expect(container.innerHTML).toBe("");
  });

  it("renders the toolbar when position is provided", () => {
    const { container } = shown();
    expect(container.firstChild).not.toBeNull();
    expect(container.firstChild.style.position).toBe("absolute");
  });

  // Lucide glyphs, not styled text: every button carries an svg and is named
  // by its aria-label alone.
  it("renders the six formats as named buttons with Lucide glyphs", () => {
    const { getAllByRole, getByRole } = shown();
    expect(getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Bold",
      "Italic",
      "Strikethrough",
      "Highlight",
      "Inline code",
      "Link",
    ]);
    for (const { label, id } of FORMATS) {
      const btn = getByRole("button", { name: label });
      const svg = btn.querySelector("svg.lucide");
      expect(svg, id).not.toBeNull();
      // The toolbar's own stroke tier, heavier than the navigation chrome.
      expect(svg.getAttribute("stroke-width")).toBe("2.5");
      expect(btn.textContent).toBe("");
    }
  });

  it("calls onFormat with the format when a button is pressed", () => {
    const onFormat = vi.fn();
    const { getByRole } = shown({ onFormat });
    // The toolbar acts on mouseDown, so the selection being formatted is not lost.
    fireEvent.mouseDown(getByRole("button", { name: "Bold" }));
    expect(onFormat).toHaveBeenCalledWith("bold");
    fireEvent.mouseDown(getByRole("button", { name: "Inline code" }));
    expect(onFormat).toHaveBeenCalledWith("code");
  });

  it("applies active styling when a format is active", () => {
    const { getByRole } = shown({
      activeFormats: { ...defaultFormats, bold: true, highlight: true },
    });
    // Active is the glyph in the accent and no fill; the fill is hover's alone.
    for (const name of ["Bold", "Highlight"]) {
      const btn = getByRole("button", { name });
      expect(btn.style.color).toBe("rgb(164, 202, 206)");
      expect(btn.style.background).toBe("transparent");
      expect(btn.getAttribute("aria-pressed")).toBe("true");
    }
    const italic = getByRole("button", { name: "Italic" });
    expect(italic.style.color).toBe("rgb(255, 255, 255)");
    fireEvent.mouseEnter(italic);
    expect(italic.style.background).toBe("rgba(255, 255, 255, 0.08)");
  });

  it("shows a button's name and shortcut after the pointer rests on it", () => {
    vi.useFakeTimers();
    const { getByRole, queryByTestId, getByTestId } = shown();
    // jsdom lays nothing out; give the toolbar room above so the chip goes there.
    getByRole("toolbar").getBoundingClientRect = () => ({ top: 200 });
    const bold = getByRole("button", { name: "Strikethrough" });
    fireEvent.mouseEnter(bold);
    expect(queryByTestId("format-tooltip")).toBeNull();
    act(() => vi.advanceTimersByTime(TOOLTIP_REST_MS - 1));
    expect(queryByTestId("format-tooltip")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    const tip = getByTestId("format-tooltip");
    expect(tip.textContent).toBe("Strikethrough⇧⌘S");
    expect(tip.getAttribute("aria-hidden")).toBe("true");
    // Above the toolbar by default.
    expect(tip.style.bottom).toBe("calc(100% + 6px)");
    fireEvent.mouseLeave(bold);
    expect(queryByTestId("format-tooltip")).toBeNull();
  });

  it("moving between buttons before the rest shows only the last one's tip", () => {
    vi.useFakeTimers();
    const { getByRole, getByTestId } = shown();
    fireEvent.mouseEnter(getByRole("button", { name: "Bold" }));
    act(() => vi.advanceTimersByTime(TOOLTIP_REST_MS / 2));
    fireEvent.mouseLeave(getByRole("button", { name: "Bold" }));
    fireEvent.mouseEnter(getByRole("button", { name: "Italic" }));
    act(() => vi.advanceTimersByTime(TOOLTIP_REST_MS));
    expect(getByTestId("format-tooltip").textContent).toBe("Italic⌘I");
  });

  // The chip goes below only when it would clip at the top of the scroll
  // container; the toolbar's own position says nothing about that (the title
  // sits above a note's first line, so there is room there).
  it("puts the tip below only when there is no room above in the scroller", () => {
    vi.useFakeTimers();
    const scroller = document.createElement("div");
    scroller.className = "editor-scroll";
    scroller.getBoundingClientRect = () => ({ top: 100 });
    document.body.appendChild(scroller);
    const {
      getByRole,
      getByTestId,
      getByRole: q,
    } = render(
      <FloatingToolbar
        position={{ top: -40, left: 100 }}
        activeFormats={defaultFormats}
        onFormat={vi.fn()}
      />,
      { container: scroller },
    );
    const bar = q("toolbar");
    // Toolbar well below the scroller's top: room above, chip above.
    bar.getBoundingClientRect = () => ({ top: 160 });
    fireEvent.mouseEnter(getByRole("button", { name: "Link" }));
    act(() => vi.advanceTimersByTime(TOOLTIP_REST_MS));
    expect(getByTestId("format-tooltip").style.bottom).toBe("calc(100% + 6px)");
    fireEvent.mouseLeave(getByRole("button", { name: "Link" }));
    // Toolbar at the scroller's top: the chip would clip, so it goes below.
    bar.getBoundingClientRect = () => ({ top: 110 });
    fireEvent.mouseEnter(getByRole("button", { name: "Link" }));
    act(() => vi.advanceTimersByTime(TOOLTIP_REST_MS));
    const tip = getByTestId("format-tooltip");
    expect(tip.style.top).toBe("calc(100% + 6px)");
    expect(tip.style.bottom).toBe("");
    scroller.remove();
  });

  it("chipWouldClip measures against the scroll container, or the viewport without one", () => {
    const scroller = document.createElement("div");
    scroller.className = "editor-scroll";
    scroller.getBoundingClientRect = () => ({ top: 50 });
    const bar = document.createElement("div");
    scroller.appendChild(bar);
    bar.getBoundingClientRect = () => ({ top: 80 });
    expect(chipWouldClip(bar)).toBe(true);
    bar.getBoundingClientRect = () => ({ top: 90 });
    expect(chipWouldClip(bar)).toBe(false);
    const loose = document.createElement("div");
    loose.getBoundingClientRect = () => ({ top: 20 });
    expect(chipWouldClip(loose)).toBe(true);
    expect(chipWouldClip(null)).toBe(false);
  });

  it("drops a pending tip when the toolbar hides", () => {
    vi.useFakeTimers();
    const { getByRole, rerender, queryByTestId } = shown();
    fireEvent.mouseEnter(getByRole("button", { name: "Bold" }));
    rerender(<FloatingToolbar position={null} activeFormats={defaultFormats} onFormat={vi.fn()} />);
    act(() => vi.advanceTimersByTime(TOOLTIP_REST_MS));
    rerender(
      <FloatingToolbar
        position={{ top: 50, left: 100 }}
        activeFormats={defaultFormats}
        onFormat={vi.fn()}
      />,
    );
    expect(queryByTestId("format-tooltip")).toBeNull();
  });
});

describe("shortcutLabel", () => {
  it("uses each platform's own modifier order", () => {
    const strike = FORMATS.find((f) => f.id === "strikethrough");
    const bold = FORMATS.find((f) => f.id === "bold");
    expect(shortcutLabel(bold, true)).toBe("⌘B");
    expect(shortcutLabel(strike, true)).toBe("⇧⌘S");
    expect(shortcutLabel(bold, false)).toBe("Ctrl+B");
    expect(shortcutLabel(strike, false)).toBe("Ctrl+Shift+S");
  });

  // The strip's shortcuts are the keyboard handler's: Cmd+B/I/`/K, Cmd+Shift+S/H.
  it("lists the shortcuts the keyboard handler takes", () => {
    expect(FORMATS.map((f) => shortcutLabel(f, true))).toEqual([
      "⌘B",
      "⌘I",
      "⇧⌘S",
      "⇧⌘H",
      "⌘`",
      "⌘K",
    ]);
  });
});
