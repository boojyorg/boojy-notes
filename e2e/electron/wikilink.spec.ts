/**
 * Link interaction correctness: completing a [[wikilink]] leaves the caret
 * outside the link, so what you type next is prose, never part of the link
 * or its alias; and hovering a link never throws, and never shows a tooltip
 * after the pointer has already left.
 *
 * Reproduces two review findings. After picking a suggestion, the next
 * keystrokes went inside the rendered link span and the Markdown on disk read
 * `[[Beta|Beta after]]`. The hover code stored the link's URL on the timer
 * handle, which is a number in Chromium, so every hover threw a TypeError in
 * strict mode; the timer it had already scheduled was never tracked, so
 * leaving the link could not cancel it and the tooltip appeared anyway.
 */
import { expect, test } from "@playwright/test";
import { END_OF_LINE, SETTLE_MS, launchApp, noteText, sleep, waitForFile } from "./harness";

test("typing after a completed wikilink continues outside the link", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n", "Beta.md": "Beta body.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" See [[Be");
    const menu = h.page.getByRole("listbox", { name: "Link suggestions" });
    await expect(menu.getByRole("option", { name: "Beta" })).toBeVisible();
    await h.page.keyboard.press("Enter");
    await expect(menu).toBeHidden();
    await h.page.keyboard.type(" after");

    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("after"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha body. See [[Beta]] after\n");
    expect(await noteText(h.page)).toBe("Alpha body. See Beta after");
    // The link is one span holding exactly its target; the typed text is not in it.
    expect(
      await h.page
        .locator("[data-block-id] .wikilink")
        .evaluateAll((els) => els.map((e) => [e.textContent, e.getAttribute("data-target")])),
    ).toEqual([["Beta", "Beta"]]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("hovering a link never throws, and no tooltip appears once the pointer has left", async () => {
  const h = await launchApp({ "Alpha.md": "Visit [[Beta]] now.\n", "Beta.md": "Beta body.\n" });
  try {
    await h.openNote("Alpha");
    const link = h.page.locator("[data-block-id] .wikilink").first();
    const tooltip = h.page.getByText("[[Beta]]", { exact: true });

    // Brush across the link and leave well inside the 500ms hover delay.
    await link.hover();
    await sleep(150);
    await h.page.mouse.move(5, 5);
    await sleep(900);
    await expect(tooltip).toHaveCount(0);

    // Resting on the link does show it; leaving hides it.
    await link.hover();
    await expect(tooltip).toBeVisible({ timeout: 2_000 });
    await h.page.mouse.move(5, 5);
    await expect(tooltip).toHaveCount(0);

    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
