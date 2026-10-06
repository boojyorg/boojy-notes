import { afterEach, describe, expect, it } from "vitest";
import {
  FIT_PAGE,
  FIT_WIDTH,
  FIT_WIDTH_CAP,
  VIEW_KEY,
  VIEW_MAX,
  fileForTarget,
  fileLinkTarget,
  fileViewKind,
  linkedPage,
  pageLink,
  pageWidth,
  readFileView,
  sameZoom,
  stepZoom,
  writeFileView,
  zoomPercent,
} from "../../src/utils/fileView";

const files = (...paths: string[]) => paths.map((path) => ({ path, attachment: false }));

describe("fileViewKind", () => {
  it("draws a PDF as pages, a picture Chromium can draw as a picture, anything else as the card", () => {
    expect(fileViewKind("Uni/Lecture 3.PDF")).toBe("pdf");
    expect(fileViewKind("board.jpeg")).toBe("picture");
    expect(fileViewKind("logo.svg")).toBe("picture");
    expect(fileViewKind("photo.heic")).toBe("card");
    expect(fileViewKind("Week 3.pptx")).toBe("card");
    expect(fileViewKind("README")).toBe("card");
  });
});

describe("pageWidth", () => {
  const slide = { width: 720, height: 405 };
  const a4 = { width: 595, height: 842 };
  const room = { width: 1200, height: 700 };

  it("fits the width, but no wider than the cap for its orientation", () => {
    expect(pageWidth(FIT_WIDTH, slide, room)).toBe(FIT_WIDTH_CAP.landscape);
    expect(pageWidth(FIT_WIDTH, a4, room)).toBe(FIT_WIDTH_CAP.portrait);
    expect(pageWidth(FIT_WIDTH, a4, { width: 500, height: 700 })).toBe(500);
  });

  it("fits the whole page when the height is what runs out", () => {
    expect(pageWidth(FIT_PAGE, a4, room)).toBeCloseTo((700 * 595) / 842);
    expect(pageWidth(FIT_PAGE, slide, room)).toBe(FIT_WIDTH_CAP.landscape);
  });

  it("draws a percentage of the page's own size", () => {
    expect(pageWidth({ mode: "pct", pct: 150 }, a4, room)).toBe(892.5);
  });

  it("never enlarges a small picture by a fit", () => {
    const icon = { width: 64, height: 64 };
    expect(pageWidth(FIT_PAGE, icon, room, true)).toBe(64);
    expect(pageWidth({ mode: "pct", pct: 200 }, icon, room, true)).toBe(128);
  });
});

describe("zoom steps", () => {
  it("walks the steps from wherever a fit left it, holding at the ends", () => {
    expect(stepZoom(118, 1)).toBe(125);
    expect(stepZoom(118, -1)).toBe(110);
    expect(stepZoom(100, 1)).toBe(110);
    expect(stepZoom(400, 1)).toBe(400);
    expect(stepZoom(25, -1)).toBe(25);
    expect(zoomPercent(892.5, 595)).toBe(150);
  });

  it("ticks a fit or a percentage only for the same one", () => {
    expect(sameZoom(FIT_WIDTH, { mode: "fitWidth" })).toBe(true);
    expect(sameZoom(FIT_WIDTH, FIT_PAGE)).toBe(false);
    expect(sameZoom({ mode: "pct", pct: 100 }, { mode: "pct", pct: 100 })).toBe(true);
    expect(sameZoom({ mode: "pct", pct: 100 }, { mode: "pct", pct: 125 })).toBe(false);
  });
});

describe("what each file remembers", () => {
  afterEach(() => localStorage.clear());

  it("keeps a file's zoom and page per vault, and nothing for one never opened", () => {
    writeFileView("/vault-a", "Uni/L3.pdf", { zoom: { mode: "pct", pct: 125 }, page: 12 });
    expect(readFileView("/vault-a", "Uni/L3.pdf")).toEqual({
      zoom: { mode: "pct", pct: 125 },
      page: 12,
    });
    expect(readFileView("/vault-b", "Uni/L3.pdf")).toBeNull();
    expect(readFileView("/vault-a", "Other.pdf")).toBeNull();
  });

  it("reads nothing it cannot trust, and keeps only the newest files", () => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ v: { "a.pdf": { zoom: { mode: "x" } } } }));
    expect(readFileView("v", "a.pdf")).toBeNull();
    for (let i = 0; i <= VIEW_MAX; i++)
      writeFileView("v", `${i}.pdf`, { zoom: FIT_WIDTH, page: 1 });
    expect(readFileView("v", "0.pdf")).toBeNull();
    expect(readFileView("v", `${VIEW_MAX}.pdf`)).not.toBeNull();
  });
});

describe("links to a file and its pages", () => {
  it("names a file by its name, or by its path when another file shares the name", () => {
    expect(fileLinkTarget("Uni/L3.pdf", files("Uni/L3.pdf", "Notes.pdf"))).toBe("L3.pdf");
    expect(fileLinkTarget("Uni/L3.pdf", files("Uni/L3.pdf", "Old/L3.pdf"))).toBe("Uni/L3.pdf");
    expect(pageLink("Uni/L3.pdf", 12, files("Uni/L3.pdf"))).toBe("[[L3.pdf#page=12]]");
  });

  it("reads a page from #page=N and nothing else", () => {
    expect(linkedPage("page=12")).toBe(12);
    expect(linkedPage("Intro")).toBeNull();
    expect(linkedPage("page=0")).toBeNull();
    expect(linkedPage(null)).toBeNull();
  });

  it("finds the file a target names, by name or by path, never a note or a namesake", () => {
    const vault = files("Uni/Lecture 3.pdf", "Old/dup.pdf", "New/dup.pdf");
    expect(fileForTarget("Lecture 3.pdf#page=4", vault)).toEqual({
      path: "Uni/Lecture 3.pdf",
      page: 4,
    });
    expect(fileForTarget("lecture 3.PDF", vault)).toEqual({
      path: "Uni/Lecture 3.pdf",
      page: null,
    });
    expect(fileForTarget("New/dup.pdf", vault)).toEqual({ path: "New/dup.pdf", page: null });
    expect(fileForTarget("dup.pdf", vault)).toBeNull();
    expect(fileForTarget("Lecture 3", vault)).toBeNull();
    expect(fileForTarget("Lecture 3.md", vault)).toBeNull();
  });
});
