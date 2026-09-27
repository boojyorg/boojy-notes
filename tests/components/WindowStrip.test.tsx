/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F" },
      BG: { editor: "#FFFFFF", standard: "#F9F9F9", hover: "#ECECEC" },
    },
  }),
}));

let closed: ((label: string) => void) | null = null;
const api = {
  menuLabels: vi.fn(async () => ["File", "Edit", "View", "Window"]),
  popupMenu: vi.fn(),
  onMenuClosed: vi.fn((cb: (label: string) => void) => {
    closed = cb;
    return () => {
      closed = null;
    };
  }),
  setTitleBarOverlay: vi.fn(),
};
vi.mock("../../src/services/apiProvider", () => ({ getAPI: () => api }));

import WindowStrip from "../../src/components/WindowStrip";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function mount(sidebarVisible = true) {
  const view = render(<WindowStrip sidebarVisible={sidebarVisible} sidebarWidth={240} />);
  await act(async () => {});
  return view;
}

describe("WindowStrip", () => {
  it("names the application's menus, and gives the window buttons the note's ground", async () => {
    const { getAllByRole } = await mount();
    expect(getAllByRole("menuitem").map((b) => b.textContent)).toEqual([
      "File",
      "Edit",
      "View",
      "Window",
    ]);
    expect(api.setTitleBarOverlay).toHaveBeenCalledWith({
      color: "#FFFFFF",
      symbolColor: "#14110F",
    });
  });

  it("a click opens that menu under its name; the name stays lit until it closes", async () => {
    const { getByRole } = await mount();
    const edit = getByRole("menuitem", { name: "Edit" });
    fireEvent.click(edit);
    expect(api.popupMenu).toHaveBeenCalledWith("Edit", expect.any(Number), expect.any(Number));
    expect(edit.getAttribute("aria-expanded")).toBe("true");
    act(() => closed?.("Edit"));
    expect(edit.getAttribute("aria-expanded")).toBe("false");
  });

  it("Alt pressed and let go on its own opens the first menu; Alt with a key does not", async () => {
    await mount();
    fireEvent.keyDown(window, { key: "Alt" });
    fireEvent.keyDown(window, { key: "s" });
    fireEvent.keyUp(window, { key: "Alt" });
    expect(api.popupMenu).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Alt" });
    fireEvent.keyUp(window, { key: "Alt" });
    expect(api.popupMenu).toHaveBeenCalledWith("File", expect.any(Number), expect.any(Number));
  });

  it("the sidebar's grey runs under the names only while the sidebar shows", async () => {
    const shown = await mount(true);
    const grey = () =>
      shown.getByTestId("window-strip").querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(grey().style.width).toBe("240px");
    shown.rerender(<WindowStrip sidebarVisible={false} sidebarWidth={240} />);
    expect(grey().style.width).toBe("0px");
  });
});
