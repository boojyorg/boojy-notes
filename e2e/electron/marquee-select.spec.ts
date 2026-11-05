/**
 * A drag from the note's margin draws a box that selects the blocks it
 * touches (useMarqueeSelect): one Backspace removes them, one ⌘Z brings them
 * back. A nested item touched alone comes alone; its parent brings it. The
 * page scrolls while the box nears its edge; Escape cancels. The same at an
 * Interface size above 100%.
 */
import { expect, test, type Page } from "@playwright/test";
import { SETTLE_MS, launchApp, sleep, type AppHandle } from "./harness";

const UNDO = process.platform === "darwin" ? "Meta+z" : "Control+z";
const filler = (n: number) => Array.from({ length: n }, (_, i) => `Filler ${i + 1}.`).join("\n\n");
const NOTE = [
  "Alpha line.",
  "Beta line.",
  "- Parent\n  - Child\n- Sibling",
  "Gamma line.",
  filler(40),
  "Last line.",
  "",
].join("\n\n");

const rect = async (page: Page, text: string) => {
  const box = await page
    .locator("[data-editor] > [data-block-id]")
    .filter({ hasText: new RegExp(`^${text.replace(".", "\\.")}`) })
    .first()
    .boundingBox();
  if (!box) throw new Error(`no block ${text}`);
  return box;
};

/** An x in the left margin, clear of the grip: the scroller's own padding. */
const marginX = (page: Page) =>
  page.evaluate(() => document.querySelector(".editor-scroll")!.getBoundingClientRect().left + 6);

/** Drag the box in the margin from beside `from` to beside `to`. */
async function boxDrag(h: AppHandle, from: string, to: string) {
  const x = await marginX(h.page);
  const a = await rect(h.page, from);
  const b = await rect(h.page, to);
  await h.page.mouse.move(x, a.y + a.height / 2);
  await h.page.mouse.down();
  await h.page.mouse.move(x + 4, b.y + b.height / 2, { steps: 8 });
  await h.page.mouse.up();
}

const read = async (h: AppHandle) => {
  await sleep(SETTLE_MS);
  return h.vault.read("Note.md");
};

test("a box from the margin selects what it touches; Backspace removes it, ⌘Z brings it back", async () => {
  const h = await launchApp({ "Note.md": NOTE });
  try {
    await h.openNote("Note");
    await boxDrag(h, "Alpha line.", "Beta line.");
    await h.page.keyboard.press("Backspace");
    expect(await read(h)).toBe(NOTE.replace("Alpha line.\n\nBeta line.\n\n", ""));
    await h.page.keyboard.press(UNDO);
    expect(await read(h)).toBe(NOTE);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a nested item touched alone comes alone; its parent brings it", async () => {
  const h = await launchApp({ "Note.md": NOTE });
  try {
    await h.openNote("Note");
    await boxDrag(h, "Child", "Child");
    await h.page.keyboard.press("Backspace");
    expect(await read(h)).toBe(NOTE.replace("  - Child\n", ""));
    await h.page.keyboard.press(UNDO);
    expect(await read(h)).toBe(NOTE);

    await boxDrag(h, "Parent", "Parent");
    await h.page.keyboard.press("Backspace");
    expect(await read(h)).toBe(NOTE.replace("- Parent\n  - Child\n", ""));
    await h.page.keyboard.press(UNDO);
    expect(await read(h)).toBe(NOTE);
  } finally {
    await h.close();
  }
});

test("Escape cancels a box; the page scrolls while it nears the edge", async () => {
  const h = await launchApp({ "Note.md": NOTE });
  try {
    await h.openNote("Note");
    const x = await marginX(h.page);
    const a = await rect(h.page, "Alpha line.");
    await h.page.mouse.move(x, a.y + a.height / 2);
    await h.page.mouse.down();
    await h.page.mouse.move(x + 4, a.y + 80, { steps: 4 });
    await expect(h.page.locator(".marquee-box")).toHaveCount(1);
    await h.page.keyboard.press("Escape");
    await expect(h.page.locator(".marquee-box")).toHaveCount(0);
    await h.page.mouse.up();
    await h.page.keyboard.press("Backspace");
    expect(await read(h)).toBe(NOTE);

    // Held near the bottom edge, the page moves under the box.
    const pane = await h.page.evaluate(() =>
      document.querySelector(".editor-scroll")!.getBoundingClientRect().toJSON(),
    );
    await h.page.mouse.move(x, a.y + a.height / 2);
    await h.page.mouse.down();
    await h.page.mouse.move(x + 4, pane.bottom - 4, { steps: 6 });
    await expect
      .poll(() => h.page.evaluate(() => document.querySelector(".editor-scroll")!.scrollTop))
      .toBeGreaterThan(200);
    await h.page.mouse.up();
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the box selects the same blocks at an Interface size above 100%", async () => {
  const h = await launchApp({ "Note.md": NOTE });
  try {
    await h.page.evaluate(() => {
      document.documentElement.style.zoom = "125%";
    });
    await h.openNote("Note");
    await boxDrag(h, "Beta line.", "Gamma line.");
    await h.page.keyboard.press("Backspace");
    expect(await read(h)).toBe(
      NOTE.replace("Beta line.\n\n- Parent\n  - Child\n- Sibling\n\nGamma line.\n\n", ""),
    );
  } finally {
    await h.close();
  }
});

test("after a box started between blocks, a keyboard selection still shows the toolbar", async () => {
  const h = await launchApp({ "Note.md": NOTE });
  try {
    await h.openNote("Note");
    // The gap between Alpha and Beta, inside the editor: its press is the editor's too.
    const gap = await h.page.evaluate(() => {
      const [a, b] = Array.from(document.querySelectorAll("[data-editor] > [data-block-id]"))
        .slice(0, 2)
        .map((el) => el.getBoundingClientRect());
      const p = { x: a.left + 40, y: (a.bottom + b.top) / 2 };
      const hit = document.elementFromPoint(p.x, p.y);
      return { ...p, editor: hit?.hasAttribute("data-editor") ?? false };
    });
    expect(gap.editor).toBe(true);
    const g = await rect(h.page, "Gamma line.");
    await h.page.mouse.move(gap.x, gap.y);
    await h.page.mouse.down();
    await h.page.mouse.move(gap.x + 4, g.y + g.height / 2, { steps: 8 });
    await h.page.mouse.up();
    await h.page.keyboard.press("Escape");
    await h.page.keyboard.press("Shift+ArrowLeft");
    await h.page.keyboard.press("Shift+ArrowLeft");
    await expect(h.page.getByRole("toolbar")).toBeVisible();
  } finally {
    await h.close();
  }
});
