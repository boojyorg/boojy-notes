/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/attachmentUrl", () => ({
  attachmentUrls: (src: string) => [`first/${src}`, `second/${src}`],
}));

import { useAttachmentSrc } from "../../src/hooks/useAttachmentSrc";

afterEach(cleanup);

describe("useAttachmentSrc", () => {
  it("moves to the next place on a failed load, and says when none is left", () => {
    const { result } = renderHook(() => useAttachmentSrc("a.png"));
    expect(result.current.url).toBe("first/a.png");
    act(() => expect(result.current.next()).toBe(true));
    expect(result.current.url).toBe("second/a.png");
    act(() => expect(result.current.next()).toBe(false));
  });

  it("keeps the address that loaded, and starts there next time", () => {
    const { result } = renderHook(() => useAttachmentSrc("b.png"));
    act(() => {
      result.current.next();
    });
    act(() => result.current.loaded());
    // Remembering mid-load never reshuffles the places being tried.
    expect(result.current.url).toBe("second/b.png");

    const again = renderHook(() => useAttachmentSrc("b.png"));
    expect(again.result.current.url).toBe("second/b.png");
    act(() => {
      again.result.current.next();
    });
    expect(again.result.current.url).toBe("first/b.png");
  });

  it("starts a new source from its first place", () => {
    const { result, rerender } = renderHook(({ src }) => useAttachmentSrc(src), {
      initialProps: { src: "c.png" },
    });
    act(() => {
      result.current.next();
    });
    rerender({ src: "d.png" });
    expect(result.current.url).toBe("first/d.png");
  });
});
