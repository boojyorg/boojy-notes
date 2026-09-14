/** @vitest-environment jsdom */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("../../src/utils/platform", () => ({ isElectronMac: false, isMac: true }));

import NotePath from "../../src/components/NotePath.jsx";
import { CHROME_PATH_RIGHT_INSET, chromePathInset } from "../../src/components/EditorChrome.jsx";

/**
 * jsdom lays nothing out, so the band's width and every crumb's width are
 * played by a stub: a crumb is 8px a character, the separator 16px with its
 * margins, the ellipsis 11px, and the band whatever the test says it is.
 */
const geometry = { band: 1000 };
const observers = [];

beforeEach(() => {
  geometry.band = 1000;
  Element.prototype.getBoundingClientRect = function rect() {
    const row = this.parentElement?.getAttribute?.("data-testid") === "note-path-row";
    const text = this.textContent ?? "";
    let width = 0;
    if (row) width = geometry.band;
    else if (text === "/") width = 16;
    else if (text === "…") width = 11;
    else width = text.length * 8;
    return { width, height: 20, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 20 };
  };
  globalThis.ResizeObserver = class {
    constructor(cb) {
      this.cb = cb;
      observers.push(this);
    }
    observe() {}
    disconnect() {
      observers.splice(observers.indexOf(this), 1);
    }
  };
});
afterEach(() => {
  cleanup();
  observers.length = 0;
});

const resize = (band) => {
  geometry.band = band;
  act(() => {
    for (const o of observers) o.cb();
  });
};

const folders = (c) =>
  Array.from(c.querySelectorAll("[data-testid='note-path-folder']"), (el) => el.textContent);
const ellipsis = (c) => c.querySelectorAll("[data-testid='note-path-ellipsis']").length;

function mount(parents, name = "Todd's Note", props = {}) {
  return render(
    <NotePath
      parents={parents}
      name={name}
      collapsed={false}
      fullScreen={false}
      bg="#FFFFFF"
      {...props}
    >
      <div role="textbox" aria-label="Note title">
        {name}
      </div>
    </NotePath>,
  );
}

describe("NotePath", () => {
  it("shows a root note's name alone, with no ellipsis and no `Notes /`", () => {
    const { container, getByRole } = mount([]);
    expect(folders(container)).toEqual([]);
    expect(ellipsis(container)).toBe(0);
    expect(container.textContent).not.toContain("Notes");
    expect(getByRole("textbox", { name: "Note title" })).toBeTruthy();
  });

  it("shows every folder before the name when the band has room", () => {
    const { container } = mount(["University", "Archive"]);
    expect(folders(container)).toEqual(["University", "Archive"]);
    expect(ellipsis(container)).toBe(0);
    // Folders one step quieter than the name, slashes muted, nothing bold.
    const crumb = container.querySelector("[data-testid='note-path-folder']");
    expect(crumb.style.color).toBe("rgb(71, 64, 58)");
    const path = container.querySelector("[data-testid='note-path']");
    expect(path.style.fontWeight).toBe("400");
    expect(path.style.fontSize).toBe("14px");
  });

  it("drops the outer folders first as the band narrows, and the name last", () => {
    const { container } = mount(["University", "Archive"]);
    // Full: 80 + 16 + 56 + 16 + 88 = 256. `… / Archive / name`: 11+16+56+16+88 = 187.
    resize(255);
    expect(folders(container)).toEqual(["Archive"]);
    expect(ellipsis(container)).toBe(1);
    // `… / name`: 115.
    resize(186);
    expect(folders(container)).toEqual([]);
    expect(ellipsis(container)).toBe(1);
    // The bare name: 88.
    resize(114);
    expect(folders(container)).toEqual([]);
    expect(ellipsis(container)).toBe(0);
    // Narrower still, the name itself gives way and stretches to the band.
    resize(60);
    expect(container.querySelector("[data-testid='note-path']").style.flex).toBe("1 1 0px");
    // Widening gives everything back in the same order.
    resize(1000);
    expect(folders(container)).toEqual(["University", "Archive"]);
    expect(ellipsis(container)).toBe(0);
  });

  it("keeps the band clear of the controls in both sidebar states", () => {
    const expanded = mount(["A"]);
    const row = expanded.container.querySelector("[data-testid='note-path-row']");
    expect(row.style.paddingLeft).toBe(`${chromePathInset(false, false)}px`);
    expect(row.style.paddingRight).toBe(`${CHROME_PATH_RIGHT_INSET}px`);
    cleanup();
    const collapsed = mount(["A"], "n", { collapsed: true });
    const row2 = collapsed.container.querySelector("[data-testid='note-path-row']");
    expect(row2.style.paddingLeft).toBe(`${chromePathInset(true, false)}px`);
  });

  it("biases the spacers so the path centres on the pane, not the band", () => {
    const { container } = mount(["A"]);
    const band = container.querySelector("[data-testid='note-path-row']").firstElementChild;
    const [left, , right] = band.children;
    const bias = chromePathInset(false, false) - CHROME_PATH_RIGHT_INSET;
    expect(bias).toBeGreaterThan(0);
    expect(left.style.flexBasis).toBe("0px");
    expect(right.style.flexBasis).toBe(`${bias}px`);
    // The bias gives way before the path does.
    expect(Number(right.style.flexShrink)).toBeGreaterThan(1);
    expect(left.style.flexGrow).toBe("1");
    expect(right.style.flexGrow).toBe("1");
  });

  it("gives an empty name its placeholder's width so `Untitled` centres too", () => {
    const { container } = mount(["A"], "");
    const path = container.querySelector("[data-testid='note-path']");
    const wrapper = path.lastElementChild;
    expect(wrapper.style.minWidth).toBe(`${"Untitled".length * 8}px`);
  });
});
