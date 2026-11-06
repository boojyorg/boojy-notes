import { test, expect } from "@playwright/test";

// The callout's type menu is the shared menu (Menu): radio rows, the chosen
// one ticked in the row's own ink (never the type's colour), the menus' keys:
// arrows wrap, Enter chooses, Escape closes. It never takes focus, so the
// caret stays in the callout.

test("the callout type menu is the shared menu: walked by keys, ticked in the row's ink", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForSelector("[data-editor]", { timeout: 10000 });
  await page.locator("[data-editor] [data-block-id]").first().click();
  await page.keyboard.type("/callout");
  await page.keyboard.press("Enter");
  const trigger = page.getByRole("button", { name: "Change callout type" });
  await expect(trigger).toBeVisible();

  await trigger.click();
  const menu = page.getByRole("menu", { name: "Callout type" });
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  // The types, then Foldable after a rule: the arrows walk all of them.
  const count = (await menu.getByRole("menuitemradio").count()) + 1;
  await expect(menu.getByRole("menuitemcheckbox")).toHaveText("Foldable");
  const checked = menu.locator('[role="menuitemradio"][aria-checked="true"]');
  await expect(checked).toHaveCount(1);
  await expect(checked).toHaveText("Note");
  // The tick is the row's ink, not the type's colour.
  const tick = page.getByTestId("callout-type-check");
  const [tickInk, rowInk] = await Promise.all([
    tick.evaluate((el) => getComputedStyle(el).color),
    checked.evaluate((el) => getComputedStyle(el).color),
  ]);
  expect(tickInk).toBe(rowInk);

  // The arrows walk the rows and wrap.
  const active = () => menu.getAttribute("aria-activedescendant");
  await page.keyboard.press("ArrowDown");
  await expect.poll(active).toBe("callout-type-item-0");
  // Up from the first wraps to the last; down comes back round.
  await page.keyboard.press("ArrowUp");
  await expect.poll(active).toBe(`callout-type-item-${count - 1}`);
  await page.keyboard.press("ArrowDown");
  await expect.poll(active).toBe("callout-type-item-0");
  await page.keyboard.press("ArrowDown");
  const chosenId = (await active())!;
  const chosen = (await page.locator(`#${chosenId}`).innerText()).trim();

  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  // An empty title stays empty (nothing is written to the file): it is shown
  // as the new type's name.
  const title = page.locator(".callout-title").first();
  await expect(title).toHaveText("");
  await expect(title).toHaveAttribute("data-placeholder", chosen);

  await trigger.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

// An empty title is the type's name, and that is the title the reader sees:
// drawn at full strength, faint only while the caret is in it to type over.
test("an empty callout title reads at full strength, faint only while typed into", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForSelector("[data-editor]", { timeout: 10000 });
  await page.locator("[data-editor] [data-block-id]").first().click();
  await page.keyboard.type("/callout");
  await page.keyboard.press("Enter");
  const title = page.locator(".callout-title").first();
  await expect(title).toHaveAttribute("data-placeholder", "Note");
  const opacity = () => title.evaluate((el) => Number(getComputedStyle(el, "::before").opacity));
  // A new callout starts with the caret in its title, so faint there.
  await expect.poll(opacity).toBeLessThan(0.5);
  // In the body, the title is at rest: the name at full strength.
  await page.locator(".callout-body").first().click();
  await expect.poll(opacity).toBe(1);
  await title.click();
  await expect.poll(opacity).toBeLessThan(0.5);
});
