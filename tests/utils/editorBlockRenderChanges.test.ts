import { describe, expect, it } from "vitest";
import { haveEditorBlockRenderChanges } from "../../src/utils/editorBlockRenderChanges";

describe("haveEditorBlockRenderChanges", () => {
  it("re-renders immediately when a checkbox is checked or unchecked", () => {
    const unchecked = [{ id: "task", type: "checkbox" as const, text: "Task", checked: false }];
    const checked = [{ id: "task", type: "checkbox" as const, text: "Task", checked: true }];

    expect(haveEditorBlockRenderChanges(unchecked, checked)).toBe(true);
    expect(haveEditorBlockRenderChanges(checked, unchecked)).toBe(true);
  });

  it("continues to ignore plain text changes owned by contentEditable", () => {
    const previous = [{ id: "paragraph", type: "p" as const, text: "Before" }];
    const next = [{ id: "paragraph", type: "p" as const, text: "After" }];

    expect(haveEditorBlockRenderChanges(previous, next)).toBe(false);
  });
});
