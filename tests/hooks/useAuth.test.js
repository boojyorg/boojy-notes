import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const signOutMock = vi.fn().mockResolvedValue({ error: null });

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: () => signOutMock(),
    },
  },
}));

const { useAuth } = await import("../../src/hooks/useAuth");

describe("useAuth signOut", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("clears sync metadata so a later sign-in cannot re-arm stale state", async () => {
    localStorage.setItem("boojy-sync-last", "2026-03-14T00:00:00Z");
    localStorage.setItem("boojy-sync-versions", "{}");
    localStorage.setItem("boojy-sync-dirty", '["note-1"]');
    localStorage.setItem("boojy-sync-storage", "12345");

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signOut();
    });

    expect(signOutMock).toHaveBeenCalled();
    expect(localStorage.getItem("boojy-sync-last")).toBeNull();
    expect(localStorage.getItem("boojy-sync-versions")).toBeNull();
    expect(localStorage.getItem("boojy-sync-dirty")).toBeNull();
    expect(localStorage.getItem("boojy-sync-storage")).toBeNull();
  });

  it("leaves the per-device sync opt-in preference alone", async () => {
    localStorage.setItem("boojy-sync-enabled", "1");

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signOut();
    });

    expect(localStorage.getItem("boojy-sync-enabled")).toBe("1");
  });
});
