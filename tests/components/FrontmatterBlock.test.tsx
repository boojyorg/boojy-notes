/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FrontmatterBlock from "../../src/components/FrontmatterBlock";
import type { Block } from "../../src/types/notes";

const block = { id: "f", type: "frontmatter", text: "tags: [uni]" } as Block;

beforeEach(() => {
  vi.useFakeTimers();
  // Motion on: closing shrinks the body away before it goes.
  window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FrontmatterBlock", () => {
  // jsdom, like a window mid-resize, fires no `transitionend`: the body must
  // still go, or Find keeps meeting the hidden YAML.
  it("unmounts a closed body once its shrink has had its time, transitionend or not", () => {
    const { container } = render(<FrontmatterBlock block={block} />);
    const header = container.querySelector(".frontmatter-header") as HTMLElement;
    fireEvent.click(header);
    expect(container.querySelector(".frontmatter-body")?.textContent).toBe("tags: [uni]");

    fireEvent.click(header);
    expect(container.querySelector(".frontmatter-reveal")?.hasAttribute("inert")).toBe(true);
    act(() => vi.advanceTimersByTime(1000));

    expect(container.querySelector(".frontmatter-body")).toBeNull();
  });
});
