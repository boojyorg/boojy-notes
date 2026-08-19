/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const importMarkdown = vi.fn();
const importHtml = vi.fn();
const importFolder = vi.fn();
const unsubscribe = vi.fn();
let menuImportCallback: ((format: string) => void) | undefined;

vi.mock("../../src/services/apiProvider", () => ({
  getAPI: () => ({ importMarkdown }),
}));

import { useImport } from "../../src/hooks/useImport";

function installElectronAPI() {
  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: {
      importMarkdown,
      importHtml,
      importFolder,
      onMenuImport: vi.fn((callback: (format: string) => void) => {
        menuImportCallback = callback;
        return unsubscribe;
      }),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  menuImportCallback = undefined;
  installElectronAPI();
});

describe("useImport", () => {
  it("imports Markdown into the selected folder", () => {
    const { result } = renderHook(() => useImport({ isElectron: false }));

    act(() => result.current.handleImportIntoFolder("folder-x"));

    expect(importMarkdown).toHaveBeenCalledWith({ targetFolder: "folder-x" });
  });

  it("routes Electron File-menu imports and cleans up its listener", () => {
    const { unmount } = renderHook(() => useImport({ isElectron: true }));

    act(() => menuImportCallback?.("markdown"));
    act(() => menuImportCallback?.("html"));
    act(() => menuImportCallback?.("folder"));

    expect(importMarkdown).toHaveBeenCalledWith();
    expect(importHtml).toHaveBeenCalledWith();
    expect(importFolder).toHaveBeenCalledWith();

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
