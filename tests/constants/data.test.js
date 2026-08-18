import { describe, it, expect } from "vitest";
import { SLASH_COMMANDS, filterSlashCommands } from "../../src/constants/data.js";

describe("SLASH_COMMANDS", () => {
  it("is an array with commands", () => {
    expect(Array.isArray(SLASH_COMMANDS)).toBe(true);
    expect(SLASH_COMMANDS.length).toBeGreaterThan(0);
  });

  it("has unique IDs", () => {
    const ids = SLASH_COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every command has required fields", () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd).toHaveProperty("id");
      expect(cmd).toHaveProperty("label");
      expect(cmd).toHaveProperty("desc");
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
    expect(shown[shown.length - 1]).toBe("divider");
  });

  it("searches every command once anything is typed", () => {
    expect(filterSlashCommands("call").map((c) => c.id)).toEqual(["callout"]);
    expect(filterSlashCommands("embed").map((c) => c.id)).toEqual(["embed"]);
    expect(filterSlashCommands("file").map((c) => c.id)).toEqual(["file"]);
  });

  it("returns nothing for a query that matches no command", () => {
    expect(filterSlashCommands("zzzz")).toEqual([]);
  });

  it("includes essential commands", () => {
    const ids = SLASH_COMMANDS.map((c) => c.id);
    expect(ids).toContain("h1");
    expect(ids).toContain("bullet");
    expect(ids).toContain("checkbox");
    expect(ids).toContain("code");
    expect(ids).toContain("table");
  });
});
