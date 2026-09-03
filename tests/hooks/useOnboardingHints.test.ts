/** @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import useOnboardingHints from "../../src/hooks/useOnboardingHints";

describe("useOnboardingHints", () => {
  beforeEach(() => localStorage.clear());

  it("does not advertise the removed split view after the current desktop hints are seen", () => {
    localStorage.setItem(
      "boojy_onboarding_seen",
      JSON.stringify(["slash-commands", "wikilinks", "tags"]),
    );

    const { result } = renderHook(() =>
      useOnboardingHints({ noteCount: 5, isEditorFocused: true }),
    );

    expect(result.current.activeHint).toBeNull();
  });

  it("walks the three hints in order and stops — no swipe hint, there is no swipe gesture", () => {
    const seen: string[] = [];
    for (const expected of ["slash-commands", "wikilinks", "tags", null]) {
      localStorage.setItem("boojy_onboarding_seen", JSON.stringify(seen));
      const { result, unmount } = renderHook(() =>
        useOnboardingHints({ noteCount: 5, isEditorFocused: true }),
      );
      expect(result.current.activeHint?.id ?? null).toBe(expected);
      if (expected) seen.push(expected);
      unmount();
    }
  });
});
