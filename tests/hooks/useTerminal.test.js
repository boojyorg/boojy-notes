/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../src/utils/platform", () => ({
  isElectron: false,
  isCapacitor: false,
  isNative: false,
  platform: "web",
}));

import { useTerminal } from "../../src/hooks/useTerminal";

describe("useTerminal", () => {
  it("starts with empty terminals and null activeTerminalId", () => {
    const { result } = renderHook(() => useTerminal());

    expect(result.current.terminals).toEqual([]);
    expect(result.current.activeTerminalId).toBe(null);
  });

  it("createTerminal adds a terminal and sets it active", () => {
    const { result } = renderHook(() => useTerminal());

    let entry;
    act(() => {
      entry = result.current.createTerminal();
    });

    expect(result.current.terminals).toHaveLength(1);
    expect(result.current.terminals[0].type).toBe("terminal");
    expect(result.current.terminals[0].title).toBe("zsh");
    expect(result.current.activeTerminalId).toBe(entry.id);
  });

  it("closeTerminal removes the terminal and updates activeTerminalId", () => {
    const { result } = renderHook(() => useTerminal());

    let entry1, entry2;
    act(() => {
      entry1 = result.current.createTerminal();
    });
    act(() => {
      entry2 = result.current.createTerminal();
    });

    expect(result.current.terminals).toHaveLength(2);

    act(() => {
      result.current.closeTerminal(entry2.id);
    });

    expect(result.current.terminals).toHaveLength(1);
    expect(result.current.terminals[0].id).toBe(entry1.id);
    // Active should fall back to remaining terminal
    expect(result.current.activeTerminalId).toBe(entry1.id);
  });

  it("renameTerminal updates the title of the specified terminal", () => {
    const { result } = renderHook(() => useTerminal());

    let entry;
    act(() => {
      entry = result.current.createTerminal();
    });

    act(() => {
      result.current.renameTerminal(entry.id, "my-shell");
    });

    expect(result.current.terminals[0].title).toBe("my-shell");
  });

  it("createAITab adds an AI type tab", () => {
    const { result } = renderHook(() => useTerminal());

    let entry;
    act(() => {
      entry = result.current.createAITab();
    });

    expect(result.current.terminals).toHaveLength(1);
    expect(result.current.terminals[0].type).toBe("ai");
    expect(result.current.terminals[0].title).toBe("AI Chat");
    expect(result.current.activeTerminalId).toBe(entry.id);
  });

  it("closeTerminal sets activeTerminalId to null when last terminal is closed", () => {
    const { result } = renderHook(() => useTerminal());

    let entry;
    act(() => {
      entry = result.current.createTerminal();
    });

    act(() => {
      result.current.closeTerminal(entry.id);
    });

    expect(result.current.terminals).toHaveLength(0);
    expect(result.current.activeTerminalId).toBe(null);
  });
});
