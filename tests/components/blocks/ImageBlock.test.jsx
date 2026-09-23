/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

vi.mock("../../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#fff", muted: "#666" },
      BG: { elevated: "#2a2a2e", divider: "#444", surface: "#333" },
    },
  }),
}));

import ImageBlock from "../../../src/components/blocks/ImageBlock";

const props = {
  alt: "",
  width: 100,
  isSelected: false,
  accentColor: "#8FC1C6",
  onSelect: () => {},
  onLightbox: () => {},
  onDelete: () => {},
  onReplace: () => {},
  onCopyImage: () => {},
  onUpdateWidth: () => {},
};

afterEach(cleanup);

describe("ImageBlock", () => {
  it("draws the missing-image box when its picture fails to load", () => {
    const { container, getByText } = render(<ImageBlock {...props} src="gone.png" />);
    fireEvent.error(container.querySelector("img"));
    expect(getByText("Image not found: gone.png")).toBeTruthy();
  });

  it("loads a replacement picture after an error rather than staying broken", () => {
    const { container, rerender, queryByText } = render(<ImageBlock {...props} src="gone.png" />);
    fireEvent.error(container.querySelector("img"));

    rerender(<ImageBlock {...props} src="new.png" />);

    // Before: `errored` outlived the source it was about, so the box stayed.
    expect(queryByText(/Image not found/)).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(/new\.png$/);
  });
});
