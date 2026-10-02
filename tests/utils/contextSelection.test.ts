/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { spellableWord, wordBoundsAt } from "../../src/utils/contextSelection";

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

describe("spellableWord", () => {
  const select = (html: string, pick: (root: HTMLElement) => Text) => {
    document.body.innerHTML = `<p data-block-id="b1">${html}</p>`;
    const node = pick(document.body.querySelector("p") as HTMLElement);
    const range = document.createRange();
    range.selectNodeContents(node);
    return range;
  };
  it("is one word of prose, with its paragraph's text", () => {
    const range = select(
      "Voy a <b>recivir</b> hoy",
      (p) => p.querySelector("b")?.firstChild as Text,
    );
    expect(spellableWord(range)).toEqual({ text: "recivir", paragraph: "Voy a recivir hoy" });
  });
  it("keeps an apostrophe inside the word", () => {
    expect(
      spellableWord(select("<i>don't</i>", (p) => p.querySelector("i")?.firstChild as Text))?.text,
    ).toBe("don't");
  });
  it("is null for a tag, inline code, a link, several words or a caret", () => {
    const inside = (html: string, sel: string) =>
      spellableWord(select(html, (p) => p.querySelector(sel)?.firstChild as Text));
    expect(inside('<span class="inline-tag">#todo</span>', "span")).toBeNull();
    expect(inside("<code>useEffect</code>", "code")).toBeNull();
    expect(inside('<a href="x">recieve</a>', "a")).toBeNull();
    expect(inside("<i>two words</i>", "i")).toBeNull();
    expect(spellableWord(null)).toBeNull();
  });
});
