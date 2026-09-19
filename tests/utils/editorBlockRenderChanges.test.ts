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

  // A code block's textarea is uncontrolled and paints its own highlight
  // overlay as it is typed into, like a paragraph's contentEditable; a
  // structural render per keystroke re-rendered every block (review
  // 2026-09-07, §1.4). The language still needs React: it changes the
  // grammar the overlay is highlighted with.
  it("ignores code text typed into the block's own field but repaints a language change", () => {
    const before = [{ id: "code", type: "code" as const, text: "a", lang: "js" }];
    const typed = [{ id: "code", type: "code" as const, text: "ab", lang: "js" }];
    const relangd = [{ id: "code", type: "code" as const, text: "a", lang: "ts" }];

    expect(haveEditorBlockRenderChanges(before, typed)).toBe(false);
    expect(haveEditorBlockRenderChanges(before, relangd)).toBe(true);
  });

  // Picking Warning on a Note callout changed state and nothing on screen
  // (review 2026-09-07, §3.8): the type, and the default title that follows
  // it, are painted by React, not by the field.
  it("repaints a callout whose type or title changed", () => {
    const note = [
      { id: "c", type: "callout" as const, text: "b", calloutType: "note", title: "Note" },
    ];
    const warning = [
      { id: "c", type: "callout" as const, text: "b", calloutType: "warning", title: "Warning" },
    ];
    const retitled = [
      { id: "c", type: "callout" as const, text: "b", calloutType: "note", title: "N" },
    ];

    expect(haveEditorBlockRenderChanges(note, warning)).toBe(true);
    expect(haveEditorBlockRenderChanges(note, retitled)).toBe(true);
  });

  // A media block has no field of its own: every pixel of it is React's. The
  // drag wrote the new width onto the DOM itself, so the first resize looked
  // right and the file was correct, but the block kept its old props — and the
  // second drag started from the size before the first one (2026-09-19).
  it("repaints an image whose width, src or alt changed", () => {
    const wide = [{ id: "i", type: "image" as const, src: "a.png", alt: "A", width: 100 }];
    const narrow = [{ id: "i", type: "image" as const, src: "a.png", alt: "A", width: 60 }];
    const replaced = [{ id: "i", type: "image" as const, src: "b.png", alt: "A", width: 100 }];
    const realt = [{ id: "i", type: "image" as const, src: "a.png", alt: "B", width: 100 }];

    expect(haveEditorBlockRenderChanges(wide, narrow)).toBe(true);
    expect(haveEditorBlockRenderChanges(wide, replaced)).toBe(true);
    expect(haveEditorBlockRenderChanges(wide, realt)).toBe(true);
    expect(haveEditorBlockRenderChanges(wide, [...wide])).toBe(false);
  });

  it("repaints a file block whose name, path or size changed, and an embed's target", () => {
    const file = [{ id: "f", type: "file" as const, src: "a.pdf", filename: "a.pdf", size: 10 }];
    const renamed = [{ id: "f", type: "file" as const, src: "a.pdf", filename: "b.pdf", size: 10 }];
    const resized = [{ id: "f", type: "file" as const, src: "a.pdf", filename: "a.pdf", size: 20 }];
    const embed = [{ id: "e", type: "embed" as const, target: "Note", heading: null }];
    const retargeted = [{ id: "e", type: "embed" as const, target: "Other", heading: null }];

    expect(haveEditorBlockRenderChanges(file, renamed)).toBe(true);
    expect(haveEditorBlockRenderChanges(file, resized)).toBe(true);
    expect(haveEditorBlockRenderChanges(embed, retargeted)).toBe(true);
  });
});
