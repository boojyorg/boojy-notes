import { describe, expect, it } from "vitest";
import { canonicalLang, sameLang } from "../../src/utils/codeLanguage";

describe("canonicalLang", () => {
  // Read, never written: the file keeps the word that was typed.
  it("resolves the aliases the app knows", () => {
    expect(canonicalLang("js")).toBe("javascript");
    expect(canonicalLang("TS")).toBe("typescript");
    expect(canonicalLang("py")).toBe("python");
    expect(canonicalLang("zsh")).toBe("bash");
    expect(canonicalLang("htm")).toBe("html");
  });

  it("answers the empty language for a fence that names none", () => {
    expect(canonicalLang("")).toBe("");
    expect(canonicalLang(null)).toBe("");
    expect(canonicalLang(undefined)).toBe("");
    expect(canonicalLang("plain")).toBe("");
    expect(canonicalLang("  text  ")).toBe("");
  });

  // A word the app does not know reads as it was written; xml and svg stay
  // themselves, whatever grammar draws their colours.
  it("keeps a word it does not know", () => {
    expect(canonicalLang("rust")).toBe("rust");
    expect(canonicalLang("XML")).toBe("xml");
    expect(canonicalLang("svg")).toBe("svg");
  });
});

describe("sameLang", () => {
  it("is how a re-pick of the same language writes nothing", () => {
    expect(sameLang("js", "javascript")).toBe(true);
    expect(sameLang("", "plain")).toBe(true);
    expect(sameLang("js", "typescript")).toBe(false);
    expect(sameLang("rust", "")).toBe(false);
  });
});
