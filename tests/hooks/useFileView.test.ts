/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const destroy = vi.fn(() => Promise.resolve());
vi.mock("../../src/utils/pdfDocument", () => ({
  openPdf: vi.fn(async () => ({ doc: { numPages: 3 }, destroy })),
  pageSizes: vi.fn(async () => [
    { width: 600, height: 800 },
    { width: 600, height: 800 },
    { width: 800, height: 600 },
  ]),
}));

import { type OpenFile, useFileView } from "../../src/hooks/useFileView";
import { FIT_PAGE, readFileView, writeFileView } from "../../src/utils/fileView";

type W = { electronAPI?: { readVaultFile?: (rel: string) => Promise<Uint8Array | null> } };
const w = window as unknown as W;

const view = (open: OpenFile | null, vault = "v") =>
  renderHook(({ o }) => useFileView(o, vault), { initialProps: { o: open } });

beforeEach(() => {
  localStorage.clear();
  w.electronAPI = { readVaultFile: vi.fn(async () => new Uint8Array([1])) };
  destroy.mockClear();
});
afterEach(() => {
  cleanup();
  delete w.electronAPI;
});

describe("useFileView", () => {
  it("shows nothing without a file", () => {
    expect(view(null).result.current).toBeNull();
  });

  it("opens a PDF at its first page, measured, and fits its width to the room", async () => {
    const { result } = view({ rel: "Uni/Lecture.pdf", seq: 1 });
    expect(result.current?.kind).toBe("pdf");
    expect(result.current?.name).toBe("Lecture.pdf");
    expect(result.current?.zoomKnown).toBe(false);
    await waitFor(() => expect(result.current?.pageCount).toBe(3));
    act(() => result.current?.setRoom({ width: 300, height: 500 }));
    expect(result.current?.scale).toBe(0.5);
    expect(result.current?.zoomLabel).toBe("50%");
    expect(result.current?.zoomKnown).toBe(true);
  });

  it("goes to a page within the document and keeps it for the file", async () => {
    const { result } = view({ rel: "a.pdf", seq: 1 });
    await waitFor(() => expect(result.current?.pageCount).toBe(3));
    const seq = result.current?.scrollSeq ?? 0;
    act(() => result.current?.goTo(9));
    expect(result.current?.page).toBe(3);
    expect(result.current?.scrollSeq).toBe(seq + 1);
    act(() => result.current?.goTo(-2));
    expect(result.current?.page).toBe(1);
    act(() => result.current?.setPageFromScroll(2));
    expect(readFileView("v", "a.pdf")?.page).toBe(2);
  });

  it("reopens a file at the zoom and page it was left at; a link's page wins", async () => {
    writeFileView("v", "a.pdf", { zoom: { mode: "pct", pct: 150 }, page: 2 });
    const { result, rerender } = view({ rel: "a.pdf", seq: 1 });
    await waitFor(() => expect(result.current?.pageCount).toBe(3));
    expect(result.current?.page).toBe(2);
    expect(result.current?.zoom).toEqual({ mode: "pct", pct: 150 });
    rerender({ o: { rel: "a.pdf", page: 3, seq: 2 } });
    expect(result.current?.page).toBe(3);
  });

  it("steps the zoom from the drawn percentage, and Actual Size is 100%", async () => {
    const { result } = view({ rel: "a.pdf", seq: 1 });
    await waitFor(() => expect(result.current?.pageCount).toBe(3));
    act(() => result.current?.setRoom({ width: 600, height: 800 }));
    act(() => result.current?.zoomIn());
    expect(result.current?.zoom).toEqual({ mode: "pct", pct: 110 });
    act(() => result.current?.zoomOut());
    act(() => result.current?.zoomOut());
    expect(result.current?.zoom).toEqual({ mode: "pct", pct: 90 });
    act(() => result.current?.actualSize());
    expect(result.current?.percent).toBe(100);
    act(() => result.current?.setZoom(FIT_PAGE));
    expect(result.current?.zoom).toEqual(FIT_PAGE);
  });

  it("says a PDF failed when its bytes can't be read", async () => {
    w.electronAPI = { readVaultFile: vi.fn(async () => null) };
    const { result } = view({ rel: "gone.pdf", seq: 1 });
    await waitFor(() => expect(result.current?.failed).toBe(true));
    expect(result.current?.pageCount).toBe(0);
  });

  it("lets the last PDF go when another file opens", async () => {
    const { result, rerender } = view({ rel: "a.pdf", seq: 1 });
    await waitFor(() => expect(result.current?.pageCount).toBe(3));
    rerender({ o: { rel: "photo.png", seq: 2 } });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(result.current?.kind).toBe("picture");
    expect(result.current?.doc).toBeNull();
  });

  it("fits a picture to the pane, never enlarged, and labels the fit", () => {
    const { result } = view({ rel: "photo.png", seq: 1 });
    expect(result.current?.zoom).toEqual(FIT_PAGE);
    act(() => {
      result.current?.setNatural({ width: 200, height: 100 });
      result.current?.setRoom({ width: 1000, height: 1000 });
    });
    expect(result.current?.scale).toBe(1);
    expect(result.current?.zoomLabel).toBe("Fit");
    act(() => result.current?.actualSize());
    expect(result.current?.zoomLabel).toBe("100%");
  });

  it("keeps nothing for a file shown as a card", () => {
    const { result } = view({ rel: "Week 3.pptx", seq: 1 });
    expect(result.current?.kind).toBe("card");
    expect(readFileView("v", "Week 3.pptx")).toBeNull();
  });

  it("remembers the page column for every PDF, and closes it where it can't fit", () => {
    const { result } = view({ rel: "a.pdf", seq: 1 });
    expect(result.current?.columnShown).toBe(false);
    expect(result.current?.columnFits).toBe(true);
    act(() => result.current?.toggleColumn());
    expect(result.current?.columnShown).toBe(true);
    expect(localStorage.getItem("boojy-page-column")).toBe("1");
    act(() => result.current?.setPaneWidth(500));
    expect(result.current?.columnFits).toBe(false);
    expect(result.current?.columnShown).toBe(false);
    act(() => result.current?.toggleColumn());
    expect(localStorage.getItem("boojy-page-column")).toBe("0");
  });
});
