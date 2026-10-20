/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { showStartupFailure } from "../../src/phone/startupFailure";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("a phone start that fails", () => {
  it("says why in the app's place and offers to try again, never a blank page", () => {
    const retry = vi.fn();
    showStartupFailure(new Error("disk unavailable"), retry);
    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Boojy Notes couldn't start: disk unavailable");
    alert?.querySelector("button")?.click();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
