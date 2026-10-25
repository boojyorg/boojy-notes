/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      BG: { surface: "#F4F4F5", divider: "#E9E9E9", hover: "#ECECEC" },
      ACCENT: { primary: "#2A737D" },
    },
    isDark: false,
  }),
}));
vi.mock("../../src/context/LayoutContext", () => ({
  useSourceView: () => [false, () => {}],
  useLayout: () => ({ sidebarVisible: false, sidebarWidth: 260, fullScreen: false }),
}));
vi.mock("../../src/utils/platform", () => ({
  isPhone: true,
  addsFiles: false,
  isElectronMac: false,
  isMac: false,
  hasWindowStrip: false,
}));

import EditorChrome, { CHROME_TOP } from "../../src/components/EditorChrome.jsx";
import { STATUS_BAR_H } from "../../src/utils/uiScale";

afterEach(cleanup);

/**
 * On a current WebView the phone's app draws under Android's status bar, so
 * the ‹ and the ··· sat on the clock. Both stand below the bar's room.
 */
describe("EditorChrome on the phone", () => {
  it("stands the ‹ and the ··· below the status bar", () => {
    const { getByLabelText } = render(
      <EditorChrome activeNote="n1" onNoteActions={vi.fn()} onNewNote={vi.fn()} />,
    );
    const below = `calc(${CHROME_TOP}px + ${STATUS_BAR_H})`;
    const back = getByLabelText("Back to notes").closest('[style*="position: fixed"]');
    const more = getByLabelText("Note actions").closest('[style*="position: fixed"]');
    expect(back.getAttribute("style")).toContain(`top: ${below}`);
    expect(more.getAttribute("style")).toContain(`top: ${below}`);
  });

  it("measures the bar in the app's own pixels, less the air under its icons", () => {
    expect(STATUS_BAR_H).toBe(
      "max(0px, calc((env(safe-area-inset-top, 0px)) / var(--ui-scale, 1)) - 6px)",
    );
  });
});
