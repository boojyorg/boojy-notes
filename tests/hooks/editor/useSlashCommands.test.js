/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSlashCommands } from "../../../src/hooks/editor/useSlashCommands";

// Sequential ids so tests can assert which block was minted first.
let idCounter = 0;
vi.mock("../../../src/utils/storage", () => ({
  genBlockId: () => `new-${++idCounter}`,
}));

// getAPI() is only consulted by the Image and File commands; tests swap it per case.
let api = null;
vi.mock("../../../src/services/apiProvider", () => ({
  getAPI: () => api,
}));

const PARA = (id) => ({ id, type: "p", text: "" });

function setup(initialBlocks = [{ id: "block-1", type: "p", text: "/x" }]) {
  const noteDataRef = { current: { "note-1": { content: { blocks: initialBlocks } } } };
  const commitNoteData = vi.fn((updater) => {
    noteDataRef.current = updater(noteDataRef.current);
  });
  const focusBlockId = { current: null };
  const focusCursorPos = { current: null };
  const element = document.createElement("div");
  element.textContent = "/x";
  const insertBlockAfter = vi.fn();
  const onError = vi.fn();

  const { result } = renderHook(() =>
    useSlashCommands({
      noteDataRef,
      blockRefs: { current: { "block-1": element } },
      commitNoteData,
      focusBlockId,
      focusCursorPos,
      insertBlockAfter,
      onError,
    }),
  );

  const run = (command, index = 0) =>
    act(() => result.current.executeSlashCommand("note-1", index, command));
  const blocks = () => noteDataRef.current["note-1"].content.blocks;
  return { run, blocks, element, focusBlockId, focusCursorPos, insertBlockAfter, onError };
}

beforeEach(() => {
  idCounter = 0;
  api = null;
});

// Every "special block" command must leave: [special, fresh paragraph], the
// slash block's DOM cleared to <br>, and the caret at 0 in the new paragraph.
function expectSpecialThenParagraph(t, special, paraId) {
  expect(t.blocks()).toEqual([special, PARA(paraId)]);
  expect(t.element.innerHTML).toBe("<br>");
  expect(t.focusBlockId.current).toBe(paraId);
  expect(t.focusCursorPos.current).toBe(0);
}

describe("useSlashCommands — special blocks", () => {
  it("Table: a blank 2x2 table and a following paragraph", async () => {
    const t = setup();
    await t.run({ type: "table" });
    expectSpecialThenParagraph(
      t,
      {
        id: "block-1",
        type: "table",
        text: "",
        rows: [
          ["", ""],
          ["", ""],
        ],
      },
      "new-1",
    );
  });

  it("Code: an empty code block with no language, then a paragraph", async () => {
    const t = setup();
    await t.run({ type: "code" });
    expectSpecialThenParagraph(t, { id: "block-1", type: "code", text: "", lang: "" }, "new-1");
  });

  it("Callout: keeps the requested callout type, defaulting to note", async () => {
    const t = setup();
    await t.run({ type: "callout", calloutType: "warning" });
    expectSpecialThenParagraph(
      t,
      { id: "block-1", type: "callout", text: "", calloutType: "warning", title: "" },
      "new-1",
    );

    const u = setup();
    await u.run({ type: "callout" });
    expect(u.blocks()[0]).toMatchObject({ type: "callout", calloutType: "note", title: "" });
  });

  it("Embed: an empty embed with no target or heading, then a paragraph", async () => {
    const t = setup();
    await t.run({ type: "embed" });
    expectSpecialThenParagraph(
      t,
      { id: "block-1", type: "embed", text: "", target: "", heading: null },
      "new-1",
    );
  });

  it("keeps sibling blocks and replaces only the slash block", async () => {
    const t = setup([
      { id: "a", type: "p", text: "before" },
      { id: "block-1", type: "p", text: "/code" },
      { id: "z", type: "p", text: "after" },
    ]);
    await t.run({ type: "code" }, 1);
    expect(t.blocks().map((b) => b.id)).toEqual(["a", "block-1", "new-1", "z"]);
  });
});

describe("useSlashCommands — Image", () => {
  it("clears the slash text, picks, saves, then inserts image + paragraph", async () => {
    api = {
      pickImageFile: vi.fn().mockResolvedValue({ fileName: "cat.png", dataBase64: "AAA" }),
      saveImage: vi.fn().mockResolvedValue("cat-123.png"),
    };
    const t = setup();
    await t.run({ type: "image" });
    expect(api.saveImage).toHaveBeenCalledWith({ fileName: "cat.png", dataBase64: "AAA" });
    // Image block is minted before its trailing paragraph.
    expectSpecialThenParagraph(
      t,
      { id: "new-1", type: "image", src: "cat-123.png", alt: "cat", width: 0, text: "" },
      "new-2",
    );
  });

  it("cancelled picker: slash text is gone, caret returns to the same block", async () => {
    api = { pickImageFile: vi.fn().mockResolvedValue(null), saveImage: vi.fn() };
    const t = setup();
    await t.run({ type: "image" });
    expect(t.blocks()).toEqual([{ id: "block-1", type: "p", text: "" }]);
    expect(t.element.innerHTML).toBe("<br>");
    expect(t.focusBlockId.current).toBe("block-1");
    expect(t.focusCursorPos.current).toBe(0);
    expect(api.saveImage).not.toHaveBeenCalled();
  });

  it("save failure: reports the error and returns the caret to the block", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    api = {
      pickImageFile: vi.fn().mockResolvedValue({ fileName: "cat.png", dataBase64: "AAA" }),
      saveImage: vi.fn().mockRejectedValue(new Error("disk")),
    };
    const t = setup();
    await t.run({ type: "image" });
    expect(t.onError).toHaveBeenCalledWith("Failed to insert image");
    expect(t.blocks()).toEqual([{ id: "block-1", type: "p", text: "" }]);
    expect(t.focusBlockId.current).toBe("block-1");
  });

  it("no platform API: only the slash text is cleared", async () => {
    const t = setup();
    await t.run({ type: "image" });
    expect(t.blocks()).toEqual([{ id: "block-1", type: "p", text: "" }]);
    expect(t.focusBlockId.current).toBeNull();
  });
});

describe("useSlashCommands — File", () => {
  it("a picked image file becomes an image block, not a file block", async () => {
    api = {
      pickFile: vi.fn().mockResolvedValue({ fileName: "Photo.JPG", dataBase64: "AAA", size: 9 }),
      saveImage: vi.fn().mockResolvedValue("photo-1.jpg"),
      saveAttachment: vi.fn(),
    };
    const t = setup();
    await t.run({ type: "file" });
    expect(api.saveAttachment).not.toHaveBeenCalled();
    expectSpecialThenParagraph(
      t,
      { id: "new-1", type: "image", src: "photo-1.jpg", alt: "Photo", width: 0, text: "" },
      "new-2",
    );
  });

  it("any other file becomes a file block carrying name and size", async () => {
    api = {
      pickFile: vi.fn().mockResolvedValue({ fileName: "deck.pdf", dataBase64: "AAA", size: 9 }),
      saveImage: vi.fn(),
      saveAttachment: vi.fn().mockResolvedValue({ filename: "deck-1.pdf", size: 4096 }),
    };
    const t = setup();
    await t.run({ type: "file" });
    expect(api.saveImage).not.toHaveBeenCalled();
    expectSpecialThenParagraph(
      t,
      {
        id: "new-1",
        type: "file",
        src: "deck-1.pdf",
        filename: "deck-1.pdf",
        size: 4096,
        text: "",
      },
      "new-2",
    );
  });

  it("cancelled picker returns the caret to the cleared block", async () => {
    api = { pickFile: vi.fn().mockResolvedValue(null) };
    const t = setup();
    await t.run({ type: "file" });
    expect(t.blocks()).toEqual([{ id: "block-1", type: "p", text: "" }]);
    expect(t.focusBlockId.current).toBe("block-1");
    expect(t.focusCursorPos.current).toBe(0);
  });

  it("failure reports the attach error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    api = { pickFile: vi.fn().mockRejectedValue(new Error("nope")) };
    const t = setup();
    await t.run({ type: "file" });
    expect(t.onError).toHaveBeenCalledWith("Failed to attach file");
    expect(t.focusBlockId.current).toBe("block-1");
  });
});

describe("useSlashCommands — plain conversions", () => {
  it("converts the block in place and keeps the caret in it", async () => {
    const t = setup([{ id: "block-1", type: "p", text: "/h1", checked: true }]);
    await t.run({ type: "h1" });
    expect(t.blocks()).toEqual([{ id: "block-1", type: "h1", text: "" }]);
    expect(t.focusBlockId.current).toBe("block-1");
    expect(t.focusCursorPos.current).toBe(0);
  });

  it("checkbox starts unchecked", async () => {
    const t = setup();
    await t.run({ type: "checkbox" });
    expect(t.blocks()).toEqual([{ id: "block-1", type: "checkbox", text: "", checked: false }]);
  });

  it("spacer drops text and asks for a paragraph after it", async () => {
    const t = setup();
    await t.run({ type: "spacer" });
    expect(t.blocks()).toEqual([{ id: "block-1", type: "spacer" }]);
    expect(t.insertBlockAfter).toHaveBeenCalledWith("note-1", 0, "p", "");
  });
});
