/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { gutterBlockAt } from "../../src/utils/gutterSelect";

/** jsdom lays nothing out: each element gets the rect it is given. */
function rect(el: Element, left: number, top: number, width: number, height: number) {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;
}

function mount() {
  document.body.innerHTML = `
    <div id="ed">
      <p data-block-id="p" data-block-type="p">A paragraph</p>
      <div data-block-id="b" data-block-type="bullet"><span data-marker></span><span id="bt">item</span></div>
      <div data-block-id="c" data-block-type="checkbox"><div class="checkbox-hit"></div><span id="ct">task</span></div>
      <div data-block-id="t" data-block-type="table"></div>
    </div>`;
  const $ = (s: string) => document.querySelector(s) as HTMLElement;
  rect($('[data-block-id="p"]'), 100, 0, 500, 30);
  rect($('[data-block-id="b"]'), 100, 30, 500, 30);
  rect($("#bt"), 118, 30, 480, 30);
  rect($('[data-block-id="c"]'), 100, 60, 500, 30);
  rect($(".checkbox-hit"), 104, 64, 16, 16);
  rect($("#ct"), 128, 60, 470, 30);
  rect($('[data-block-id="t"]'), 100, 90, 500, 60);
  const p = $('[data-block-id="p"]');
  return { ed: $("#ed"), roots: { p, b: $("#bt"), c: $("#ct"), t: $('[data-block-id="t"]') } };
}

describe("gutterBlockAt", () => {
  it("a paragraph's strip is the gap left of its first letter", () => {
    const { ed, roots } = mount();
    expect(gutterBlockAt(ed, roots, 95, 10, 8)).toBe("p");
    expect(gutterBlockAt(ed, roots, 101, 10, 8)).toBeNull();
    expect(gutterBlockAt(ed, roots, 80, 10, 8)).toBeNull();
  });

  it("a list item's strip runs up to its text, over its dot", () => {
    const { ed, roots } = mount();
    expect(gutterBlockAt(ed, roots, 110, 40, 8)).toBe("b");
    expect(gutterBlockAt(ed, roots, 120, 40, 8)).toBeNull();
  });

  it("a to-do's strip stops at its box, which keeps its tick", () => {
    const { ed, roots } = mount();
    expect(gutterBlockAt(ed, roots, 101, 70, 8)).toBe("c");
    expect(gutterBlockAt(ed, roots, 108, 70, 8)).toBeNull();
  });

  it("a table has no strip; its edge is its row grips'", () => {
    const { ed, roots } = mount();
    expect(gutterBlockAt(ed, roots, 95, 100, 8)).toBeNull();
  });
});
