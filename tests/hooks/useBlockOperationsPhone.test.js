/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";

// The phone has nowhere to keep a picture or file yet: saved by the web
// fallback, it would be written into the note as a data: URI.
vi.mock("../../src/utils/platform", async (actual) => ({
  ...(await actual()),
  addsFiles: false,
}));

const { useBlockOperations } = await import("../../src/hooks/useBlockOperations.js");

afterEach(cleanup);

describe("a picture pasted or dropped where nothing can be added", () => {
  it("leaves the note alone and says so", async () => {
    const commitNoteData = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useBlockOperations({
        commitNoteData,
        commitTextChange: vi.fn(),
        blockRefs: { current: {} },
        focusBlockId: { current: null },
        focusCursorPos: { current: null },
        onError,
      }),
    );
    const photo = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    await result.current.saveAndInsertFiles("note-1", 0, [photo]);
    expect(commitNoteData).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      "Pictures and files can't be added on the phone yet",
      "notice",
      { key: "adds-files" },
    );
  });
});
