/**
 * The sidebar toggle is one slide, not four things on four clocks
 * (2026-09-14). Measured before this pass: the wrapper's width tweened to 0
 * with the column laid out inside it every frame (the New note pill shrank
 * from 234px to 16), the chrome row snapped while the panel eased, and the
 * note's name jumped to its new start and slid back. The column is now its
 * full width and slides out under the window's edge, so nothing inside it
 * reflows, and the history pair and the name move on the panel's clock.
 *
 * The clip-not-squash contract is checked at rest, where it is deterministic:
 * hidden, the column keeps its width and everything in it its size. The
 * timing itself is CSS and is not sampled here.
 */
import { expect, test } from "@playwright/test";
import { launchApp } from "./harness";

test("hiding the sidebar clips its column rather than re-laying it out", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    await h.openNote("Alpha");
    const newNote = h.page.getByRole("button", { name: "New note" }).first();
    const row = h.page.locator("[data-note-id]").first();
    const widths = () =>
      h.page.evaluate(() => {
        const pill = document.querySelector(".sidebar-action-row") as HTMLElement;
        const column = pill.closest(".panel-motion") as HTMLElement;
        const wrapper = column.parentElement as HTMLElement;
        return {
          pill: Math.round(pill.getBoundingClientRect().width),
          column: Math.round(column.getBoundingClientRect().width),
          wrapper: Math.round(wrapper.getBoundingClientRect().width),
          transform: getComputedStyle(column).transform,
        };
      });
    const open = await widths();
    expect(open.wrapper).toBeGreaterThan(0);
    expect(open.column).toBe(open.wrapper);
    expect(open.transform).toBe("none");

    await h.page.getByTitle("Hide sidebar").click();
    // Hidden means hidden: once the slide ends the column is
    // `visibility: hidden`, so its rows are neither visible nor focusable.
    await expect(row).toBeHidden();
    await expect.poll(async () => (await widths()).wrapper).toBe(0);
    expect(
      await h.page.evaluate(
        () =>
          getComputedStyle(document.querySelector(".sidebar-action-row")!.closest(".panel-motion")!)
            .visibility,
      ),
    ).toBe("hidden");
    const hidden = await widths();
    // The column and the pill are the size they were: clipped, never squashed.
    expect(hidden.column).toBe(open.column);
    expect(hidden.pill).toBe(open.pill);
    expect(hidden.transform).not.toBe("none");

    // The history pair sits past the trio, one group-gap on, at rest.
    const trioRight = await h.page.getByTitle("New note").boundingBox();
    const undo = await h.page.getByTitle("Undo").boundingBox();
    expect(undo!.x - (trioRight!.x + trioRight!.width)).toBe(12);

    await h.page.getByTitle("Show sidebar").click();
    await expect(row).toBeVisible();
    await expect(newNote).toBeVisible();
    await expect.poll(async () => (await widths()).wrapper).toBe(open.wrapper);
    expect((await widths()).transform).toBe("none");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
