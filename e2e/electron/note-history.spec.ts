/**
 * Back and Forward through the notes opened (⌘[ / ⌘], Alt+← / → off the Mac,
 * View → Back / Forward, the arrows left of the path): a step only moves the
 * place, opening a note drops what was ahead, a note deleted since is stepped
 * over. Held in memory only.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { END_OF_LINE, expandAllFolders, launchApp, menuClick, menuEnabled } from "./harness";
import { PNG } from "../fixtures";

const BACK = process.platform === "darwin" ? "Meta+BracketLeft" : "Alt+ArrowLeft";
const FORWARD = process.platform === "darwin" ? "Meta+BracketRight" : "Alt+ArrowRight";

test("back and forward walk the notes opened; a new opening drops Forward; a deleted note is skipped", async () => {
  const h = await launchApp({
    "Apple.md": "A.\n",
    "Banana.md": "B.\n",
    "Cherry.md": "C.\n",
    "Damson.md": "D.\n",
  });
  try {
    const name = h.page.getByRole("textbox", { name: "Note title" });
    for (const t of ["Apple", "Banana", "Cherry"]) {
      await h.openNote(t);
      await expect(name).toHaveText(t);
    }
    await expect.poll(() => menuEnabled(h, "forward")).toBe(false);
    await expect.poll(() => menuEnabled(h, "back")).toBe(true);

    await h.page.keyboard.press(BACK);
    await expect(name).toHaveText("Banana");
    await menuClick(h, "back");
    await expect(name).toHaveText("Apple");
    await expect.poll(() => menuEnabled(h, "back")).toBe(false);
    await h.page.keyboard.press(FORWARD);
    await expect(name).toHaveText("Banana");

    // Opening another from here drops Cherry from Forward.
    await h.openNote("Damson");
    await expect(name).toHaveText("Damson");
    await expect.poll(() => menuEnabled(h, "forward")).toBe(false);

    // Banana deleted outside: Back steps over it to Apple.
    fs.rmSync(h.vault.file("Banana.md"));
    await expect(h.page.getByRole("treeitem").filter({ hasText: "Banana" })).toHaveCount(0);
    await h.page.keyboard.press(BACK);
    await expect(name).toHaveText("Apple");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the arrows step through notes and a picture, grey where there is nowhere to go", async () => {
  const h = await launchApp(
    { "Apple.md": "A.\n", "Banana.md": "B.\n", "Cherry.md": "C.\n" },
    { prepare: (vault) => fs.writeFileSync(vault.file("whiteboard.png"), PNG) },
  );
  try {
    const name = h.page.getByRole("textbox", { name: "Note title" });
    const picture = h.page.getByTestId("picture-view");
    const back = h.page.getByRole("button", { name: "Back", exact: true });
    const forward = h.page.getByRole("button", { name: "Forward", exact: true });

    await h.openNote("Apple");
    await expect(back).toHaveAttribute("aria-disabled", "true");
    await h.openNote("Banana");
    await expandAllFolders(h.page);
    await h.page.locator('[data-file-path$="whiteboard.png"]').click();
    await expect(picture).toBeVisible();
    await h.openNote("Cherry");
    await expect(name).toHaveText("Cherry");
    await expect(forward).toHaveAttribute("aria-disabled", "true");

    await back.click();
    await expect(picture).toBeVisible();
    await back.click();
    await expect(name).toHaveText("Banana");
    // Note to note, so the same button stays under the pointer as it greys.
    await back.click();
    await expect(name).toHaveText("Apple");
    await expect(back).toHaveAttribute("aria-disabled", "true");
    await expect(back).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    // Greyed, it still takes the press (Playwright waits out `aria-disabled`
    // unless forced) and does nothing.
    await back.click({ force: true });
    await expect(name).toHaveText("Apple");
    await expect(forward).not.toHaveAttribute("aria-disabled");

    // Banana deleted outside: Forward steps over it to the picture.
    fs.rmSync(h.vault.file("Banana.md"));
    await expect(h.page.getByRole("treeitem").filter({ hasText: "Banana" })).toHaveCount(0);
    await forward.click();
    await expect(picture).toBeVisible();
    await forward.click();
    await expect(name).toHaveText("Cherry");
    await expect(forward).toHaveAttribute("aria-disabled", "true");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

// ─── Back and Forward return to the place (notePlace.ts) ───

const long = (name: string, n = 80, extra: Record<number, string> = {}) =>
  `${Array.from({ length: n }, (_, i) => extra[i + 1] ?? `${name} ${i + 1}.`).join("\n\n")}\n`;

/** The text of the first block showing at the top of the pane, and how far down it stands. */
const topBlock = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const scroller = document.querySelector(".editor-scroll")!;
    const paneTop = scroller.getBoundingClientRect().top;
    for (const el of document.querySelectorAll("[data-block-id]")) {
      const r = el.getBoundingClientRect();
      if (r.bottom > paneTop)
        return { text: (el as HTMLElement).innerText.trim(), top: Math.round(r.top - paneTop) };
    }
    return null;
  });
const scrollTop = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.querySelector(".editor-scroll")!.scrollTop);
/** Scroll so the block reading `text` stands `down` px below the pane's top, as a wheel leaves it. */
async function scrollTo(page: import("@playwright/test").Page, text: string, down = 30) {
  await page.evaluate(
    ([text, down]) => {
      const scroller = document.querySelector(".editor-scroll")!;
      const el = [...document.querySelectorAll("[data-block-id]")].find(
        (b) => (b as HTMLElement).innerText.trim() === text,
      )!;
      scroller.scrollTop +=
        el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - (down as number);
    },
    [text, down] as const,
  );
  await page.waitForTimeout(120); // recorded once a frame
}
const block = (page: import("@playwright/test").Page, text: string) =>
  page.locator("[data-block-id]").filter({ hasText: new RegExp(`^${text.replace(".", "\\.")}$`) });

test("Back and Forward return to where you were, caret and all; the sidebar opens at the top", async () => {
  const h = await launchApp({ "Apple.md": long("Apple"), "Banana.md": long("Banana") });
  try {
    const name = h.page.getByRole("textbox", { name: "Note title" });
    await h.openNote("Apple");
    await scrollTo(h.page, "Apple 20.");
    await block(h.page, "Apple 22.").click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.waitForTimeout(120);
    const there = await topBlock(h.page);

    await h.openNote("Banana");
    await expect(name).toHaveText("Banana");
    expect(await scrollTop(h.page)).toBe(0);
    await scrollTo(h.page, "Banana 10.");
    const bananaThere = await topBlock(h.page);

    await h.page.keyboard.press(BACK);
    await expect(name).toHaveText("Apple");
    expect(await topBlock(h.page)).toEqual(there);
    // The caret is where it was: typing lands in Apple 22.
    await h.page.keyboard.type("!");
    await expect(block(h.page, "Apple 22.!")).toHaveCount(1);

    await h.page.keyboard.press(FORWARD);
    await expect(name).toHaveText("Banana");
    expect(await topBlock(h.page)).toEqual(bananaThere);

    // A note opened from the sidebar opens at its top.
    await h.openNote("Apple");
    await expect(name).toHaveText("Apple");
    expect(await scrollTop(h.page)).toBe(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

// A note opened twice is two visits, each with its own place, as a browser's history.
test("each visit keeps its own place: the same note twice returns to each", async () => {
  const h = await launchApp({ "Apple.md": long("Apple"), "Banana.md": long("Banana") });
  try {
    const name = h.page.getByRole("textbox", { name: "Note title" });
    await h.openNote("Apple"); // read at the top
    await h.openNote("Banana");
    await expect(name).toHaveText("Banana");
    await h.openNote("Apple");
    await expect(name).toHaveText("Apple");
    await scrollTo(h.page, "Apple 35.");
    const second = await topBlock(h.page);

    await h.page.keyboard.press(BACK);
    await expect(name).toHaveText("Banana");
    await h.page.keyboard.press(BACK);
    await expect(name).toHaveText("Apple");
    expect(await scrollTop(h.page)).toBe(0); // the first visit, never scrolled

    await h.page.keyboard.press(FORWARD);
    await h.page.keyboard.press(FORWARD);
    await expect(name).toHaveText("Apple");
    expect(await topBlock(h.page)).toEqual(second); // the second visit
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

// The caret is put back only if it was on screen: typing somewhere unseen
// would surprise, and putting it back must never pull the page to it.
test("a caret scrolled out of view is not put back, and never moves the view", async () => {
  const h = await launchApp({ "Apple.md": long("Apple"), "Banana.md": "B.\n" });
  try {
    const name = h.page.getByRole("textbox", { name: "Note title" });
    await h.openNote("Apple");
    await block(h.page, "Apple 2.").click();
    await scrollTo(h.page, "Apple 30.");
    const there = await topBlock(h.page);
    await h.openNote("Banana");
    await expect(name).toHaveText("Banana");
    await h.page.keyboard.press(BACK);
    await expect(name).toHaveText("Apple");
    expect(await topBlock(h.page)).toEqual(there);
    const caretBlock = await h.page.evaluate(() => {
      const sel = window.getSelection();
      const n = sel?.rangeCount ? sel.anchorNode : null;
      const el = n && (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement);
      return (el?.closest("[data-block-id]") as HTMLElement | null)?.innerText.trim() ?? null;
    });
    expect(caretBlock).not.toBe("Apple 2.");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

// Leaving by a link, and the block you were at deleted by another app while
// away: Back lands on its neighbour, which outside edits keep by id.
test("left by a link, the block at the top deleted outside: Back lands on its neighbour", async () => {
  const h = await launchApp({
    "Apple.md": long("Apple", 80, { 25: "Apple 25 [[Banana]]." }),
    "Banana.md": "B.\n",
  });
  try {
    const name = h.page.getByRole("textbox", { name: "Note title" });
    await h.openNote("Apple");
    await scrollTo(h.page, "Apple 20.", -4); // Apple 20 the top block, just tucked under the edge
    expect((await topBlock(h.page))?.text).toBe("Apple 20.");
    await h.page
      .locator("[data-block-id]")
      .filter({ hasText: "Apple 25" })
      .getByText("Banana")
      .click();
    await expect(name).toHaveText("Banana");

    // Another app deletes the paragraph that was at the top.
    fs.writeFileSync(
      h.vault.file("Apple.md"),
      long("Apple", 80, { 25: "Apple 25 [[Banana]]." }).replace("Apple 20.\n\n", ""),
    );
    await h.page.waitForTimeout(1500); // the watcher takes the outside edit

    await h.page.keyboard.press(BACK);
    await expect(name).toHaveText("Apple");
    expect((await topBlock(h.page))?.text).toBe("Apple 21.");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
