/**
 * A link to a block (`[[#^id]]`, `[[Note#^id]]`) goes to the block the ID
 * names, as Obsidian finds it (utils/blockTarget): the ID ending a paragraph,
 * or alone after a list for the whole list. The block stands where a note's
 * first line sits, tinted; the jump is a visit, so Back returns. A missing ID
 * is said. The ID itself is drawn quietly, only while it ends its block. No
 * byte of any file changes by following.
 */
import { expect, test, type Page } from "@playwright/test";
import { SETTLE_MS, editorTitle, launchApp, sleep, type AppHandle } from "./harness";

const BACK = process.platform === "darwin" ? "Meta+BracketLeft" : "Alt+ArrowLeft";

const filler = (word: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${word} paragraph ${i + 1}.`).join("\n\n");

const HERE = [
  "Start here.",
  "Jump to [[#^first-block]] or [[#^nope]].",
  filler("Body", 25),
  "This paragraph has an ID. ^first-block",
  filler("Tail", 20),
  "",
].join("\n\n");

const GUIDE = [
  "# Guide",
  filler("Intro", 25),
  "- One\n- Two\n  - Nested\n- Three",
  "^Whole-List",
  filler("End", 20),
  "",
].join("\n\n");

const LINKS = "Start here.\n\n[[Guide#^whole-list]]\n";

const FILES = { "Here.md": HERE, "Guide.md": GUIDE, "Links.md": LINKS };

const link = (h: AppHandle, text: string) =>
  h.page
    .locator("[data-block-id] .wikilink")
    .filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
    .first();

/** The top of the block whose text starts with `text`, below the scroller's top. */
const blockTop = (page: Page, text: string) =>
  page.evaluate((text) => {
    const top = document.querySelector(".editor-scroll")!.getBoundingClientRect().top;
    const el = [...document.querySelectorAll("[data-editor] > [data-block-id]")].find((b) =>
      (b as HTMLElement).innerText.trim().startsWith(text),
    );
    return el ? Math.round(el.getBoundingClientRect().top - top) : null;
  }, text);

const atTop = async (page: Page, text: string) => {
  const top = await blockTop(page, text);
  return top !== null && top >= 0 && top < 160;
};

const scrollTop = (page: Page) =>
  page.evaluate(() => document.querySelector(".editor-scroll")!.scrollTop);

const tinted = (page: Page) =>
  page.evaluate(() =>
    (CSS as unknown as { highlights: Map<string, unknown> }).highlights.has("search-hit"),
  );

async function openWriting(h: AppHandle, title: string) {
  await h.openNote(title);
  await h.page
    .locator("[data-block-id]")
    .filter({ hasText: /^Start here\.$/ })
    .click();
}

test("a block link in the open note goes to its paragraph; Back returns; a missing one is said", async () => {
  const h = await launchApp(FILES);
  try {
    await openWriting(h, "Here");
    await expect(link(h, "^first-block")).toBeVisible();

    await link(h, "^first-block").click();
    await expect.poll(() => atTop(h.page, "This paragraph has an ID.")).toBe(true);
    expect(await tinted(h.page)).toBe(true);
    // The ID is drawn quietly at the paragraph's end.
    await expect(h.page.locator("[data-editor] .block-id")).toHaveText("^first-block");

    await h.page.keyboard.press(BACK);
    await expect.poll(() => scrollTop(h.page)).toBeLessThan(40);

    await link(h, "^nope").click();
    await expect(h.page.getByRole("alert")).toContainText("No block “^nope” in this note.");
    expect(await scrollTop(h.page)).toBeLessThan(40);

    await sleep(SETTLE_MS);
    for (const [name, text] of Object.entries(FILES)) expect(h.vault.read(name)).toBe(text);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a block link to an ID alone after a list opens the note at the whole list", async () => {
  const h = await launchApp(FILES);
  try {
    await openWriting(h, "Links");
    await link(h, "Guide > ^whole-list").click();
    await expect.poll(() => editorTitle(h.page)).toBe("Guide");
    await expect.poll(() => atTop(h.page, "One")).toBe(true);
    expect(await tinted(h.page)).toBe(true);
  } finally {
    await h.close();
  }
});

test("the ID is quiet only while it ends its block: a word after it makes it text", async () => {
  const h = await launchApp(FILES);
  try {
    await h.openNote("Here");
    const para = h.page
      .locator("[data-editor] > [data-block-id]")
      .filter({ hasText: /^This paragraph has an ID\./ });
    await para.scrollIntoViewIfNeeded();
    await para.locator(".block-id").click();
    await h.page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowRight" : "End");
    await h.page.keyboard.type(" more");
    await expect(para.locator(".block-id")).toHaveCount(0);
    await expect(para).toHaveText("This paragraph has an ID. ^first-block more");
    for (let i = 0; i < 5; i++) await h.page.keyboard.press("Backspace");
    await expect(para.locator(".block-id")).toHaveText("^first-block");
    await sleep(SETTLE_MS);
    expect(h.vault.read("Here.md")).toBe(HERE);
  } finally {
    await h.close();
  }
});
