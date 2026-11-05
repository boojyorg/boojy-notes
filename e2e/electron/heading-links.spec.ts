/**
 * A link to a heading (`[[Note#Heading]]`, `[[#Heading]]`) reads as Obsidian's
 * reading view shows it and goes to that heading: matched as Obsidian matches
 * (formatting and case aside, the first of two, or a path to the second), the
 * heading where a note's first line sits, its section tinted, the caret let
 * go. The jump is a visit, so Back and Forward step across it, inside one
 * note too. A heading the note lacks is said, never guessed: another note
 * opens at its top, the open note stays put. No byte of any file changes.
 */
import { expect, test, type Page } from "@playwright/test";
import { SETTLE_MS, editorTitle, launchApp, menuClick, sleep, type AppHandle } from "./harness";

const BACK = process.platform === "darwin" ? "Meta+BracketLeft" : "Alt+ArrowLeft";
const FORWARD = process.platform === "darwin" ? "Meta+BracketRight" : "Alt+ArrowRight";

const filler = (word: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${word} paragraph ${i + 1}.`).join("\n\n");

const GUIDE = [
  "# Guide",
  filler("Intro", 20),
  "## **Tables**",
  "Rows and columns.",
  "## Callouts",
  "Boxes.",
  "### Widths",
  "First widths.",
  filler("Middle", 20),
  "## Second",
  "### Widths",
  "Second widths.",
  filler("End", 20),
  "",
].join("\n\n");

const HERE = [
  "Start here.",
  "Jump to [[#Target]] or [[#Nope]].",
  "| Where | Link |\n| --- | --- |\n| cell | [[#Target]] |",
  "> [!note] Box\n> In a callout: [[#Target]]",
  filler("Body", 25),
  "## Target",
  "Landed.",
  filler("Tail", 20),
  "",
].join("\n\n");

const LINKS = "Start here.\n\n[[Guide#tables]]\n\n[[Guide#Second#Widths]]\n\n[[Guide#Nope]]\n";

const FILES = { "Guide.md": GUIDE, "Here.md": HERE, "Links.md": LINKS };

/** The link whose text is exactly `text`, inside `within` when given. */
const link = (h: AppHandle, text: string, within = "[data-block-id]") =>
  h.page
    .locator(`${within} .wikilink`)
    .filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
    .first();

/** Each heading reading `text`: its top below the scroller's top, in CSS pixels. */
const headingTops = (page: Page, text: string) =>
  page.evaluate((text) => {
    const scroller = document.querySelector(".editor-scroll")!;
    const top = scroller.getBoundingClientRect().top;
    return [...document.querySelectorAll('[data-block-type^="h"]')]
      .filter((el) => (el as HTMLElement).innerText.trim() === text)
      .map((el) => Math.round(el.getBoundingClientRect().top - top));
  }, text);

/** Whether a heading reading `text` (the `nth`) stands where a note's first line does. */
const atTop = async (page: Page, text: string, nth = 0) => {
  const top = (await headingTops(page, text))[nth];
  return top !== undefined && top >= 0 && top < 160;
};

const scrollTop = (page: Page) =>
  page.evaluate(() => document.querySelector(".editor-scroll")!.scrollTop);

/** No caret and no focus in the note: following a link moves the view only. */
const editorIdle = (page: Page) =>
  page.evaluate(() => {
    const editor = document.querySelector(".editor-scroll")!;
    const sel = window.getSelection();
    const caretIn = !!sel?.rangeCount && editor.contains(sel.anchorNode);
    return !caretIn && !editor.contains(document.activeElement);
  });

/** Open `title` with the caret in its first line, as it is while you write. */
async function openWriting(h: AppHandle, title: string) {
  await h.openNote(title);
  await h.page
    .locator("[data-block-id]")
    .filter({ hasText: /^Start here\.$/ })
    .click();
  await expect.poll(() => editorIdle(h.page)).toBe(false);
}

const tinted = (page: Page) =>
  page.evaluate(() =>
    (CSS as unknown as { highlights: Map<string, unknown> }).highlights.has("search-hit"),
  );

test("a heading link in another note: labelled, matched as Obsidian does, the section shown", async () => {
  const h = await launchApp(FILES);
  try {
    await openWriting(h, "Links");
    await expect(link(h, "Guide > tables")).toBeVisible();
    await expect(link(h, "Guide > Second > Widths")).toBeVisible();

    // `#tables` finds `## **Tables**`: formatting and case aside.
    await link(h, "Guide > tables").click();
    await expect.poll(() => editorTitle(h.page)).toBe("Guide");
    await expect.poll(() => atTop(h.page, "Tables")).toBe(true);
    expect(await tinted(h.page)).toBe(true);
    expect(await editorIdle(h.page)).toBe(true);

    // Back returns to the link; Forward to the heading again.
    await h.page.keyboard.press(BACK);
    await expect.poll(() => editorTitle(h.page)).toBe("Links");
    await h.page.keyboard.press(FORWARD);
    await expect.poll(() => editorTitle(h.page)).toBe("Guide");
    await expect.poll(() => atTop(h.page, "Tables")).toBe(true);

    // Two headings named Widths: the path reaches the second.
    await openWriting(h, "Links");
    await link(h, "Guide > Second > Widths").click();
    await expect.poll(() => editorTitle(h.page)).toBe("Guide");
    await expect.poll(() => atTop(h.page, "Widths", 1)).toBe(true);

    // A heading Guide lacks: it opens at its top, and says so.
    await openWriting(h, "Links");
    await link(h, "Guide > Nope").click();
    await expect.poll(() => editorTitle(h.page)).toBe("Guide");
    await expect(h.page.getByRole("alert")).toContainText("No heading “Nope” in Guide.");
    expect(await scrollTop(h.page)).toBe(0);

    await sleep(SETTLE_MS);
    for (const [name, text] of Object.entries(FILES)) expect(h.vault.read(name)).toBe(text);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a heading link in the open note is a visit: Back and Forward step across it", async () => {
  const h = await launchApp(FILES);
  try {
    await openWriting(h, "Here");
    await expect(link(h, "Target")).toBeVisible();
    expect(await scrollTop(h.page)).toBe(0);

    await link(h, "Target").click();
    await expect.poll(() => atTop(h.page, "Target")).toBe(true);
    expect(await tinted(h.page)).toBe(true);
    expect(await editorIdle(h.page)).toBe(true);
    expect(await editorTitle(h.page)).toBe("Here");

    await h.page.keyboard.press(BACK);
    await expect.poll(() => scrollTop(h.page)).toBeLessThan(20);
    await expect(link(h, "Target")).toBeInViewport();
    await h.page.keyboard.press(FORWARD);
    await expect.poll(() => atTop(h.page, "Target")).toBe(true);
    await h.page.keyboard.press(BACK);
    await expect.poll(() => scrollTop(h.page)).toBeLessThan(20);

    // A heading this note lacks: nothing moves, and it says so.
    await link(h, "Nope").click();
    await expect(h.page.getByRole("alert")).toContainText("No heading “Nope” in this note.");
    expect(await scrollTop(h.page)).toBeLessThan(20);

    await sleep(SETTLE_MS);
    for (const [name, text] of Object.entries(FILES)) expect(h.vault.read(name)).toBe(text);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a heading link in a table cell or a callout goes to its heading too", async () => {
  const h = await launchApp(FILES);
  try {
    await openWriting(h, "Here");
    for (const within of ["table", "[data-block-type='callout']"]) {
      const inField = link(h, "Target", within);
      await expect(inField).toBeVisible();
      await inField.click();
      await expect.poll(() => atTop(h.page, "Target")).toBe(true);
      expect(await editorIdle(h.page)).toBe(true);
      await h.page.keyboard.press(BACK);
      await expect.poll(() => scrollTop(h.page)).toBeLessThan(20);
    }

    await sleep(SETTLE_MS);
    for (const [name, text] of Object.entries(FILES)) expect(h.vault.read(name)).toBe(text);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a heading link into a note left in the Markdown view shows the heading's line", async () => {
  const h = await launchApp(FILES);
  try {
    await h.openNote("Guide");
    await menuClick(h, "toggleSourceView");
    await expect(h.page.getByTestId("source-view")).toBeVisible();
    await openWriting(h, "Links");
    await link(h, "Guide > tables").click();
    await expect.poll(() => editorTitle(h.page)).toBe("Guide");
    await expect(h.page.getByTestId("source-view")).toBeVisible();
    // The caret on the heading's line, that line where a note's first line sits.
    const at = () =>
      h.page.evaluate(() => {
        const field = document.querySelector(".source-field") as HTMLTextAreaElement;
        const scroller = document.querySelector(".editor-scroll")!;
        const lineStart = field.value.lastIndexOf("\n", field.selectionStart - 1) + 1;
        return {
          line: field.value.slice(lineStart, field.value.indexOf("\n", lineStart)),
          scrolled: scroller.scrollTop > 300,
        };
      });
    await expect.poll(at).toEqual({ line: "## **Tables**", scrolled: true });

    await sleep(SETTLE_MS);
    for (const [name, text] of Object.entries(FILES)) expect(h.vault.read(name)).toBe(text);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
