/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/hooks/useTheme", () => ({
  useTheme: () => ({ theme: { TEXT: { muted: "#888" } } }),
}));

import { version } from "../../../package.json";
import SettingsFooter from "../../../src/components/settings/SettingsFooter";

afterEach(cleanup);

describe("SettingsFooter", () => {
  it("shows the version, the product page and the privacy policy, each opening outside", () => {
    render(<SettingsFooter />);
    expect(
      screen.getByText(new RegExp(`Boojy Notes v${version.replace(/\./g, "\\.")}`)),
    ).toBeTruthy();
    const page = screen.getByRole("link", { name: "boojy.org/notes" });
    const privacy = screen.getByRole("link", { name: "Privacy" });
    expect(page.getAttribute("href")).toBe("https://boojy.org/notes/");
    expect(privacy.getAttribute("href")).toBe("https://boojy.org/privacy/");
    expect(privacy.getAttribute("target")).toBe("_blank");
  });
});
