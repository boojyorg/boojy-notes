/** @vitest-environment jsdom */
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    expect(css).toContain("--boojy-error-danger: #C62D2D");
    expect(css).not.toContain("undefined");
  });

  it("styles a desktop scrollbar", () => {
    const { container } = render(
      <ThemeProvider>
        <GlobalStyles />
      </ThemeProvider>,
    );
    expect(container.querySelector("style")?.textContent).toContain("::-webkit-scrollbar-thumb");
  });

  describe("on the phone", () => {
    afterEach(() => {
      vi.doUnmock("../../src/utils/platform");
      vi.resetModules();
    });

    // Android's own bar is drawn over the content while it scrolls; a styled
    // one would take a lane.
    it("styles no scrollbar, so Android draws its own", async () => {
      vi.resetModules();
      vi.doMock("../../src/utils/platform", async (actual) => ({
        ...(await actual<object>()),
        isPhone: true,
      }));
      const { default: PhoneStyles } = await import("../../src/components/GlobalStyles");
      const { ThemeProvider: Provider } = await import("../../src/context/ThemeContext");
      const { container } = render(
        <Provider>
          <PhoneStyles />
        </Provider>,
      );
      const css = container.querySelector("style")?.textContent;
      expect(css).toContain("--boojy-error-bg");
      expect(css).not.toMatch(/::-webkit-scrollbar(-thumb)? \{/);
    });
  });
});
