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
    await field.click({ button: "right" });
    await expect(menu).toBeVisible();
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
