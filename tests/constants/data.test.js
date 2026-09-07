import { describe, it, expect } from "vitest";
import { SLASH_COMMANDS, filterSlashCommands } from "../../src/constants/data.js";

describe("SLASH_COMMANDS", () => {
  it("has unique IDs", () => {
    const ids = SLASH_COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every command has required fields", () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd).toHaveProperty("id");
      expect(cmd).toHaveProperty("label");
      expect(cmd).toHaveProperty("hint");
      expect(typeof cmd.hint).toBe("string");
      expect(cmd).toHaveProperty("icon");
      expect(cmd).toHaveProperty("type");
      expect(typeof cmd.id).toBe("string");
      expect(typeof cmd.label).toBe("string");
      expect(typeof cmd.type).toBe("string");
    }
  });

  it("has valid block types", () => {
    const validTypes = new Set([
      "h1",
      "h2",
      "h3",
      "bullet",
      "numbered",
      "checkbox",
      "spacer",
      "image",
      "code",
      "callout",
      "blockquote",
      "table",
      "file",
      "embed",
    ]);
    for (const cmd of SLASH_COMMANDS) {
      expect(validTypes.has(cmd.type)).toBe(true);
    }
  });

  it("keeps callout, file and embed off the opening screen", () => {
    const advanced = SLASH_COMMANDS.filter((c) => c.advanced).map((c) => c.id);
    expect(advanced).toEqual(["callout", "file", "embed"]);
  });

  it("shows only the first tier for an empty query", () => {
    const shown = filterSlashCommands("").map((c) => c.id);
    expect(shown).toHaveLength(11);
    expect(shown).not.toContain("callout");
    expect(shown[0]).toBe("h1");
  });

  it("orders the Markdown blocks first and the app's own triggers, Table and Image, last", () => {
    const shown = filterSlashCommands("");
    expect(shown.every((c) => c.hint !== "")).toBe(true);
    expect(shown.slice(-2).map((c) => c.id)).toEqual(["table", "image"]);
  });

  it("hints only what the input handler turns into the block", () => {
    const hints = Object.fromEntries(SLASH_COMMANDS.map((c) => [c.id, c.hint]));
    expect(hints).toMatchObject({
      h1: "#",
      h2: "##",
      h3: "###",
      bullet: "-",
      numbered: "1.",
      checkbox: "[]",
      blockquote: ">",
      code: "```",
      divider: "---",
      table: "|||",
      image: "![]",
    });
    // No typed trigger, so no hint.
    for (const id of ["callout", "file", "embed"]) expect(hints[id]).toBe("");
  });

  it("uses plain names, not markup terms", () => {
    const labels = Object.fromEntries(SLASH_COMMANDS.map((c) => [c.id, c.label]));
    expect(labels.blockquote).toBe("Quote");
    expect(labels.checkbox).toBe("To-do list");
  });

  it("searches every command once anything is typed", () => {
    expect(filterSlashCommands("call").map((c) => c.id)).toEqual(["callout"]);
    expect(filterSlashCommands("embed").map((c) => c.id)).toEqual(["embed"]);
    expect(filterSlashCommands("file").map((c) => c.id)).toEqual(["file"]);
  });

  it("returns nothing for a query that matches no command", () => {
    expect(filterSlashCommands("zzzz")).toEqual([]);
  });
});
