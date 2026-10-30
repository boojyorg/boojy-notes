/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { drawAtom, drawInlineMath } from "../../src/utils/inlineMath";
import { inlineMarkdownToHtml, domNodeToMarkdown } from "../../src/utils/inlineFormatting";

// KaTeX loads on first use (`import("./katexRender")`), which a busy runner
// can take far longer than any fixed pause: each step waits for the drawing.
const drawn = (check: () => void) => vi.waitFor(check, { timeout: 5_000 });

describe("drawing inline formulas", () => {
  it("draws every formula under the root, and ones that arrive later, without changing the read-back", async () => {
    const root = document.createElement("div");
    root.innerHTML = `<p>${inlineMarkdownToHtml("a $x^2$ b")}</p>`;
    document.body.appendChild(root);
    const stop = drawInlineMath(root);
    const first = root.querySelector<HTMLElement>(".inline-math");
    await drawn(() => expect(first?.querySelector(".katex")).not.toBeNull());
    expect(first?.dataset.drawn).toBe("x^2");
    const later = document.createElement("p");
    later.innerHTML = inlineMarkdownToHtml("c $y$");
    root.appendChild(later);
    await drawn(() => expect(later.querySelector(".inline-math .katex")).not.toBeNull());
    expect(domNodeToMarkdown(root.firstElementChild as HTMLElement)).toBe("a $x^2$ b");
    stop();
    root.remove();
  });

  it("shows a formula KaTeX can't read as its source, and draws it once it can", async () => {
    const p = document.createElement("p");
    p.innerHTML = inlineMarkdownToHtml("$\\frac{a$");
    const atom = p.querySelector<HTMLElement>(".inline-math") as HTMLElement;
    drawAtom(atom);
    await drawn(() => expect(atom.classList.contains("inline-math-error")).toBe(true));
    expect(atom.textContent).toBe("$\\frac{a$");
    atom.setAttribute("data-math", "\\frac{a}{b}");
    drawAtom(atom);
    expect(atom.classList.contains("inline-math-error")).toBe(false);
    expect(atom.querySelector(".katex")).not.toBeNull();
  });
});
