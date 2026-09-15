import { expect, test } from "@playwright/test";
import { launchApp, MOD, SETTLE_MS, sleep, waitForFile } from "./harness";

/**
 * Frontmatter is the head of the file, not a block in the body. Nothing can
 * be reordered above it and it can never be moved into the body, by either
 * reorder path (Cmd+Shift+Arrow, the gutter grip); ordinary reordering under
 * it is untouched. Before this, Cmd+Shift+Up on the first block under the
 * frontmatter put that block above it and the file was written with the
 * `---` no longer on line 1: `text` / `---` / yaml / `---` is a setext
 * heading and a divider to every reader, and a blank line first (the empty
 * row Obsidian's own blank after the closer parses to) is no frontmatter at
 * all. Either way the properties were gone (2026-09-15, Obsidian assessment).
 */

const FRONTMATTER = ["---", 'title: "Quoted: with colon"', "tags:", "  - research", "---"].join(
  "\n",
);
/** The closer directly over the text: the first block under the frontmatter is the paragraph. */
const TIGHT = `${FRONTMATTER}\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n`;
/** A blank line after the closer: the first block under the frontmatter is an empty row. */
const SPACED = `${FRONTMATTER}\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n`;

const frontmatterFirst = async (h: Awaited<ReturnType<typeof launchApp>>) =>
  expect(h.page.locator("[data-block-id]").first()).toHaveAttribute(
    "data-block-type",
    "frontmatter",
  );

/** `noteText` for the blocks under the frontmatter, whose own row is a header and a glyph. */
const bodyText = async (h: Awaited<ReturnType<typeof launchApp>>) =>
  (
    await h.page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-block-id]:not([data-block-type="frontmatter"])'))
        .map((b) => (b as HTMLElement).innerText.replace(/\n$/, ""))
        .join("\n"),
    )
  ).replace(/\n+$/, "");

test("Cmd+Shift+Up on the first block under the frontmatter is refused, and reordering under it still works", async () => {
  const h = await launchApp({ "Tight.md": TIGHT, "Spaced.md": SPACED });
  try {
    await h.openNote("Tight");
    const blocks = h.page.locator("[data-block-id]");
    await frontmatterFirst(h);

    const undoButton = h.page.getByRole("button", { name: "Undo" });
    await expect(undoButton).toBeDisabled();
    await blocks.nth(1).click();
    await h.page.keyboard.press(`${MOD}+Shift+ArrowUp`);
    await sleep(SETTLE_MS);
    // Nothing moved, so nothing was written and there is nothing to undo:
    // the bytes are the file's own and the Undo button stays off.
    expect(h.vault.read("Tight.md")).toBe(TIGHT);
    await frontmatterFirst(h);
    await expect(undoButton).toBeDisabled();

    // Ordinary reordering under it still works, both ways, and is undoable.
    await h.page.keyboard.press(`${MOD}+Shift+ArrowDown`);
    await waitForFile(
      h.vault.file("Tight.md"),
      (t) => t === `${FRONTMATTER}\nSecond paragraph.\n\nFirst paragraph.\n\nThird paragraph.\n`,
      { label: "the first paragraph moved down under the frontmatter" },
    );
    await expect(undoButton).toBeEnabled();
    await h.page.keyboard.press(`${MOD}+Shift+ArrowUp`);
    await waitForFile(h.vault.file("Tight.md"), (t) => t === TIGHT, {
      label: "and back up, still under the frontmatter",
    });
    await h.page.keyboard.press(`${MOD}+Shift+ArrowUp`);
    await sleep(SETTLE_MS);
    expect(h.vault.read("Tight.md")).toBe(TIGHT);

    // The empty row Obsidian's blank line parses to is refused the same way;
    // before this it went above the frontmatter and the file began with a
    // blank line, which no reader takes for frontmatter.
    await h.openNote("Spaced");
    await frontmatterFirst(h);
    await blocks.nth(1).click();
    await h.page.keyboard.press(`${MOD}+Shift+ArrowUp`);
    await sleep(SETTLE_MS);
    expect(h.vault.read("Spaced.md")).toBe(SPACED);
    await frontmatterFirst(h);

    await h.restart();
    await h.openNote("Tight");
    await frontmatterFirst(h);
    expect(await bodyText(h)).toBe("First paragraph.\nSecond paragraph.\nThird paragraph.");
    expect(h.vault.read("Spaced.md")).toBe(SPACED);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a block dropped at the very top lands under the frontmatter, and the frontmatter has no grip", async () => {
  const h = await launchApp({ "Props.md": TIGHT });
  try {
    await h.openNote("Props");
    const blocks = h.page.locator("[data-block-id]");
    const fm = blocks.first();
    await frontmatterFirst(h);
    const fmBox = await fm.boundingBox();
    const third = blocks.nth(3);
    const thirdBox = await third.boundingBox();
    if (!fmBox || !thirdBox) throw new Error("blocks not visible");

    // Lift the third paragraph by its grip and release above everything.
    const thirdId = await third.getAttribute("data-block-id");
    const grip = h.page.locator(
      `[data-testid="block-drag-handle"][data-target-block="${thirdId}"]`,
    );
    await h.page.mouse.move(thirdBox.x + 40, thirdBox.y + thirdBox.height / 2);
    await grip.waitFor({ timeout: 2_000 });
    const gripBox = await grip.boundingBox();
    if (!gripBox) throw new Error("grip not visible");
    const gx = gripBox.x + gripBox.width / 2;
    const gy = gripBox.y + gripBox.height / 2;
    await h.page.mouse.move(gx, gy);
    await h.page.mouse.down();
    await h.page.mouse.move(gx, gy - 8, { steps: 2 });
    await h.page.waitForFunction(() => document.body.classList.contains("block-dragging"), null, {
      timeout: 2_000,
    });
    await h.page.mouse.move(gx, fmBox.y + 2, { steps: 6 });
    await sleep(50);
    await h.page.mouse.up();

    await waitForFile(
      h.vault.file("Props.md"),
      (t) => t === `${FRONTMATTER}\nThird paragraph.\n\nFirst paragraph.\n\nSecond paragraph.\n`,
      { label: "the dropped block written under the frontmatter" },
    );
    await sleep(SETTLE_MS);
    await frontmatterFirst(h);

    // Hovering the frontmatter reveals no grip: it is not a block to lift.
    const fmId = await fm.getAttribute("data-block-id");
    await h.page.mouse.move(fmBox.x + 40, fmBox.y + fmBox.height / 2);
    await sleep(300);
    await expect(
      h.page.locator(`[data-testid="block-drag-handle"][data-target-block="${fmId}"]`),
    ).toHaveCount(0);

    await h.restart();
    await h.openNote("Props");
    await frontmatterFirst(h);
    expect(await bodyText(h)).toBe("Third paragraph.\nFirst paragraph.\nSecond paragraph.");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
