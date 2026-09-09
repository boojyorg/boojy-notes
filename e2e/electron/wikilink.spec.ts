/**
 * Link interaction correctness: completing a [[wikilink]] leaves the caret
 * outside the link, so what you type next is prose, never part of the link
 * or its alias; a caret the browser itself put at the end of a link (End, a
 * click, the arrow keys) types outside it too, while a caret inside the link
 * still edits its alias; and hovering a link never throws, and never shows a
 * tooltip after the pointer has already left.
 *
 * Reproduces two review findings. After picking a suggestion, the next
 * keystrokes went inside the rendered link span and the Markdown on disk read
 * `[[Beta|Beta after]]`. The hover code stored the link's URL on the timer
 * handle, which is a number in Chromium, so every hover threw a TypeError in
 * strict mode; the timer it had already scheduled was never tracked, so
 * leaving the link could not cancel it and the tooltip appeared anyway.
 */
import { expect, test } from "@playwright/test";
import {
  type AppHandle,
  END_OF_LINE,
  SETTLE_MS,
  START_OF_LINE,
  launchApp,
  noteText,
  sleep,
  waitForFile,
} from "./harness";

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

/**
 * The caret Chromium places by itself. End, a click at the end of the line
 * and a click at a link's right edge all land the caret at the last offset of
 * the link's own text node, inside the span, so what was typed next became
 * the link's alias: `See [[Welcome]]` + End + ` after` was written to disk as
 * `See [[Welcome|Welcome after]]`. PR #101's anchor only covered carets the
 * editor placed itself. The rule is now applied at the moment text is about
 * to be inserted, wherever the caret came from.
 */
test("End on a line ending in a wikilink, then typing, continues outside the link", async () => {
  const h = await launchApp({ "Alpha.md": "See [[Welcome]]\n", "Welcome.md": "Hi\n" });
  try {
    await h.openNote("Alpha");
    const block = h.page.locator("[data-block-id]").first();
    const box = await block.boundingBox();
    if (!box) throw new Error("block not visible");
    await h.page.mouse.click(box.x + 10, box.y + box.height / 2);
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" after");

    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("after"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("See [[Welcome]] after\n");
    expect(await noteText(h.page)).toBe("See Welcome after");
    expect(await wikilinkSpans(h.page)).toEqual([["Welcome", "Welcome"]]);
    expect(h.pageErrors).toEqual([]);

    // Still the same note after a restart: the file was the truth all along.
    await h.restart();
    await h.openNote("Alpha");
    expect(h.vault.read("Alpha.md")).toBe("See [[Welcome]] after\n");
    expect(await noteText(h.page)).toBe("See Welcome after");
    expect(await wikilinkSpans(h.page)).toEqual([["Welcome", "Welcome"]]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("clicking at the right edge of a wikilink, then typing, continues outside the link", async () => {
  const h = await launchApp({
    "Alpha.md": "See [[Welcome]]\n",
    "Mid.md": "See [[Welcome]] now\n",
    "Welcome.md": "Hi\n",
  });
  try {
    // A click past the end of a line that ends in a link.
    await h.openNote("Alpha");
    const block = h.page.locator("[data-block-id]").first();
    const box = await block.boundingBox();
    if (!box) throw new Error("block not visible");
    await h.page.mouse.click(box.x + box.width - 10, box.y + box.height / 2);
    await h.page.keyboard.type(" after");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("after"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("See [[Welcome]] after\n");
    expect(await wikilinkSpans(h.page)).toEqual([["Welcome", "Welcome"]]);

    // A click on the seam between a link and the text that follows it.
    await h.openNote("Mid");
    const link = h.page.locator("[data-block-id] .wikilink").first();
    const edge = await link.boundingBox();
    if (!edge) throw new Error("link not visible");
    await h.page.mouse.click(edge.x + edge.width + 1, edge.y + edge.height / 2);
    await h.page.keyboard.type("!");
    await waitForFile(h.vault.file("Mid.md"), (t) => t.includes("!"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Mid.md")).toBe("See [[Welcome]]! now\n");
    expect(await noteText(h.page)).toBe("See Welcome! now");
    expect(await wikilinkSpans(h.page)).toEqual([["Welcome", "Welcome"]]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("typing inside a wikilink still edits its alias", async () => {
  const h = await launchApp({ "Alpha.md": "See [[Welcome]] now\n", "Welcome.md": "Hi\n" });
  try {
    await h.openNote("Alpha");
    const block = h.page.locator("[data-block-id]").first();
    const box = await block.boundingBox();
    if (!box) throw new Error("block not visible");
    await h.page.mouse.click(box.x + 10, box.y + box.height / 2);
    await h.page.keyboard.press(END_OF_LINE);
    // " now" is four characters; two more steps put the caret between "Welco" and "me".
    for (let i = 0; i < 6; i++) await h.page.keyboard.press("ArrowLeft");
    await h.page.keyboard.type("X");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("X"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("See [[Welcome|WelcoXme]] now\n");
    expect(await wikilinkSpans(h.page)).toEqual([["WelcoXme", "Welcome"]]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

/**
 * The mirror at the link's start (review 2026-09-07, §3.7). Home, or a
 * click at a link's left edge, leaves Chromium's caret at offset 0 of the
 * link's own text node when nothing precedes the link, and the editor's own
 * caret placement at offset 0 (Enter from the title, arriving by arrow key)
 * set the range on the block's first child, the link span itself. Typing `Y`
 * then wrote `[[Review note|YReview note]]`. The rule at the end of a link
 * now holds at its start too: text typed there is prose before the link.
 */
test("Home on a line starting with a wikilink, then typing, continues outside the link", async () => {
  const h = await launchApp({ "Alpha.md": "[[Welcome]] first\n", "Welcome.md": "Hi\n" });
  try {
    await h.openNote("Alpha");
    const block = h.page.locator("[data-block-id]").first();
    const box = await block.boundingBox();
    if (!box) throw new Error("block not visible");
    await h.page.mouse.click(box.x + box.width - 10, box.y + box.height / 2);
    await h.page.keyboard.press(START_OF_LINE);
    await h.page.keyboard.type("Y");

    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("Y"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Y[[Welcome]] first\n");
    expect(await noteText(h.page)).toBe("YWelcome first");
    expect(await wikilinkSpans(h.page)).toEqual([["Welcome", "Welcome"]]);

    // One step into the link, and typing edits the alias as before.
    await h.page.keyboard.press("ArrowRight");
    await h.page.keyboard.type("X");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("X"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Y[[Welcome|WXelcome]] first\n");
    expect(await wikilinkSpans(h.page)).toEqual([["WXelcome", "Welcome"]]);
    expect(h.pageErrors).toEqual([]);

    await h.restart();
    await h.openNote("Alpha");
    expect(await noteText(h.page)).toBe("YWXelcome first");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Enter from the title into a block starting with a wikilink, then typing, continues outside the link", async () => {
  const h = await launchApp({ "Alpha.md": "[[Welcome]] first\n", "Welcome.md": "Hi\n" });
  try {
    await h.openNote("Alpha");
    // The editor places this caret itself, at offset 0 of the first block.
    await h.page.getByRole("textbox", { name: "Note title" }).click();
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.type("Y");

    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("Y"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Y[[Welcome]] first\n");
    expect(await noteText(h.page)).toBe("YWelcome first");
    expect(await wikilinkSpans(h.page)).toEqual([["Welcome", "Welcome"]]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

/** Every wikilink span on the page as [visible text, target]. */
function wikilinkSpans(page: AppHandle["page"]) {
  return page
    .locator("[data-block-id] .wikilink")
    .evaluateAll((els) => els.map((e) => [e.textContent, e.getAttribute("data-target")]));
}
