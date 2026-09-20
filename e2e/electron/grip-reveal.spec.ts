/**
 * The gutter grip comes back (2026-09-20). Two ways it used to vanish for the
 * rest of a note: a key pressed while the pointer rested on the grip (the grip
 * unmounts under the pointer, so its mouseleave never fires and "hovering the
 * grip" stayed true forever), and a press on the grip followed by the window
 * losing focus (the press's window listeners were never cleaned up, so the next
 * pointer movement started a phantom drag with no button down). Both are
 * pointer geometry and focus, so they are proven in the real app.
 */
import { expect, type Page, test } from "@playwright/test";
import { type AppHandle, launchApp, MOD, sleep } from "./harness";

let h: AppHandle;
const grip = (page: Page) => page.locator('[data-testid="block-drag-handle"]');

async function hoverBlock(page: Page, n: number) {
  const box = await page.locator("[data-block-id]").nth(n).boundingBox();
  if (!box) throw new Error("block not visible");
  await page.mouse.move(box.x + 40, box.y + Math.min(12, box.height / 2));
  await grip(page).waitFor({ timeout: 2_000 });
}

test.beforeEach(async () => {
  h = await launchApp({ "Note.md": "One.\n\nTwo.\n\nThree.\n" });
  await h.openNote("Note");
});
test.afterEach(async () => {
  await h?.close();
});

test("a key pressed with the pointer resting on the grip hides it, and the next hover brings it back", async () => {
  await h.page.locator("[data-block-id]").first().click();
  await hoverBlock(h.page, 0);
  const g = await grip(h.page).boundingBox();
  await h.page.mouse.move(g!.x + g!.width / 2, g!.y + g!.height / 2);
  await sleep(50);
  await h.page.keyboard.press(`${MOD}+z`);
  await expect(grip(h.page)).toHaveCount(0);
  await hoverBlock(h.page, 1);
  await expect(grip(h.page)).toHaveAttribute(
    "data-target-block",
    (await h.page.locator("[data-block-id]").nth(1).getAttribute("data-block-id")) as string,
  );
});

test("a press on the grip that loses the window never becomes a drag, and the grip still shows", async () => {
  await hoverBlock(h.page, 0);
  const g = await grip(h.page).boundingBox();
  await h.page.mouse.move(g!.x + g!.width / 2, g!.y + g!.height / 2);
  await h.page.mouse.down();
  // Cmd-Tab: the window blurs with the button still down, and the release
  // lands in another app.
  await h.page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await h.page.mouse.move(g!.x + 60, g!.y + 80, { steps: 6 });
  await sleep(100);
  expect(await h.page.evaluate(() => document.body.classList.contains("block-dragging"))).toBe(
    false,
  );
  await h.page.mouse.up();
  await hoverBlock(h.page, 2);
  await expect(grip(h.page)).toBeVisible();
  // And a click still lands in the note rather than dropping a block.
  await h.page.locator("[data-block-id]").nth(2).click();
  await h.page.keyboard.type("!");
  await expect(h.page.locator("[data-block-id]").nth(2)).toHaveText(/Three\.!|!Three\./);
  expect((await h.page.locator("[data-block-id]").allInnerTexts()).slice(0, 3)).toEqual([
    "One.",
    "Two.",
    "Three.!",
  ]);
});
