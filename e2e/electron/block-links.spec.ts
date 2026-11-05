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

/**
 * How far the block reading `text` (the `nth`) stands from where a note's first
 * line rests unscrolled (the editor's top and padding, in the content), in
 * viewport pixels: 0 is a jump that landed exactly there, clear of the chrome row.
 */
const fromRest = (page: Page, text: string, nth = 0) =>
  page.evaluate(
    ([text, nth]) => {
      const scroller = document.querySelector(".editor-scroll") as HTMLElement;
      const editor = document.querySelector("[data-editor]") as HTMLElement;
      const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      const pad = Number.parseFloat(getComputedStyle(editor).paddingTop) * zoom;
      const rest = editor.getBoundingClientRect().top + scroller.scrollTop * zoom + pad;
      const el = [...document.querySelectorAll("[data-editor] > [data-block-id]")].filter((b) =>
        (b as HTMLElement).innerText.trim().startsWith(text as string),
      )[nth as number];
      return el ? Math.round(el.getBoundingClientRect().top - rest) : null;
    },
    [text, nth] as const,
  );

const atTop = async (page: Page, text: string, nth = 0) => {
  const off = await fromRest(page, text, nth);
  return off !== null && Math.abs(off) <= 2;
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

    // The chip says where each goes: the open note, or a block it lacks, behind one mark.
    const chip = h.page.getByTestId("link-tooltip");
    const chipFor = async (text: string, want: string) => {
      await expect(async () => {
        await h.page.mouse.move(5, 5);
        await link(h, text).hover();
        await expect(chip).toHaveText(want, { timeout: 1_500 });
      }).toPass({ timeout: 10_000 });
    };
    await chipFor("^first-block", "^first-blockin this note");
    await expect(h.page.getByTestId("link-tooltip-mark")).toHaveCount(0);
    await chipFor("^nope", "^nopeno block by this name");
    await expect(h.page.getByTestId("link-tooltip-mark")).toHaveCount(1);
    await h.page.mouse.move(5, 5);

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

test("at an Interface size above 100%, the block lands where the first line rests too", async () => {
  const h = await launchApp(FILES);
  try {
    await h.page.evaluate(() => {
      document.documentElement.style.zoom = "125%";
    });
    await openWriting(h, "Here");
    await link(h, "^first-block").click();
    await expect.poll(() => fromRest(h.page, "This paragraph has an ID.")).toBe(0);
  } finally {
    await h.close();
  }
});
