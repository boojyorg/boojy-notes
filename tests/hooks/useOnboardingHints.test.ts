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
      useOnboardingHints({ noteCount: 5, isMobile: false, isEditorFocused: true }),
    );

    expect(result.current.activeHint).toBeNull();
  });
});
