/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { endIndex, stepIndex, typeAheadIndex } from "../../src/utils/menuKeys";
import { useMenuKeys, type MenuRow } from "../../src/hooks/useMenuKeys";

afterEach(cleanup);

describe("stepIndex", () => {
  it("moves and wraps at both ends", () => {
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, -1, 3)).toBe(2);
  });

  it("from no row, down is the first and up the last", () => {
    expect(stepIndex(-1, 1, 3)).toBe(0);
    expect(stepIndex(-1, -1, 3)).toBe(2);
  });

  it("skips disabled rows, and answers -1 when none can act", () => {
    const disabled = [false, true, false];
    expect(stepIndex(0, 1, 3, disabled)).toBe(2);
    expect(stepIndex(2, -1, 3, disabled)).toBe(0);
    expect(stepIndex(0, 1, 2, [true, true])).toBe(-1);
    expect(stepIndex(-1, 1, 0)).toBe(-1);
  });

  it("finds the first and last rows that can act", () => {
    expect(endIndex("first", 3, [true, false, false])).toBe(1);
    expect(endIndex("last", 3, [false, false, true])).toBe(1);
  });
});

describe("typeAheadIndex", () => {
  const names = ["Plain", "Bash", "CSS", "HTML", "JavaScript", "JSON", "Python", "SQL"];
  it("finds a word, walks a repeated letter, wraps", () => {
    expect(typeAheadIndex(names, "j", -1)).toBe(4);
    expect(typeAheadIndex(names, "jj", 4)).toBe(5);
    expect(typeAheadIndex(names, "js", -1)).toBe(5);
    expect(typeAheadIndex(names, "b", 5)).toBe(1);
    expect(typeAheadIndex(names, "z", -1)).toBe(-1);
  });
});

function setUp(rows: MenuRow[], suggestion = false) {
  const choose = vi.fn();
  const close = vi.fn();
  const hook = renderHook(() => {
    const [active, setActive] = useState(-1);
    const keys = useMenuKeys({ rows: () => rows, active, setActive, choose, close, suggestion });
    return { active, keys };
  });
  const press = (key: string, init: Partial<KeyboardEvent> = {}) => {
    let took = false;
    act(() => {
      took = hook.result.current.keys({
        key,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        defaultPrevented: false,
        ...init,
      });
    });
    return took;
  };
  return { hook, press, choose, close };
}

const ROWS = [{ label: "Rename" }, { label: "Duplicate", disabled: true }, { label: "Delete" }];

describe("useMenuKeys", () => {
  it("arrows wrap past disabled rows; Enter and Space choose; Escape closes", () => {
    const { hook, press, choose, close } = setUp(ROWS);
    expect(press("ArrowDown")).toBe(true);
    expect(hook.result.current.active).toBe(0);
    press("ArrowDown");
    expect(hook.result.current.active).toBe(2);
    press("ArrowDown");
    expect(hook.result.current.active).toBe(0);
    press("Enter");
    expect(choose).toHaveBeenLastCalledWith(0);
    press("End");
    press(" ");
    expect(choose).toHaveBeenLastCalledWith(2);
    press("Escape");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("a letter jumps to the next row that starts with it", () => {
    const first = setUp(ROWS);
    first.press("r");
    expect(first.hook.result.current.active).toBe(0);
    // Duplicate is disabled, so its letter lands nowhere new.
    const second = setUp(ROWS);
    second.press("d");
    expect(second.hook.result.current.active).toBe(-1);
  });

  it("takes nothing already prevented or with a modifier (Escape aside)", () => {
    const { press, close } = setUp(ROWS);
    expect(press("ArrowDown", { defaultPrevented: true })).toBe(false);
    expect(press("ArrowDown", { metaKey: true })).toBe(false);
    expect(press("Escape", { metaKey: true })).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("a suggestion menu leaves Space, letters, Home and End to typing", () => {
    const { press, choose } = setUp(ROWS, true);
    expect(press(" ")).toBe(false);
    expect(press("r")).toBe(false);
    expect(press("Home")).toBe(false);
    press("ArrowDown");
    expect(press("Enter")).toBe(true);
    expect(choose).toHaveBeenCalledWith(0);
  });
});
