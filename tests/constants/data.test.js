import { describe, it, expect } from "vitest";
import { SLASH_COMMANDS } from "../../src/constants/data.js";

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
      "table",
      "file",
      "embed",
    ]);
    for (const cmd of SLASH_COMMANDS) {
      expect(validTypes.has(cmd.type)).toBe(true);
    }
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
