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

// A nested item's grip stands by its own marker, as a top-level one does by
// its (`data-indent`); a quote's stays by its bar at the column's edge.
const NESTED =
  "- A\n  - B\n    - C\n\n1. One\n   10. Deep ten\n\n- [ ] Task\n  - [ ] Nested task\n\n> Quote\n\nPara.\n\n10. Ten\n";

test("a nested block's grip keeps the top-level gap to its own marker; a quote's and a paragraph's stay at the edge", async () => {
  const g = await launchApp({ "Nested.md": NESTED });
  try {
    await g.openNote("Nested");
    const rows = g.page.locator("[data-editor] > [data-block-id]");
    await rows.first().waitFor();
    /** The grip's right edge, and where block `text`'s marker ink starts. */
    const measure = async (text: string) => {
      // Exact: `hasText` is a case-blind substring ("Ten" in "Deep ten").
      const row = rows.filter({ has: g.page.getByText(text, { exact: true }) });
      await expect(row).toHaveCount(1);
      const box = (await row.boundingBox())!;
      await g.page.mouse.move(box.x + 120, box.y + Math.min(10, box.height / 2));
      const id = await row.getAttribute("data-block-id");
      const handle = g.page.locator(`[data-testid="block-drag-handle"][data-target-block="${id}"]`);
      await handle.waitFor({ timeout: 2_000 });
      const hb = (await handle.boundingBox())!;
      const ink = await row.evaluate((el) => {
        const mark = el.querySelector("[data-marker], .checkbox-hit");
        if (mark) return mark.getBoundingClientRect().left;
        // A number: its characters' own left, which a wide one moves past the column's.
        const t = el.firstElementChild?.firstChild;
        if (t?.nodeType === Node.TEXT_NODE) {
          const r = document.createRange();
          r.selectNodeContents(t);
          return r.getBoundingClientRect().left;
        }
        return el.getBoundingClientRect().left;
      });
      return { grip: hb.x + hb.width, gap: ink - (hb.x + hb.width) };
    };

    const a = await measure("A");
    for (const t of ["B", "C"])
      expect(Math.abs((await measure(t)).gap - a.gap)).toBeLessThanOrEqual(1);
    const b = await measure("B");
    expect(b.grip).toBeGreaterThan(a.grip + 20);

    // A number wider than its column never meets the grip, at any depth.
    const ten = await measure("Ten");
    const deep = await measure("Deep ten");
    // Both are drawn `10.` (a list's first number is its own; Para. ends the one above).
    for (const t of ["Ten", "Deep ten"]) {
      const row = rows.filter({ has: g.page.getByText(t, { exact: true }) });
      await expect(row).toContainText("10.");
    }
    expect(ten.gap).toBeGreaterThan(0);
    expect(Math.abs(deep.gap - ten.gap)).toBeLessThanOrEqual(1);

    const task = await measure("Task");
    expect(Math.abs((await measure("Nested task")).gap - task.gap)).toBeLessThanOrEqual(1);
    // The nested box still ticks.
    const box = rows
      .filter({ has: g.page.getByText("Nested task", { exact: true }) })
      .locator(".checkbox-hit");
    await box.click();
    await expect(box).toHaveAttribute("aria-checked", "true");

    const para = await measure("Para.");
    expect(Math.abs((await measure("Quote")).grip - para.grip)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.grip - para.grip)).toBeLessThanOrEqual(1);
  } finally {
    await g.close();
  }
});
