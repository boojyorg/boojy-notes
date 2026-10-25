import { afterEach, describe, expect, it } from "vitest";
import type { Block } from "../../src/types/notes";
import { isTodoKey, selectedTodoTargets, todoFlip } from "../../src/utils/todoToggle";

const todo = (id: string, checked = false) =>
  ({ id, type: "checkbox", text: id, checked }) as Block;
const para = (id: string) => ({ id, type: "p", text: id }) as Block;

describe("todoFlip", () => {
  it("ticks an unticked to-do, and unticks a ticked one", () => {
    expect(todoFlip([todo("a")], ["a"])).toEqual({ ids: ["a"], checked: true });
    expect(todoFlip([todo("a", true)], ["a"])).toEqual({ ids: ["a"], checked: false });
  });

  it("takes a mixed run one way: ticked while any is unticked", () => {
    const blocks = [todo("a", true), todo("b"), todo("c", true)];
    expect(todoFlip(blocks, ["a", "b", "c"])).toEqual({ ids: ["a", "b", "c"], checked: true });
    const done = [todo("a", true), todo("b", true)];
    expect(todoFlip(done, ["a", "b"])).toEqual({ ids: ["a", "b"], checked: false });
  });

  it("leaves other blocks, and those outside the selection, alone", () => {
    const blocks = [todo("a"), para("p"), todo("b"), todo("c")];
    expect(todoFlip(blocks, ["a", "p", "b"])).toEqual({ ids: ["a", "b"], checked: true });
  });

  it("is null with no to-do, so the key stays Enter", () => {
    expect(todoFlip([para("p"), todo("a")], ["p"])).toBeNull();
    expect(todoFlip([todo("a")], [])).toBeNull();
  });
});

describe("isTodoKey", () => {
  const key = (over: Partial<Parameters<typeof isTodoKey>[0]>) => ({
    key: "Enter",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...over,
  });
  it("is Cmd+Enter, or Ctrl+Enter, and nothing more", () => {
    expect(isTodoKey(key({ metaKey: true }))).toBe(true);
    expect(isTodoKey(key({ ctrlKey: true }))).toBe(true);
    expect(isTodoKey(key({}))).toBe(false);
    expect(isTodoKey(key({ metaKey: true, shiftKey: true }))).toBe(false);
    expect(isTodoKey(key({ metaKey: true, altKey: true }))).toBe(false);
    expect(isTodoKey(key({ metaKey: true, key: "a" }))).toBe(false);
  });
});

describe("selectedTodoTargets", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });
  const blocks = [todo("a"), todo("b"), todo("c")];
  function select(start: [string, number], end: [string, number]) {
    document.body.innerHTML =
      '<div data-editor><div data-block-id="a">First</div><div data-block-id="b">Second</div><div data-block-id="c">Third</div></div>';
    const text = (id: string) =>
      document.querySelector(`[data-block-id="${id}"]`)?.firstChild as Node;
    const sel = window.getSelection() as Selection;
    const range = document.createRange();
    range.setStart(text(start[0]), start[1]);
    range.setEnd(text(end[0]), end[1]);
    sel.removeAllRanges();
    sel.addRange(range);
    return sel;
  }

  it("covers each block the selection holds something of", () => {
    expect(selectedTodoTargets(blocks, select(["a", 2], ["b", 1]))).toEqual(["a", "b"]);
    expect(selectedTodoTargets(blocks, select(["b", 3], ["b", 3]))).toEqual(["b"]);
  });

  it("leaves out an end block the selection stops before", () => {
    expect(selectedTodoTargets(blocks, select(["a", 0], ["b", 0]))).toEqual(["a"]);
    expect(selectedTodoTargets(blocks, select(["a", 0], ["c", 0]))).toEqual(["a", "b"]);
  });

  it("is empty outside the editor", () => {
    expect(selectedTodoTargets(blocks, null)).toEqual([]);
  });
});
