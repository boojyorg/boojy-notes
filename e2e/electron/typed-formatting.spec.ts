/**
 * Typed inline formatting: the closing marker of `**bold**` (and `*italic*`,
 * `` `code` ``, `~~strike~~`, `==highlight==`, `***both***`, `_italic_`,
 * `__bold__`) turns the run into its element on screen the moment it is
 * typed, the caret lands after the element so the next character is prose,
 * and the file holds exactly the Markdown that was typed (the underscore
 * forms in the star form the app writes). Prose that merely contains the
 * markers (`2 * 3 * 4`, `a ** b`, `snake_case_name`, an escaped `\*`) is
 * left as typed. Cmd+Z after a conversion is the ordinary typing undo.
 *
 * Needs the real app: the caret placement after the new element is what
 * Chromium does with a caret at the end of a `<strong>`, which jsdom never
 * canonicalises, and the trigger reads the native InputEvent behind React's.
 */
import { expect, test } from "@playwright/test";
import {
  type AppHandle,
  END_OF_LINE,
  MOD,
  SETTLE_MS,
  launchApp,
  noteText,
  sleep,
  waitForFile,
} from "./harness";

const NOTE = "Draft.md";
const ORIGINAL = "The";

let h: AppHandle;

test.beforeEach(async () => {
  h = await launchApp({ [NOTE]: `${ORIGINAL}\n` });
  await h.openNote("Draft");
  await h.page.locator("[data-block-id]").first().click();
  await h.page.keyboard.press(END_OF_LINE);
});

test.afterEach(async () => {
  await h?.close();
});

/** The tags inside the first block, in order, with their text. */
const inlineTags = (page: AppHandle["page"]) =>
  page
    .locator("[data-block-id]")
    .first()
    .evaluate((el) =>
      Array.from(el.querySelectorAll("strong, em, code, del, mark")).map((n) => [
        n.tagName.toLowerCase(),
        n.textContent,
      ]),
    );

test("typing **bold** turns bold on the closing star, and what follows is prose", async () => {
  await h.page.keyboard.type(" **quick**");
  // The run is an element the moment the second closing star lands.
  await expect(h.page.locator("[data-block-id] strong")).toHaveText("quick");
  await h.page.keyboard.type(" brown");
  expect(await inlineTags(h.page)).toEqual([["strong", "quick"]]);
  expect(await noteText(h.page)).toBe("The quick brown");

  await waitForFile(h.vault.file(NOTE), (t) => t.includes("brown"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("The **quick** brown\n");
  expect(h.pageErrors).toEqual([]);
});

test("each marker converts on its closer and is saved as typed", async () => {
  await h.page.keyboard.type(" *it* `code` ~~old~~ ==key== ***both*** end");
  expect(await inlineTags(h.page)).toEqual([
    ["em", "it"],
    ["code", "code"],
    ["del", "old"],
    ["mark", "key"],
    ["strong", "both"],
    ["em", "both"],
  ]);
  expect(await noteText(h.page)).toBe("The it code old key both end");

  await waitForFile(h.vault.file(NOTE), (t) => t.includes("end"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("The *it* `code` ~~old~~ ==key== ***both*** end\n");
  expect(h.pageErrors).toEqual([]);
});

test("the underscore forms convert and are saved in the star form", async () => {
  await h.page.keyboard.type(" _it_ and __bo__ end");
  expect(await inlineTags(h.page)).toEqual([
    ["em", "it"],
    ["strong", "bo"],
  ]);
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("end"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("The *it* and **bo** end\n");
  expect(h.pageErrors).toEqual([]);
});

test("prose that merely holds the markers is left as typed", async () => {
  await h.page.keyboard.type(" 2 * 3 * 4, a ** b, snake_case_name, \\*no\\* end");
  expect(await inlineTags(h.page)).toEqual([]);
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("end"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("The 2 * 3 * 4, a ** b, snake_case_name, \\*no\\* end\n");
  expect(h.pageErrors).toEqual([]);
});

test("a run closed in the middle of a line keeps the text after it", async () => {
  await h.page.keyboard.type(" end");
  // Back to just after "The", then type the run in the middle.
  for (let i = 0; i < 4; i++) await h.page.keyboard.press("ArrowLeft");
  await h.page.keyboard.type(" **mid**");
  await expect(h.page.locator("[data-block-id] strong")).toHaveText("mid");
  await h.page.keyboard.type(" then");
  expect(await noteText(h.page)).toBe("The mid then end");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("then"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("The **mid** then end\n");
  expect(h.pageErrors).toEqual([]);
});

test("Backspace after a conversion deletes into the bold rather than converting again", async () => {
  await h.page.keyboard.type(" **bold**");
  await expect(h.page.locator("[data-block-id] strong")).toHaveText("bold");
  // The first Backspace takes the invisible anchor, the second the last letter.
  await h.page.keyboard.press("Backspace");
  await h.page.keyboard.press("Backspace");
  await expect(h.page.locator("[data-block-id] strong")).toHaveText("bol");
  expect(await noteText(h.page)).toBe("The bol");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("**bol**"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("The **bol**\n");
  expect(h.pageErrors).toEqual([]);
});

test("Cmd+Z after a conversion is the ordinary typing undo", async () => {
  await h.page.keyboard.type(" **bold**");
  await expect(h.page.locator("[data-block-id] strong")).toHaveText("bold");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("**bold**"));
  await sleep(SETTLE_MS);

  await h.page.keyboard.press(`${MOD}+z`);
  await waitForFile(h.vault.file(NOTE), (t) => !t.includes("bold"));
  expect(await noteText(h.page)).toBe(ORIGINAL);
  expect(await inlineTags(h.page)).toEqual([]);
  expect(h.pageErrors).toEqual([]);
});

test("a converted run is still its element after a restart", async () => {
  await h.page.keyboard.type(" **kept** on");
  await waitForFile(h.vault.file(NOTE), (t) => t.includes(" on"));
  await sleep(SETTLE_MS);
  await h.restart();
  await h.openNote("Draft");
  expect(await inlineTags(h.page)).toEqual([["strong", "kept"]]);
  expect(h.vault.read(NOTE)).toBe("The **kept** on\n");
  expect(h.pageErrors).toEqual([]);
});
