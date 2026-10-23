import { describe, expect, it } from "vitest";
import { LATEX_COMMANDS, commandAtCaret, matchCommands } from "../../src/utils/latexCommands";

const commands = (q: string) => matchCommands(q).map((c) => c.command);

describe("matchCommands", () => {
  it("puts commands that start with the query first, then plain words", () => {
    expect(commands("fr")[0]).toBe("\\frac");
    expect(commands("fraction")).toEqual(["\\frac"]);
    expect(commands("less")).toEqual(["\\le"]);
    expect(commands("root")).toEqual(["\\sqrt"]);
  });

  it("keeps a command's case and ignores it for words", () => {
    expect(commands("Delta")[0]).toBe("\\Delta");
    expect(commands("delta")[0]).toBe("\\delta");
    expect(commands("DIVIDE")).toContain("\\frac");
  });

  it("offers the list's head for a bare backslash, and nothing fuzzy", () => {
    expect(matchCommands("").length).toBe(8);
    expect(commands("frc")).toEqual([]);
  });

  it("places the caret inside the first braces, or after a plain command", () => {
    const frac = LATEX_COMMANDS.find((c) => c.command === "\\frac");
    expect(frac?.insert.slice(0, frac.caret)).toBe("\\frac{");
    const alpha = LATEX_COMMANDS.find((c) => c.command === "\\alpha");
    expect(alpha?.caret).toBe("\\alpha".length);
  });

  it("lists every command once", () => {
    const all = LATEX_COMMANDS.map((c) => c.command);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("commandAtCaret", () => {
  const at = (text: string) =>
    commandAtCaret(text.replace("|", ""), text.indexOf("|"), text.indexOf("|"));

  it("reads the \\word the caret ends", () => {
    expect(at("x = \\fr|")).toEqual({ from: 4, query: "fr" });
    expect(at("\\|")).toEqual({ from: 0, query: "" });
  });

  it("offers nothing mid-word, after a space or brace, or on a selection", () => {
    expect(at("\\fr|ac")).toBeNull();
    expect(at("\\frac |")).toBeNull();
    expect(at("\\frac{|")).toBeNull();
    expect(commandAtCaret("\\fr", 1, 3)).toBeNull();
  });

  it("never reads an escaped backslash as a command: \\\\ is a line break", () => {
    expect(at("a \\\\|")).toBeNull();
    expect(at("a \\\\b|")).toBeNull();
    expect(at("a \\\\\\al|")).toEqual({ from: 4, query: "al" });
  });
});
