/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { useRef } from "react";
import BlockDragHandle, { HANDLE_W, HANDLE_GAP } from "../../src/components/BlockDragHandle";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: { TEXT: { muted: "#777", primary: "#111" }, BG: { surface: "#f4f4f5" } },
  }),
}));

/**
 * A stand-in for the note column: a padded wrapper (the gutter), an editor
 * root with block roots as direct children, and the handle beside it. jsdom
 * has no layout, so each element gets a hand-set rect.
 */
const COLUMN = { left: 100, top: 0 };
const BLOCK_LEFT = 156; // column left + 56px gutter
const blockRects = {
  b1: { top: 40, height: 30 },
  b2: { top: 80, height: 51 }, // two-line paragraph
  b3: { top: 140, height: 30 },
};

function rect(left, top, width, height) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
}

function Harness({ blocks, startHandleDrag }) {
  const columnRef = useRef(null);
  const editorRef = useRef(null);
  return (
    <div ref={columnRef} data-testid="column" style={{ position: "relative" }}>
      <div ref={editorRef} contentEditable suppressContentEditableWarning>
        {blocks.map((id) => (
          <p key={id} data-block-id={id}>
            {id} text
          </p>
        ))}
      </div>
      <BlockDragHandle
        columnRef={columnRef}
        editorRef={editorRef}
        startHandleDrag={startHandleDrag}
      />
    </div>
  );
}

function layOut() {
  // The anchor (0×0 at the column's origin) and every block get real-looking rects.
  for (const p of document.querySelectorAll("[data-block-id]")) {
    const r = blockRects[p.dataset.blockId];
    p.getBoundingClientRect = () => rect(BLOCK_LEFT, r.top, 500, r.height);
  }
  const anchor = document.querySelector('[aria-hidden="true"][style*="width: 0px"]');
  anchor.getBoundingClientRect = () => rect(COLUMN.left, COLUMN.top, 0, 0);
}

async function hoverAt(clientY) {
  await act(async () => {
    fireEvent.mouseMove(screen.getByTestId("column"), { clientX: 300, clientY });
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("BlockDragHandle", () => {
  beforeEach(() => {
    document.body.className = "";
  });
  afterEach(() => {
    cleanup();
    document.body.className = "";
  });

  it("renders nothing at rest — the editor is a document until hovered", () => {
    render(<Harness blocks={["b1", "b2", "b3"]} startHandleDrag={vi.fn()} />);
    expect(screen.queryByTestId("block-drag-handle")).toBe(null);
  });

  it("appears in the gutter beside the hovered block, aligned to its first line", async () => {
    render(<Harness blocks={["b1", "b2", "b3"]} startHandleDrag={vi.fn()} />);
    layOut();
    await hoverAt(90); // inside b2's band
    const handle = screen.getByTestId("block-drag-handle");
    expect(handle.dataset.targetBlock).toBe("b2");
    // Left of the block's left edge by the handle's width plus the gap: in the
    // gutter, never over the prose.
    const left = parseFloat(handle.style.left);
    expect(left).toBe(BLOCK_LEFT - COLUMN.left - HANDLE_W - HANDLE_GAP);
    expect(left + HANDLE_W).toBeLessThan(BLOCK_LEFT - COLUMN.left);
    // Vertically inside the block's first line, not centred on the whole
    // two-line paragraph (that would be ~93.5).
    const top = parseFloat(handle.style.top);
    expect(top).toBeGreaterThanOrEqual(blockRects.b2.top);
    expect(top).toBeLessThan(blockRects.b2.top + 20);
    expect(handle.getAttribute("aria-hidden")).toBe("true");
    expect(handle.querySelector("svg.lucide-grip-vertical")).not.toBe(null);
  });

  it("the gap between two blocks belongs to the block above", async () => {
    render(<Harness blocks={["b1", "b2", "b3"]} startHandleDrag={vi.fn()} />);
    layOut();
    await hoverAt(75); // b1 ends at 70, b2 starts at 80
    expect(screen.getByTestId("block-drag-handle").dataset.targetBlock).toBe("b1");
  });

  it("does not appear when there is only one block (nothing to reorder)", async () => {
    render(<Harness blocks={["b1"]} startHandleDrag={vi.fn()} />);
    layOut();
    await hoverAt(50);
    expect(screen.queryByTestId("block-drag-handle")).toBe(null);
  });

  it("hides as soon as a key is pressed", async () => {
    render(<Harness blocks={["b1", "b2", "b3"]} startHandleDrag={vi.fn()} />);
    layOut();
    await hoverAt(50);
    expect(screen.getByTestId("block-drag-handle")).toBeTruthy();
    act(() => {
      fireEvent.keyDown(document.querySelector("[data-block-id='b1']"), { key: "a" });
    });
    expect(screen.queryByTestId("block-drag-handle")).toBe(null);
  });

  it("hides when the pointer leaves the column", async () => {
    render(<Harness blocks={["b1", "b2", "b3"]} startHandleDrag={vi.fn()} />);
    layOut();
    await hoverAt(50);
    act(() => {
      fireEvent.mouseLeave(screen.getByTestId("column"), { relatedTarget: null });
    });
    expect(screen.queryByTestId("block-drag-handle")).toBe(null);
  });

  it("stays hidden while a drag is live", async () => {
    render(<Harness blocks={["b1", "b2", "b3"]} startHandleDrag={vi.fn()} />);
    layOut();
    document.body.classList.add("block-dragging");
    await hoverAt(50);
    expect(screen.queryByTestId("block-drag-handle")).toBe(null);
  });

  it("pressing the grip hands the hovered block to startHandleDrag", async () => {
    const startHandleDrag = vi.fn();
    render(<Harness blocks={["b1", "b2", "b3"]} startHandleDrag={startHandleDrag} />);
    layOut();
    await hoverAt(150);
    const handle = screen.getByTestId("block-drag-handle");
    act(() => {
      fireEvent.pointerDown(handle, { button: 0, clientX: 130, clientY: 150 });
    });
    expect(startHandleDrag).toHaveBeenCalledTimes(1);
    expect(startHandleDrag.mock.calls[0][0]).toBe("b3");
  });

  it("is a pointer-only affordance: not focusable, hidden from the tree", async () => {
    render(<Harness blocks={["b1", "b2", "b3"]} startHandleDrag={vi.fn()} />);
    layOut();
    await hoverAt(50);
    const handle = screen.getByTestId("block-drag-handle");
    expect(handle.getAttribute("tabindex")).toBe(null);
    expect(handle.getAttribute("role")).toBe(null);
  });
});
