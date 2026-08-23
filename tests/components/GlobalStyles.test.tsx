/** @vitest-environment jsdom */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import GlobalStyles from "../../src/components/GlobalStyles";
import { ThemeProvider } from "../../src/context/ThemeContext";

describe("GlobalStyles", () => {
  beforeEach(() => localStorage.clear());

  it("gives error boundaries valid tokens from the active theme", () => {
    const { container } = render(
      <ThemeProvider>
        <GlobalStyles />
      </ThemeProvider>,
    );

    const css = container.querySelector("style")?.textContent;
    expect(css).toContain("--boojy-error-bg: #FCFCFC");
    expect(css).toContain("--boojy-error-danger: #D43030");
    expect(css).not.toContain("undefined");
    expect(css).not.toMatch(/syncGlow|syncDotPulse|tabSlide|\.tab-btn/);
  });
});
