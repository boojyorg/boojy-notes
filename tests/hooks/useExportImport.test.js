/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const exportPdf = vi.fn();
const exportDocx = vi.fn();
const importMarkdown = vi.fn();

vi.mock("../../src/services/apiProvider", () => ({
  getAPI: () => ({ exportPdf, exportDocx, importMarkdown }),
}));
vi.mock("../../src/utils/exportUtils", () => ({
  blocksToHtml: (blocks, title) => `<html data-title="${title}">${blocks.length}</html>`,
}));

import { useExportImport } from "../../src/hooks/useExportImport";

function setup(overrides = {}) {
  const noteData = {
    n1: { title: "My Note", content: { blocks: [{ id: "b1", text: "hi" }] } },
  };
  const deps = {
    noteData,
    activeNoteRef: { current: "n1" },
    noteDataRef: { current: noteData },
    isElectron: false,
    ...overrides,
  };
  const { result } = renderHook(() => useExportImport(deps));
  return { ...deps, result };
}

describe("useExportImport", () => {
  beforeEach(() => {
    exportPdf.mockClear();
    exportDocx.mockClear();
    importMarkdown.mockClear();
  });

  it("handleExportPdf renders HTML and forwards it to the API", () => {
    const { result } = setup();
    result.current.handleExportPdf("n1");
    expect(exportPdf).toHaveBeenCalledWith({
      html: '<html data-title="My Note">1</html>',
      title: "My Note",
    });
  });

  it("handleExportDocx forwards blocks + title to the API", () => {
    const { result } = setup();
    result.current.handleExportDocx("n1");
    expect(exportDocx).toHaveBeenCalledWith({
      blocks: [{ id: "b1", text: "hi" }],
      title: "My Note",
    });
  });

  it("export handlers are no-ops for an unknown note id", () => {
    const { result } = setup();
    result.current.handleExportPdf("missing");
    result.current.handleExportDocx("missing");
    expect(exportPdf).not.toHaveBeenCalled();
    expect(exportDocx).not.toHaveBeenCalled();
  });

  it("handleImportIntoFolder targets the given folder", () => {
    const { result } = setup();
    result.current.handleImportIntoFolder("folder-x");
    expect(importMarkdown).toHaveBeenCalledWith({ targetFolder: "folder-x" });
  });
});
