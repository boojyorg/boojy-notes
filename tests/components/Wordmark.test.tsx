/** @vitest-environment jsdom */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const themeState = vi.hoisted(() => ({ isDark: false }));

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({ theme: {}, isDark: themeState.isDark }),
}));

import Wordmark from "../../src/components/Wordmark";

/**
 * The wordmark is two colours, the cyan N and "otes" in the theme's ink, so
 * each theme draws its own asset. Before this the black Light asset was drawn
 * in Dark too, where "otes" was near-black on the dark ground (review H11).
 */
describe("Wordmark", () => {
  afterEach(cleanup);

  it("draws the light asset in Light, at full opacity", () => {
    themeState.isDark = false;
    const { getByTestId } = render(<Wordmark height={18} />);
    const img = getByTestId("wordmark") as HTMLImageElement;
    expect(img.src).toMatch(/boojy-notes-wordmark-light\.png$/);
    expect(img.style.opacity).toBe("");
    expect(img.style.height).toBe("18px");
  });

  it("draws the dark asset in Dark", () => {
    themeState.isDark = true;
    const { getByTestId } = render(<Wordmark height={30} />);
    const img = getByTestId("wordmark") as HTMLImageElement;
    expect(img.src).toMatch(/boojy-notes-wordmark-dark\.png$/);
    expect(img.dataset.theme).toBe("dark");
  });
});
