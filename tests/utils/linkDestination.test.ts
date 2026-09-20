import { describe, expect, it } from "vitest";
import { readAddress, shownAddress } from "../../src/utils/linkDestination";

describe("readAddress", () => {
  it("recognises an address with or without its scheme, and adds https to one without", () => {
    expect(readAddress("https://example.org/a?b=1")).toBe("https://example.org/a?b=1");
    expect(readAddress("http://example.org")).toBe("http://example.org");
    expect(readAddress("youtube.com")).toBe("https://youtube.com");
    expect(readAddress("www.bbc.co.uk/news")).toBe("https://www.bbc.co.uk/news");
    expect(readAddress("  github.com/boojy  ")).toBe("https://github.com/boojy");
    expect(readAddress("localhost:5173/x")).toBeNull();
  });

  it("is not fooled by a note's name", () => {
    expect(readAddress("Goals")).toBeNull();
    expect(readAddress("Week 38 review")).toBeNull();
    expect(readAddress("v1.2")).toBeNull();
    expect(readAddress("")).toBeNull();
    expect(readAddress("a b.com")).toBeNull();
  });
});

describe("shownAddress", () => {
  it("drops the scheme and www for the row", () => {
    expect(shownAddress("https://www.youtube.com/watch?v=1")).toBe("youtube.com/watch?v=1");
    expect(shownAddress("http://example.org")).toBe("example.org");
  });
});
