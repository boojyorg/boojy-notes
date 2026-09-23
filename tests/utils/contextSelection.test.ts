import { describe, expect, it } from "vitest";
import { wordBoundsAt } from "../../src/utils/contextSelection";

describe("wordBoundsAt", () => {
  const text = "Hello brave world.";
  it("finds the word an offset is inside", () => {
    expect(wordBoundsAt(text, 7)).toEqual([6, 11]);
    expect(wordBoundsAt(text, 6)).toEqual([6, 11]);
  });
  it("takes the word an offset sits just after", () => {
    expect(wordBoundsAt(text, 11)).toEqual([6, 11]);
    expect(wordBoundsAt(text, 17)).toEqual([12, 17]);
  });
  it("is null on punctuation and whitespace alone", () => {
    expect(wordBoundsAt("a  -- b", 3)).toBeNull();
    expect(wordBoundsAt("", 0)).toBeNull();
  });
  it("keeps accented letters and apostrophes in the word", () => {
    expect(wordBoundsAt("the café's door", 6)).toEqual([4, 10]);
  });
});
