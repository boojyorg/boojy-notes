/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { drawAtom, drawInlineMath } from "../../src/utils/inlineMath";
import { inlineMarkdownToHtml, domNodeToMarkdown } from "../../src/utils/inlineFormatting";

const settle = () => new Promise((r) => setTimeout(r, 50));

describe("drawing inline formulas", () => {
  it("draws every formula under the root, and ones that arrive later, without changing the read-back", async () => {
    const root = document.createElement("div");
    root.innerHTML = `<p>${inlineMarkdownToHtml("a $x^2$ b")}</p>`;
    document.body.appendChild(root);
    const stop = drawInlineMath(root);
    await settle();
    const first = root.querySelector<HTMLElement>(".inline-math");
    expect(first?.querySelector(".katex")).not.toBeNull();
    expect(first?.dataset.drawn).toBe("x^2");
    const later = document.createElement("p");
    later.innerHTML = inlineMarkdownToHtml("c $y$");
    root.appendChild(later);
    await settle();
    expect(later.querySelector(".inline-math .katex")).not.toBeNull();
    expect(domNodeToMarkdown(root.firstElementChild as HTMLElement)).toBe("a $x^2$ b");
    stop();
    root.remove();
  });

  it("shows a formula KaTeX can't read as its source, and draws it once it can", async () => {
    const p = document.createElement("p");
    p.innerHTML = inlineMarkdownToHtml("$\\frac{a$");
    const atom = p.querySelector<HTMLElement>(".inline-math") as HTMLElement;
    drawAtom(atom);
    await settle();
    expect(atom.classList.contains("inline-math-error")).toBe(true);
    expect(atom.textContent).toBe("$\\frac{a$");
    atom.setAttribute("data-math", "\\frac{a}{b}");
    drawAtom(atom);
    expect(atom.classList.contains("inline-math-error")).toBe(false);
    expect(atom.querySelector(".katex")).not.toBeNull();
  });
});
