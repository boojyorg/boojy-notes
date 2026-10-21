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

test("the note's ··· stays lit while its menu is open, and only then", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Lit");
  const more = page.locator("button[aria-label='Note actions']");
  await more.click();
  await expect(page.getByRole("menu")).toBeVisible();
  // The pointer gone from it: the menu's being open is what holds it.
  await page.mouse.move(5, 400);
  await expect(more).toHaveCSS("background-color", ROW_GREY);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(more).not.toHaveCSS("background-color", ROW_GREY);
});

test("a key bar key held down wears the row grey", async ({ page }) => {
  await page.goto("/?keybar");
  await page.evaluate(() => document.documentElement.classList.add("is-phone"));
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Keys");
  await page.locator('[data-editor] [data-block-type="p"]').first().click();
  // The bar refuses the touch, so no :active: its data-pressed is the press.
  const key = page.getByRole("button", { name: "Headings", exact: true });
  await expect(key).toBeVisible();
  const at = (await key.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await expect(key).toHaveAttribute("data-pressed", "");
  await expect(key).toHaveCSS("background-color", ROW_GREY);
  await page.mouse.up();
});

test("a tap on a code block still brings up its Copy button", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Code");
  await page.locator('[data-editor] [data-block-type="p"]').first().click();
  await page.keyboard.type("``` ");
  await page.keyboard.type("let a = 1;");
  const copy = page.locator(".code-copy-wrapper");
  await page.locator("[data-title]").first().click();
  await page.mouse.move(5, 5);
  await expect(copy).toHaveCSS("opacity", "0");
  const block = (await page.locator(".code-block").boundingBox())!;
  // A mouse shows it on hover, as before.
  await page.mouse.move(block.x + 40, block.y + block.height / 2);
  await expect(copy).toHaveCSS("opacity", "1");
  await page.mouse.move(5, 5);
  await expect(copy).toHaveCSS("opacity", "0");
  // A tap puts the caret in the code; Copy shows while it is there, not on
  // a hover a finger never makes (Playwright's mouse leaves after the tap).
  await page.touchscreen.tap(block.x + 40, block.y + block.height / 2);
  await expect(copy).toHaveCSS("opacity", "1");
});
