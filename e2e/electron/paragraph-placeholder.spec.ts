/**
 * "Type / for commands..." shows in a note's first paragraph only while it
 * holds no text. An empty paragraph is one <br>, and so is a paragraph with
 * one soft break, so a CSS rule on the <br> drew the placeholder under
 * `line one ⇧↵ line two` (2026-09-26, and the 2026-09-24 overlap report).
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { launchApp } from "./harness";

const placeholder = (page: Page) =>
  page.evaluate(() => {
    const p = document.querySelector("[data-block-id]");
    return p ? getComputedStyle(p, "::before").content : "no block";
  });

test("a first paragraph with one soft break shows no placeholder", async () => {
  const h = await launchApp({
    "Soft.md": "Line one\nLine two\n",
    "Plain.md": "Just one line\n",
    "Blank.md": "",
  });
  try {
    await h.openNote("Soft");
    expect(await placeholder(h.page)).toBe("none");
    await h.openNote("Plain");
    expect(await placeholder(h.page)).toBe("none");
    await h.openNote("Blank");
    expect(await placeholder(h.page)).toBe('"Type / for commands..."');
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the placeholder goes on the first keystroke and comes back when the text is gone", async () => {
  const h = await launchApp({ "Blank.md": "" });
  try {
    await h.openNote("Blank");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.type("a");
    expect(await placeholder(h.page)).toBe("none");
    await h.page.keyboard.press("Shift+Enter");
    await h.page.keyboard.type("b");
    expect(await placeholder(h.page)).toBe("none");
    for (let i = 0; i < 3; i++) await h.page.keyboard.press("Backspace");
    await expect.poll(() => placeholder(h.page)).toBe('"Type / for commands..."');
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the placeholder shows only while the note is one empty line: a line below ends it", async () => {
  const h = await launchApp({ "Blank.md": "" });
  try {
    await h.openNote("Blank");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.type("on line two");
    expect(await placeholder(h.page)).toBe("none");
    // Back to one empty line, the placeholder returns.
    await h.page.keyboard.press(`${process.platform === "darwin" ? "Meta" : "Control"}+a`);
    await h.page.keyboard.press("Backspace");
    await h.page.keyboard.press("Backspace");
    await expect.poll(() => h.page.locator("[data-block-id]").count()).toBe(1);
    await expect.poll(() => placeholder(h.page)).toBe('"Type / for commands..."');
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
