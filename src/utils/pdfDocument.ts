import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * PDF.js, loaded the first time a PDF is opened and never before: it is most
 * of a megabyte, and launch should not pay for a viewer most sessions never
 * open. Its worker parses the file off the window's thread.
 */
type PdfLib = typeof import("pdfjs-dist");
let lib: Promise<PdfLib> | null = null;

export function loadPdfLib(): Promise<PdfLib> {
  lib ??= Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return lib;
}

/**
 * A PDF from its bytes, and the way to let it go (the loading task's
 * `destroy`, which ends its worker's copy too). PDF.js 6 runs nothing a file
 * carries: a PDF is only ever drawn.
 */
export async function openPdf(
  bytes: Uint8Array,
): Promise<{ doc: PDFDocumentProxy; destroy: () => Promise<void> }> {
  const pdfjs = await loadPdfLib();
  const task = pdfjs.getDocument({ data: bytes });
  return { doc: await task.promise, destroy: () => task.destroy() };
}

/** Each page's own size, in PDF points (100%), in page order. */
export async function pageSizes(
  doc: PDFDocumentProxy,
): Promise<{ width: number; height: number }[]> {
  const sizes: { width: number; height: number }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const { width, height } = (await doc.getPage(n)).getViewport({ scale: 1 });
    sizes.push({ width, height });
  }
  return sizes;
}
