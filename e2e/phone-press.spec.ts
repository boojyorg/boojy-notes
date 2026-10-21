import { expect, type Page, test } from "@playwright/test";

// The phone's press (GlobalStyles' html.is-phone rules): anything tappable
// wears the row grey while the finger is down, and nothing after. The web
// build is put in the phone's class. That a tap leaves no hover look
// (utils/touch) is Chromium's touch-made mouse events: tests/utils/touch.test.ts.

test.use({ hasTouch: true });

const ROW_GREY = "rgb(236, 236, 236)"; // DAY's BG.hover

async function asPhone(page: Page) {
  await page.goto("/");
  await page.evaluate(() => document.documentElement.classList.add("is-phone"));
}

const middle = async (page: Page, selector: string) => {
  const b = (await page.locator(selector).first().boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

test("a row wears the row grey while pressed, and nothing after", async ({ page }) => {
  await asPhone(page);
  // Pressed with the mouse: a headless browser applies :active to a held
  // button but not to a CDP touch, and the rule is the same for both.
  const row = page.locator(".sidebar-action-row").first();
  const at = await middle(page, ".sidebar-action-row");
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await expect(row).toHaveCSS("background-color", ROW_GREY);
  // Slid off and let go: no click, and no grey left behind.
  await page.mouse.move(at.x, at.y + 400);
  await page.mouse.up();
  await expect(row).not.toHaveCSS("background-color", ROW_GREY);
});
