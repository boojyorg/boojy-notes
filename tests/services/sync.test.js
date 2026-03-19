import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseFrontmatter,
  markdownToBlocks,
  blocksToMarkdown,
  serializeFrontmatter,
  pushNote,
  pullNotes,
  deleteNoteRemote,
} from "../../src/services/sync.js";

// ─── parseFrontmatter ───

describe("parseFrontmatter", () => {
  it("parses valid YAML frontmatter", () => {
    const content = "---\ntitle: My Note\nfolder: Work\npath: a/b\nwords: 42\n---\nHello world";
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result.title).toBe("My Note");
    expect(result.folder).toBe("Work");
    expect(result.path).toEqual(["a", "b"]);
    expect(result.words).toBe(42);
    expect(result.body).toBe("Hello world");
  });

  it("returns null for invalid input", () => {
    expect(parseFrontmatter("no frontmatter here")).toBeNull();
    expect(parseFrontmatter("---\nincomplete")).toBeNull();
    expect(parseFrontmatter("")).toBeNull();
  });

  it("handles missing fields with defaults", () => {
    const content = "---\ntitle: Only Title\n---\nBody text";
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result.title).toBe("Only Title");
    expect(result.folder).toBeNull();
    expect(result.path).toBeNull();
    expect(result.words).toBe(0);
    expect(result.body).toBe("Body text");
  });
});

// ─── markdownToBlocks ───

describe("markdownToBlocks", () => {
  it("converts paragraphs", () => {
    const blocks = markdownToBlocks("Hello\nWorld");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("p");
    expect(blocks[0].text).toBe("Hello");
    expect(blocks[1].type).toBe("p");
    expect(blocks[1].text).toBe("World");
  });

  it("converts headings h1-h3", () => {
    const blocks = markdownToBlocks("# Heading 1\n## Heading 2\n### Heading 3");
    expect(blocks[0]).toMatchObject({ type: "h1", text: "Heading 1" });
    expect(blocks[1]).toMatchObject({ type: "h2", text: "Heading 2" });
    expect(blocks[2]).toMatchObject({ type: "h3", text: "Heading 3" });
  });

  it("converts bullet lists", () => {
    const blocks = markdownToBlocks("- Item one\n- Item two");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "bullet", text: "Item one" });
    expect(blocks[1]).toMatchObject({ type: "bullet", text: "Item two" });
  });

  it("converts numbered lists", () => {
    const blocks = markdownToBlocks("1. First\n1. Second");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "numbered", text: "First" });
    expect(blocks[1]).toMatchObject({ type: "numbered", text: "Second" });
  });

  it("converts checkboxes (checked and unchecked)", () => {
    const blocks = markdownToBlocks("- [ ] Todo\n- [x] Done\n- [X] Also done");
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ type: "checkbox", text: "Todo", checked: false });
    expect(blocks[1]).toMatchObject({ type: "checkbox", text: "Done", checked: true });
    expect(blocks[2]).toMatchObject({ type: "checkbox", text: "Also done", checked: true });
  });

  it("converts code blocks with language", () => {
    const md = "```js\nconsole.log('hi');\n```";
    const blocks = markdownToBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "code", lang: "js", text: "console.log('hi');" });
  });

  it("converts blockquotes", () => {
    const blocks = markdownToBlocks("> A quote");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "blockquote", text: "A quote" });
  });

  it("converts horizontal rules to spacers", () => {
    const blocks = markdownToBlocks("Above\n---\nBelow");
    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toMatchObject({ type: "spacer", text: "" });
  });
});

// ─── blocksToMarkdown round-trip ───

describe("blocksToMarkdown round-trip", () => {
  it("preserves content through blocks → markdown → blocks", () => {
    const original = [
      { id: "1", type: "h1", text: "Title" },
      { id: "2", type: "p", text: "A paragraph" },
      { id: "3", type: "bullet", text: "Item", indent: 0 },
      { id: "4", type: "checkbox", text: "Task", checked: true, indent: 0 },
      { id: "5", type: "spacer", text: "" },
    ];

    const md = blocksToMarkdown(original);
    const restored = markdownToBlocks(md);

    expect(restored).toHaveLength(original.length);
    expect(restored[0]).toMatchObject({ type: "h1", text: "Title" });
    expect(restored[1]).toMatchObject({ type: "p", text: "A paragraph" });
    expect(restored[2]).toMatchObject({ type: "bullet", text: "Item" });
    expect(restored[3]).toMatchObject({ type: "checkbox", text: "Task", checked: true });
    expect(restored[4]).toMatchObject({ type: "spacer", text: "" });
  });
});

// ─── Sync API (mocked supabase) ───

// We need to provide a real mock for supabase.functions.invoke for these tests
const mockInvoke = vi.fn();
vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    functions: { invoke: (...args) => mockInvoke(...args) },
  },
}));

describe("pushNote", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("constructs correct payload", async () => {
    mockInvoke.mockResolvedValue({ data: { version: 1 }, error: null });

    const note = {
      id: "note-1",
      title: "Test Note",
      content: {
        blocks: [{ id: "b1", type: "p", text: "Hello" }],
      },
      words: 1,
    };

    await pushNote(note, 0);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [fnName, opts] = mockInvoke.mock.calls[0];
    expect(fnName).toBe("sync-push");
    const body = opts.body;
    expect(body.noteId).toBe("note-1");
    expect(body.title).toBe("Test Note");
    expect(body.content).toContain("Hello");
    expect(body.content).toContain("---");
    expect(body.expectedVersion).toBe(0);
    expect(body.updatedAt).toBeDefined();
  });
});

describe("pullNotes", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("parses response correctly", async () => {
    const mockNotes = [{ id: "n1", title: "Note 1", content: "body1", version: 2 }];
    mockInvoke.mockResolvedValue({ data: { notes: mockNotes }, error: null });

    const result = await pullNotes("2025-01-01T00:00:00Z");

    expect(mockInvoke).toHaveBeenCalledWith("sync-pull", {
      body: { since: "2025-01-01T00:00:00Z" },
    });
    expect(result).toEqual({ notes: mockNotes });
  });
});

describe("deleteNoteRemote", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("sends delete request with noteId", async () => {
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });

    await deleteNoteRemote("note-42");

    expect(mockInvoke).toHaveBeenCalledWith("sync-delete", {
      body: { noteId: "note-42" },
    });
  });
});
