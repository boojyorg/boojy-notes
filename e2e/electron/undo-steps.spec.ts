/**
 * Every undo step changes something. Enter (at a line's end or in its middle)
 * and Backspace joining two paragraphs are one keystroke and one undo entry:
 * each committed the line's text as typing and then the new or removed block
 * as a structural edit, two entries holding the same text, so after typing,
 * a pause, and Enter, one ⌘Z did nothing.
 */
import { expect, type Page, test } from "@playwright/test";
import { END_OF_LINE, SETTLE_MS, isMac, launchApp, sleep, waitForFile } from "./harness";

const MOD = isMac ? "Meta" : "Control";
const NOTE = "Undo.md";

/** Press ⌘Z once and wait for the file to settle; returns what it holds. */
async function undoOnce(h: Awaited<ReturnType<typeof launchApp>>) {
  await h.page.keyboard.press(`${MOD}+z`);
  await sleep(SETTLE_MS);
  return h.vault.read(NOTE);
}

async function typeAndSettle(h: Awaited<ReturnType<typeof launchApp>>, page: Page, text: string) {
  await page.keyboard.type(text);
  await waitForFile(h.vault.file(NOTE), (t) => t.includes(text.trim() || "\n\n"));
  await sleep(SETTLE_MS);
}

test("type, pause, Enter, type: each undo step changes the note", async () => {
  const h = await launchApp({ [NOTE]: "plain line\n" });
  try {
    await h.openNote("Undo");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await typeAndSettle(h, h.page, " more");
    await h.page.keyboard.press("Enter");
    await sleep(SETTLE_MS);
    await typeAndSettle(h, h.page, "next");
    expect(h.vault.read(NOTE)).toBe("plain line more\n\nnext\n");

    // "next", then the Enter, then " more": three entries, each a change.
    const steps = [await undoOnce(h), await undoOnce(h), await undoOnce(h)];
    expect(steps).toEqual(["plain line more\n\n", "plain line more\n", "plain line\n"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Enter in the middle of a line, and Backspace joining two, are one undo step each", async () => {
  const h = await launchApp({ [NOTE]: "first half second\n\nother\n" });
  try {
    await h.openNote("Undo");
    // Pause after a keystroke, so its typing group has closed before the Enter.
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await typeAndSettle(h, h.page, "!");
    await h.page.keyboard.press(END_OF_LINE);
    for (let i = 0; i < " second!".length; i++) await h.page.keyboard.press("ArrowLeft");
    await h.page.keyboard.press("Enter");
    await waitForFile(h.vault.file(NOTE), (t) => t.startsWith("first half\n\n"));
    await sleep(SETTLE_MS);
    expect(await undoOnce(h)).toBe("first half second!\n\nother\n");

    // Backspace at the start of "other" joins it to the line above.
    await h.page.locator("[data-block-id]", { hasText: "other" }).click();
    await h.page.keyboard.press(isMac ? "Meta+ArrowLeft" : "Home");
    await typeAndSettle(h, h.page, "x");
    await h.page.keyboard.press("ArrowLeft");
    await h.page.keyboard.press("Backspace");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("second!xother"));
    await sleep(SETTLE_MS);
    expect(await undoOnce(h)).toBe("first half second!\n\nxother\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
