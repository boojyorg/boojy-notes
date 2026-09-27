import { beforeEach, describe, expect, it, vi } from "vitest";

// The menu as Electron would hold it: built from the template, read back by
// the window strip's two calls.
const state = vi.hoisted(() => ({
  menu: null as null | {
    items: { label: string; submenu?: { popup: ReturnType<typeof vi.fn> } }[];
  },
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  listeners: new Map<string, (...args: unknown[]) => void>(),
  window: { webContents: { send: vi.fn() } },
}));

vi.mock("electron", () => {
  const popup = vi.fn();
  return {
    Menu: {
      buildFromTemplate: (template: { label?: string }[]) => ({
        items: template.map((t) => ({ label: t.label ?? "", submenu: { popup } })),
      }),
      setApplicationMenu: (m: typeof state.menu) => {
        state.menu = m;
      },
      getApplicationMenu: () => state.menu,
    },
    ipcMain: {
      handle: (ch: string, fn: (...args: unknown[]) => unknown) => state.handlers.set(ch, fn),
      on: (ch: string, fn: (...args: unknown[]) => void) => state.listeners.set(ch, fn),
    },
    BrowserWindow: { fromWebContents: () => state.window },
    nativeImage: { createFromNamedImage: () => ({ isEmpty: () => true }), createEmpty: () => ({}) },
    shell: { openExternal: vi.fn() },
  };
});

import { buildAppMenu } from "../../electron/appMenu";

beforeEach(() => {
  state.handlers.clear();
  state.listeners.clear();
  buildAppMenu({ isDev: false, getMainWindow: () => null });
});

describe("the window strip's menu calls", () => {
  it("menu-labels answers the application menu's top-level names", async () => {
    const labels = (await state.handlers.get("menu-labels")?.()) as string[];
    // Window and Help are the Mac's; elsewhere the window's buttons and File cover them.
    expect(labels).toEqual(
      process.platform === "darwin"
        ? ["Boojy Notes", "File", "Edit", "Format", "View", "Window", "Help"]
        : ["File", "Edit", "Format", "View"],
    );
  });

  it("popup-menu opens that menu at the point, and says when it closes", () => {
    const sender = { isDestroyed: () => false, send: vi.fn() };
    state.listeners.get("popup-menu")?.({ sender }, { label: "Edit", x: 10.4, y: 31.6 });
    const edit = state.menu?.items.find((i) => i.label === "Edit");
    const call = edit?.submenu?.popup.mock.calls.at(-1)?.[0] as {
      x: number;
      y: number;
      callback: () => void;
    };
    expect(call).toMatchObject({ x: 10, y: 32 });
    call.callback();
    expect(sender.send).toHaveBeenCalledWith("menu-closed", "Edit");
  });

  it("popup-menu does nothing for a name the menu does not have", () => {
    const sender = { isDestroyed: () => false, send: vi.fn() };
    const before = state.menu?.items[0]?.submenu?.popup.mock.calls.length ?? 0;
    state.listeners.get("popup-menu")?.({ sender }, { label: "Nope", x: 0, y: 0 });
    expect(state.menu?.items[0]?.submenu?.popup.mock.calls.length ?? 0).toBe(before);
  });
});
