import { describe, expect, it } from "vitest";
import {
  attachmentLabel,
  groupOtherFiles,
  otherFileKind,
  splitExtension,
} from "../../src/utils/otherFiles";

const files = [
  { path: "reading-list.pdf", attachment: false },
  { path: "Uni/lecture-10.pptx", attachment: false },
  { path: "Uni/lecture-3.pptx", attachment: false },
  { path: "attachments/diagram-1.png", attachment: true },
  { path: "attachments/a.png", attachment: true },
];

describe("groupOtherFiles", () => {
  it("puts each file in its folder, in natural name order, the store hidden by default", () => {
    const { byFolder, attachments } = groupOtherFiles(files, {
      otherFiles: true,
      attachments: false,
    });
    expect(byFolder.get("")).toEqual(["reading-list.pdf"]);
    expect(byFolder.get("Uni")).toEqual(["Uni/lecture-3.pptx", "Uni/lecture-10.pptx"]);
    expect(attachments).toBeNull();
  });

  it("shows the attachment store on its own, whatever the other files' toggle says", () => {
    const { byFolder, attachments } = groupOtherFiles(files, {
      otherFiles: false,
      attachments: true,
    });
    expect(byFolder.size).toBe(0);
    expect(attachments).toEqual(["attachments/a.png", "attachments/diagram-1.png"]);
  });

  it("shows an empty store as an empty list, not as hidden", () => {
    expect(groupOtherFiles([], { otherFiles: true, attachments: true }).attachments).toEqual([]);
  });
});

describe("otherFileKind", () => {
  it("reads the kind from the extension, any case", () => {
    expect(otherFileKind("a.PNG")).toBe("image");
    expect(otherFileKind("song.m4a")).toBe("audio");
    expect(otherFileKind("clip.mov")).toBe("video");
    expect(otherFileKind("deck.key")).toBe("slides");
    expect(otherFileKind("budget.csv")).toBe("sheet");
    expect(otherFileKind("backup.zip")).toBe("archive");
    expect(otherFileKind("paper.pdf")).toBe("file");
    expect(otherFileKind("Makefile")).toBe("file");
  });
});

describe("splitExtension", () => {
  it("keeps the last extension apart and leaves an extensionless name whole", () => {
    expect(splitExtension("report.final.pdf")).toEqual({ stem: "report.final", ext: ".pdf" });
    expect(splitExtension("Makefile")).toEqual({ stem: "Makefile", ext: "" });
    expect(splitExtension(".env")).toEqual({ stem: ".env", ext: "" });
  });
});

describe("attachmentLabel", () => {
  it("names an attachment by its path inside the store", () => {
    expect(attachmentLabel("attachments/sub/x.png")).toBe("sub/x.png");
  });
});
