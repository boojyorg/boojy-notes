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
  displayWidth: null,
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

  it("is drawn at the file's pixel width, capped by the column", () => {
    const { container } = render(<ImageBlock {...props} src="shot.png" displayWidth={524} />);
    fireEvent.load(container.querySelector("img"));
    const img = container.querySelector("img");
    expect(img.style.width).toBe("524px");
    expect(img.style.maxWidth).toBe("100%");
    expect(img.parentElement.style.width).toBe("fit-content");
  });

  it("with no width, is drawn at the picture's own size once it has loaded, never stretched", () => {
    const { container } = render(<ImageBlock {...props} src="icon.png" />);
    const img = container.querySelector("img");
    const box = img.parentElement;
    // Loading: the placeholder holds the column.
    expect(box.style.width).toBe("100%");
    fireEvent.load(img);
    // Before: every image without a width was drawn 100% of the column.
    expect(box.style.width).toBe("fit-content");
    expect(img.style.width).toBe("auto");
    expect(img.style.maxWidth).toBe("100%");
  });
});
