/**
 * A context menu inside the editor column opens at the pointer, in viewport
 * space (review 2026-09-07, §3.9). The menus are `position: fixed` at the
 * pointer's clientX/clientY; the column they sit in must never become their
 * containing block.
 *
 * Before this the column kept `transform: translateY(0)` after its fade-in,
 * which makes a transformed ancestor the containing block for every fixed
 * descendant: the link, code block, image and file menus and the table's
 * create badge opened offset by the column's left edge (about 284px at the
 * default width) and moved with the page as it scrolled. `TableContextMenu`
 * and the callout picker portal to `body` and were never affected.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { launchApp } from "./harness";

// A 1x1 PNG, so the image block has a real picture to right-click.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const filler = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => `${prefix} paragraph ${i + 1}.`).join("\n\n");

/** Scroll `target` to the middle of the viewport, right-click its centre, and
 * return how far the menu's top-left corner landed from the pointer. */
async function menuOffset(page: Page, target: Locator, menu: Locator) {
  await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = await target.boundingBox();
  if (!box) throw new Error("target has no box");
  const x = Math.round(box.x + Math.min(box.width / 2, 60));
  const y = Math.round(box.y + Math.min(box.height / 2, 20));
  await page.mouse.click(x, y, { button: "right" });
  await expect(menu).toBeVisible();
  const m = await menu.boundingBox();
  if (!m) throw new Error("menu has no box");
  const scrollTop = await page.locator(".editor-scroll").evaluate((el) => el.scrollTop);
  expect(
    scrollTop,
    "the editor is scrolled, so a column-relative menu would show it",
  ).toBeGreaterThan(100);
  return { dx: Math.round(m.x - x), dy: Math.round(m.y - y) };
}

test("link, code block and image context menus open at the pointer in a scrolled note", async () => {
  const body = [
    filler(30, "Before"),
    "See [Example](https://example.com) here.",
    "```js\nconst a = 1;\n```",
    "![[pic.png|200]]",
    filler(30, "After"),
    "",
  ].join("\n\n");
  const h = await launchApp(
    { "Long.md": body },
    {
      prepare: (vault) => {
        fs.mkdirSync(vault.file("attachments"), { recursive: true });
        fs.writeFileSync(vault.file("attachments/pic.png"), PNG);
      },
    },
  );
  try {
    await h.openNote("Long");
    const editor = h.page.locator(".editor-scroll");
    await expect(editor.locator("a", { hasText: "Example" })).toBeVisible();

    const link = await menuOffset(
      h.page,
      editor.locator("a", { hasText: "Example" }),
      h.page.locator(".link-context-menu"),
    );
    expect(link, "link menu offset from the pointer").toEqual({ dx: 0, dy: 0 });
    await h.page.keyboard.press("Escape");
    await expect(h.page.locator(".link-context-menu")).toHaveCount(0);

    const code = await menuOffset(
      h.page,
      editor.locator("textarea"),
      h.page.locator(".code-ctx-menu"),
    );
    expect(code, "code block menu offset from the pointer").toEqual({ dx: 0, dy: 0 });
    // The textarea keeps Escape for itself (it leaves the block), so the code
    // menu closes on a press elsewhere, as it does for the user.
    await editor.locator("p", { hasText: "Before paragraph 30." }).click();
    await expect(h.page.locator(".code-ctx-menu")).toHaveCount(0);

    const image = await menuOffset(
      h.page,
      editor.locator("img"),
      h.page.locator(".image-context-menu"),
    );
    expect(image, "image menu offset from the pointer").toEqual({ dx: 0, dy: 0 });
    await h.page.keyboard.press("Escape");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
