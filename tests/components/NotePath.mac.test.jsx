/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      BG: { surface: "#F4F4F5", divider: "#E9E9E9", hover: "#ECECEC", editor: "#FFFFFF" },
      ACCENT: { primary: "#8FC1C6", text: "#2A737D", onAccent: "#FFFFFF" },
    },
    isDark: false,
  }),
}));
vi.mock("../../src/utils/platform", () => ({ isElectronMac: true, isMac: true }));
vi.mock("../../src/components/PathTreeMenu", () => ({ default: () => null }));

import NotePath from "../../src/components/NotePath.jsx";
import { SCROLLBAR_W } from "../../src/constants/layout";
import { CHROME_PATH_RIGHT_INSET, chromePathInset } from "../../src/components/EditorChrome.jsx";

afterEach(cleanup);

/**
 * On macOS the row is the window's drag handle, but only a strip between the
 * two control groups may be draggable: Chromium applies app-region rects in
 * DOM order and the chrome buttons come first, so a full-row drag rect put a
 * window-move view over every one of them (2026-09-16).
 */
describe("NotePath on macOS", () => {
  it.each([
    ["expanded", false],
    ["collapsed", true],
  ])("the drag strip lies between the paddings, before the path, %s", (_label, collapsed) => {
    const { container } = render(
      <NotePath
        parents={["University"]}
        name="Todd"
        collapsed={collapsed}
        fullScreen={false}
        bg="#FFF"
      >
        <div role="textbox" aria-label="Note title">
          Todd
        </div>
      </NotePath>,
    );
    const row = container.querySelector("[data-testid='note-path-row']");
    const strip = container.querySelector("[data-testid='note-path-drag']");
    const path = container.querySelector("[data-testid='note-path']");
    // jsdom knows no app-region; React's assignment leaves it as a plain property.
    expect(row.style.WebkitAppRegion).toBeUndefined();
    expect(strip.style.WebkitAppRegion).toBe("drag");
    // Marked, so the popup-open rule can stand it down.
    expect(strip.hasAttribute("data-drag-region")).toBe(true);
    expect(strip.style.left).toBe(`${chromePathInset(collapsed, false)}px`);
    expect(strip.style.right).toBe(`${CHROME_PATH_RIGHT_INSET - SCROLLBAR_W}px`);
    expect(strip.style.top).toBe("0px");
    expect(strip.style.bottom).toBe("0px");
    // The path opts out and must come after the strip in the DOM.
    expect(path.style.WebkitAppRegion).toBe("no-drag");
    expect(strip.compareDocumentPosition(path) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Nothing else in the row is draggable.
    const drags = [...container.querySelectorAll("*")].filter(
      (el) => el.style?.WebkitAppRegion === "drag",
    );
    expect(drags).toEqual([strip]);
  });
});
