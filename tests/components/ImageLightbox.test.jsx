/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

import ImageLightbox from "../../src/components/ImageLightbox.jsx";

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("ImageLightbox", () => {
  it("renders nothing when src is falsy", () => {
    const { container } = render(<ImageLightbox src="" alt="test" onClose={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders image with correct src and alt", () => {
    const { getByAltText } = render(
      <ImageLightbox src="https://example.com/img.png" alt="My Image" onClose={vi.fn()} />,
    );
    const img = getByAltText("My Image");
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toBe("https://example.com/img.png");
  });

  it("calls onClose when clicking the backdrop", () => {
    const onClose = vi.fn();
    const { getByAltText } = render(
      <ImageLightbox src="https://example.com/img.png" alt="Photo" onClose={onClose} />,
    );
    // Click the backdrop (parent div of the img)
    const backdrop = getByAltText("Photo").parentElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(<ImageLightbox src="https://example.com/img.png" alt="Photo" onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
