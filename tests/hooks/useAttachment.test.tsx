/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ isElectron: true, isPhone: false }));
vi.mock("../../src/utils/platform", () => platform);

let changed: (() => void) | null = null;
const api = {
  locateAttachment: vi.fn(
    async (_src: string, _folder: string | null) => "A/map.png" as string | null,
  ),
  onAttachmentsChanged: (cb: () => void) => {
    changed = cb;
  },
};
vi.mock("../../src/services/apiProvider", () => ({ getAPI: () => api }));

import { AttachmentFolder, recheckAttachments, useAttachment } from "../../src/hooks/useAttachment";

const inFolder =
  (folder: string | null) =>
  ({ children }: { children: ReactNode }) => (
    <AttachmentFolder.Provider value={folder}>{children}</AttachmentFolder.Provider>
  );

beforeEach(() => {
  api.locateAttachment.mockClear();
  api.locateAttachment.mockResolvedValue("A/map.png");
  recheckAttachments();
});
afterEach(cleanup);

describe("useAttachment", () => {
  it("asks from the open note's folder and draws the file found", async () => {
    const { result } = renderHook(() => useAttachment("map.png"), { wrapper: inFolder("Trips") });
    expect(result.current.rel).toBeUndefined();
    await waitFor(() => expect(result.current.rel).toBe("A/map.png"));
    expect(api.locateAttachment).toHaveBeenCalledWith("map.png", "Trips", false);
    expect(result.current.url).toBe("boojy-att://vault/A/map.png");
  });

  it("says missing only once the vault has answered none", async () => {
    api.locateAttachment.mockResolvedValue(null);
    const { result } = renderHook(() => useAttachment("gone.png"), { wrapper: inFolder(null) });
    expect(result.current.missing).toBe(false);
    await waitFor(() => expect(result.current.missing).toBe(true));
  });

  // A picture synced in after "Not found": the main process's signal makes
  // every embed ask again, and the last answer holds meanwhile.
  it("asks again when files change, keeping the last answer until the new one", async () => {
    const { result } = renderHook(() => useAttachment("map.png"), { wrapper: inFolder(null) });
    await waitFor(() => expect(result.current.rel).toBe("A/map.png"));
    let answer: (rel: string) => void = () => {};
    api.locateAttachment.mockImplementation(() => new Promise((r) => (answer = r)));

    act(() => changed?.());

    expect(result.current.rel).toBe("A/map.png");
    await act(async () => answer("B/map.png"));
    expect(result.current.rel).toBe("B/map.png");
  });

  it("answers a note opened again at once, without asking", async () => {
    const first = renderHook(() => useAttachment("map.png"), { wrapper: inFolder(null) });
    await waitFor(() => expect(first.result.current.rel).toBe("A/map.png"));
    first.unmount();
    api.locateAttachment.mockClear();

    const again = renderHook(() => useAttachment("map.png"), { wrapper: inFolder(null) });

    expect(again.result.current.rel).toBe("A/map.png");
    expect(api.locateAttachment).not.toHaveBeenCalled();
  });

  it("leaves a web address alone", () => {
    const { result } = renderHook(() => useAttachment("https://example.com/a.png"));
    expect(result.current).toEqual({ rel: null, url: "https://example.com/a.png", missing: false });
    expect(api.locateAttachment).not.toHaveBeenCalled();
  });
});
