/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      lightbox: { scrim: "rgba(0,0,0,0.88)", ink: "#F4F4F5", hover: "rgba(255,255,255,0.12)" },
    },
  }),
}));

import ImageLightbox from "../../src/components/ImageLightbox";

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
    // Click the dark room around the picture
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

  it("names the file above the picture and closes from its close button", () => {
    const onClose = vi.fn();
    const { getByTestId, getByRole } = render(
      <ImageLightbox
        src="boojy-att://vault/x.png"
        name="Captura de pantalla.png"
        onClose={onClose}
      />,
    );
    expect(getByTestId("lightbox-name").textContent).toBe("Captura de pantalla.png");
    expect(getByRole("dialog").getAttribute("aria-label")).toBe("Image: Captura de pantalla.png");
    fireEvent.click(getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a click on the picture itself keeps it open", () => {
    const onClose = vi.fn();
    const { getByAltText } = render(
      <ImageLightbox src="https://example.com/img.png" alt="Photo" onClose={onClose} />,
    );
    fireEvent.click(getByAltText("Photo"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("rests focus on the view, not the close button, so a pointer-opened view shows no ring", async () => {
    const { getByRole } = render(
      <ImageLightbox src="https://example.com/img.png" name="img.png" onClose={vi.fn()} />,
    );
    // The trap places focus a frame after the view opens.
    await new Promise((r) => requestAnimationFrame(r));
    expect(document.activeElement).toBe(getByRole("dialog"));
  });
});
