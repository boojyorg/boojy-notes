/**
 * A right-click in a text field outside the note (Search, a rename, the
 * note's name, Settings) gives Cut, Copy and Paste, as the note's own menu
 * does (`TextFieldMenu`). Electron shows none of its own: it did nothing.
 */
import { expect, test } from "@playwright/test";
import { MOD, launchApp } from "./harness";

test("a right-click in Search's field gives Cut, Copy and Paste, run on the field", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  const menu = h.page.locator(".editor-context-menu");
  const clip = async () =>
    (await h.app.evaluate(({ clipboard }) => clipboard.readText())).replace(/\r\n/g, "\n");
  try {
    await h.openNote("Alpha");
    await h.page.keyboard.press(`${MOD}+p`);
    const field = h.page.getByRole("textbox", { name: "Search notes" });
    await expect(field).toBeFocused();
    await field.fill("brave words");

    await field.selectText();
    // Right-clicked at the words' far end, the menu still hangs under the
    // line from where the selection starts, as the note's does.
    const box = (await field.boundingBox())!;
    const textStart = await field.evaluate((f) => {
      const css = getComputedStyle(f);
      const r = f.getBoundingClientRect();
      return r.left + Number.parseFloat(css.borderLeftWidth) + Number.parseFloat(css.paddingLeft);
    });
    await h.page.mouse.click(textStart + 60, box.y + box.height / 2, { button: "right" });
    await expect(menu).toBeVisible();
    const placed = (await menu.boundingBox())!;
    expect(Math.abs(placed.x - textStart)).toBeLessThan(6);
    expect(placed.y).toBeGreaterThan(box.y + box.height / 2);
    // Selected words wear the note's one selection colour, not the system's blue.
    const tint = (sel: string) =>
      h.page.evaluate(
        (sel) => getComputedStyle(document.querySelector(sel)!, "::selection").backgroundColor,
        sel,
      );
    expect(await tint("input[aria-label='Search notes']")).toBe(
      await tint("[data-editor] [data-block-id]"),
    );
    // The field keeps focus, so its selection is what the menu acts on.
    await expect(field).toBeFocused();
    await menu.getByRole("menuitem", { name: /^Cut/ }).click();
    await expect(menu).toHaveCount(0);
    await expect(field).toHaveValue("");
    expect(await clip()).toBe("brave words");

    await field.click({ button: "right" });
    await expect(menu.getByRole("menuitem", { name: /^Copy/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await menu.getByRole("menuitem", { name: /^Paste/ }).click();
    await expect(field).toHaveValue("brave words");

    // Escape closes the menu, not the palette under it.
    await field.click({ button: "right" });
    await expect(menu).toBeVisible();
    await h.page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(field).toBeVisible();
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
