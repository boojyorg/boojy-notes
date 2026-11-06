/**
 * A `%%…%%` comment within one block is drawn muted and literal: its markers
 * stay, nothing inside is drawn (no bold, link, pill or code), and its bytes
 * are the file's however the line around it is edited. The grey follows the
 * markers as they are typed or removed, the caret kept; formatting does not
 * act in one; a comment across blocks stays plain text (not drawn yet).
 */
import { expect, type Page, test } from "@playwright/test";
import {
  type AppHandle,
  END_OF_LINE,
  isMac,
  launchApp,
  SETTLE_MS,
  START_OF_LINE,
  sleep,
  waitForFile,
} from "./harness";

const MOD = isMac ? "Meta" : "Control";
const UNDO = `${MOD}+z`;
let h: AppHandle;

test.afterEach(async () => {
  await h?.close();
});

async function open(file: string) {
  h = await launchApp({ "C.md": file });
  await h.openNote("C");
  return h.page.locator("[data-editor] > [data-block-id]");
}
const comments = (page: Page) => page.locator("[data-editor] .md-comment");
const file = () => h.vault.read("C.md");

test("a comment is drawn muted and literal; its link and tag do nothing on a click", async () => {
  const md = "Seen. %%**raw** [[Other]] #todo `c` \\*%% after\n";
  const blocks = await open(md);
  await expect(comments(h.page)).toHaveText(["%%**raw** [[Other]] #todo `c` \\*%%"]);
  const c = comments(h.page).first();
  await expect(c.locator("strong, .wikilink, .inline-tag, code")).toHaveCount(0);
  const ink = await c.evaluate((el) => getComputedStyle(el).color);
  const prose = await blocks.first().evaluate((el) => getComputedStyle(el).color);
  expect(ink).not.toBe(prose);
  // A click on its [[Other]] or #todo is a click in text.
  await c.getByText("#todo", { exact: false }).click();
  await expect(h.page.getByRole("dialog", { name: /search/i })).toHaveCount(0);
  await sleep(SETTLE_MS);
  expect(file()).toBe(md);
});

test("the closing %% greys the comment at once, the caret kept; removing a marker unpaints; undo greys again", async () => {
  const blocks = await open("Start\n");
  await blocks.first().click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(" %%note **y**%");
  await expect(comments(h.page)).toHaveCount(0);
  // Not yet a comment: the typed **y** turned bold, as anywhere.
  await expect(h.page.locator("[data-editor] strong")).toHaveText(["y"]);
  await h.page.keyboard.type("%");
  // Closed, it is literal: the stars are back, nothing drawn inside.
  await expect(comments(h.page)).toHaveText(["%%note **y**%%"]);
  await expect(h.page.locator("[data-editor] strong")).toHaveCount(0);
  await h.page.keyboard.type(" after");
  await waitForFile(h.vault.file("C.md"), (t) => t === "Start %%note **y**%% after\n");
  await expect(comments(h.page)).toHaveText(["%%note **y**%%"]);

  // Remove the last marker's second %: plain again.
  for (let i = 0; i < " after".length + 1; i++) await h.page.keyboard.press("ArrowLeft");
  await h.page.keyboard.press("Backspace");
  await expect(comments(h.page)).toHaveCount(0);
  await waitForFile(h.vault.file("C.md"), (t) => t === "Start %%note **y**% after\n");
  await h.page.keyboard.press(UNDO);
  await expect(comments(h.page)).toHaveText(["%%note **y**%%"]);
  await waitForFile(h.vault.file("C.md"), (t) => t === "Start %%note **y**%% after\n");
});

test("with two comments, each marker removed and retyped repaints the pairs where they now are", async () => {
  const blocks = await open("%%a%% b %%c%%\n");
  await expect(comments(h.page)).toHaveText(["%%a%%", "%%c%%"]);
  await blocks.first().click();
  await h.page.keyboard.press(START_OF_LINE);
  for (let i = 0; i < 5; i++) await h.page.keyboard.press("ArrowRight");
  // After `%%a%%`: remove its closing marker; the pairs shift.
  await h.page.keyboard.press("Backspace");
  await h.page.keyboard.press("Backspace");
  await expect(comments(h.page)).toHaveText(["%%a b %%"]);
  await h.page.keyboard.type("%%");
  await expect(comments(h.page)).toHaveText(["%%a%%", "%%c%%"]);
  await waitForFile(h.vault.file("C.md"), (t) => t === "%%a%% b %%c%%\n");
});

test("typing inside a comment converts nothing, offers nothing, and keeps its bytes", async () => {
  const blocks = await open("x %%abc%% y\n");
  const c = comments(h.page).first();
  const box = (await c.boundingBox())!;
  await h.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await h.page.keyboard.type(" **b** #ta [[N");
  await expect(c.locator("strong")).toHaveCount(0);
  await expect(h.page.getByRole("listbox")).toHaveCount(0);
  await expect(comments(h.page)).toHaveCount(1);
  await sleep(SETTLE_MS);
  expect(file()).toMatch(/^x %%ab? \*\*b\*\* #ta \[\[Nb?c%% y\n$/);
  expect(await blocks.count()).toBeGreaterThan(0);
});

test("formatting does not act in a comment, nor on a selection reaching into or holding one", async () => {
  await open("plain %%secret%% text\n");
  const c = comments(h.page).first();
  await c.dblclick();
  await h.page.keyboard.press(`${MOD}+b`);
  await h.page.keyboard.press(`${MOD}+i`);
  await expect(c.locator("strong, em")).toHaveCount(0);
  // From prose into the comment.
  await h.page.evaluate(() => {
    const p = document.querySelector(
      "[data-editor] [data-block-id] [contenteditable], [data-editor] [data-block-id]",
    )!;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode() as Text;
    const inComment = document.querySelector(".md-comment")!.firstChild as Text;
    const r = document.createRange();
    r.setStart(first, 0);
    r.setEnd(inComment, 4);
    const s = window.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
  });
  await h.page.keyboard.press(`${MOD}+b`);
  // The whole line, the comment wholly inside: refused too.
  await h.page.evaluate(() => {
    const block = document.querySelector("[data-editor] > [data-block-id]")!;
    const r = document.createRange();
    r.selectNodeContents(block);
    const s = window.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
  });
  await h.page.keyboard.press(`${MOD}+b`);
  await sleep(SETTLE_MS);
  expect(file()).toBe("plain %%secret%% text\n");
  await expect(h.page.locator("[data-editor] strong")).toHaveCount(0);
});

test("a selection crossing a comment's edge acts on text; every byte around it stays", async () => {
  const blocks = await open("aa %%bb%% cc\n");
  await blocks.first().click();
  await h.page.keyboard.press(START_OF_LINE);
  await h.page.keyboard.press("ArrowRight");
  for (let i = 0; i < 4; i++) await h.page.keyboard.press("Shift+ArrowRight");
  await h.page.keyboard.type("X");
  await waitForFile(h.vault.file("C.md"), (t) => t === "aXbb%% cc\n");
  await expect(comments(h.page)).toHaveCount(0);
  await h.page.keyboard.press(UNDO);
  await waitForFile(h.vault.file("C.md"), (t) => t === "aa %%bb%% cc\n");
  await expect(comments(h.page)).toHaveText(["%%bb%%"]);
});

test("editing around a comment never changes its bytes", async () => {
  const md = "%%  odd  spacing \\* `x` [[A|b]] #t ==m==%% end\n";
  const blocks = await open(md);
  await blocks.first().click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type("ing");
  await h.page.keyboard.press(START_OF_LINE);
  await h.page.keyboard.type("Start ");
  await waitForFile(
    h.vault.file("C.md"),
    (t) => t === "Start %%  odd  spacing \\* `x` [[A|b]] #t ==m==%% ending\n",
  );
});

test("a marker in a code span is code; an odd marker and an escaped one stay text", async () => {
  // One case to a paragraph: markers pair left to right within a block.
  await open("`%%x%%` code\n\nodd %% marker\n\n\\%%no%%\n\n\\\\%%yes%%\n");
  await expect(comments(h.page)).toHaveText(["%%yes%%"]);
  await expect(h.page.locator("[data-editor] code")).toHaveText(["%%x%%"]);
});

test("a comment over soft breaks in one paragraph is one muted run", async () => {
  await open("%%\nA whole paragraph can be a comment too.\n%%\n\nAfter.\n");
  await expect(comments(h.page)).toHaveCount(1);
  await expect(comments(h.page).first()).toContainText("A whole paragraph");
});

test("a comment across blocks stays plain text, kept byte for byte", async () => {
  const md = "%%\nfirst\n\nsecond\n%%\n";
  const blocks = await open(md);
  await expect(comments(h.page)).toHaveCount(0);
  await blocks.last().click();
  await sleep(SETTLE_MS);
  expect(file()).toBe(md);
});

test("in a table cell and a callout body, the closing %% greys the comment, the caret kept", async () => {
  await open("| A |\n| --- |\n| x |\n\n> [!note] T\n> body\n");
  const cell = h.page.locator("[data-editor] td").first();
  await cell.click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(" %%c%%");
  await expect(cell.locator(".md-comment")).toHaveText(["%%c%%"]);
  await h.page.keyboard.type("!");
  const body = h.page.locator("[data-editor] .callout-body");
  await body.click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(" %%d%%");
  await expect(body.locator(".md-comment")).toHaveText(["%%d%%"]);
  await h.page.keyboard.type("?");
  await waitForFile(
    h.vault.file("C.md"),
    (t) => t === "| A |\n| --- |\n| x %%c%%! |\n\n> [!note] T\n> body %%d%%?\n",
  );
});
