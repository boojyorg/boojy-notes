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

// A nested item's grip is centred on its parent's marker column (the bullet,
// number or box one level up), so nested grips stand in a line under the
// markers; a top-level one stays in the gutter, in line with a paragraph's,
// and a quote's stays by its bar at the column's edge.
const NESTED =
  "- A\n  - B\n    - C\n\n1. One\n   10. Deep ten\n\n- [ ] Task\n  - [ ] Nested task\n\n> Quote\n\nPara.\n\n10. Ten\n";

test("a nested block's grip is centred on its parent's marker; a top-level one, a quote's and a paragraph's stay in the gutter", async () => {
  const g = await launchApp({ "Nested.md": NESTED });
  try {
    await g.openNote("Nested");
    const rows = g.page.locator("[data-editor] > [data-block-id]");
    await rows.first().waitFor();
    // Exact: `hasText` is a case-blind substring ("Ten" in "Deep ten").
    const row = (text: string) => rows.filter({ has: g.page.getByText(text, { exact: true }) });
    /** Block `text`'s grip, its marker column's centre and where its marker's ink starts. */
    const measure = async (text: string) => {
      await expect(row(text)).toHaveCount(1);
      await row(text).scrollIntoViewIfNeeded();
      const id = await row(text).getAttribute("data-block-id");
      const handle = g.page.locator(`[data-testid="block-drag-handle"][data-target-block="${id}"]`);
      // Hovered until its grip shows: a press elsewhere (the box's tick) can
      // still be settling, and the grip follows the pointer a frame late.
      await expect(async () => {
        const box = (await row(text).boundingBox())!;
        await g.page.mouse.move(box.x + 120, box.y + Math.min(10, box.height / 2) + 1);
        await g.page.mouse.move(box.x + 120, box.y + Math.min(10, box.height / 2));
        await expect(handle).toBeVisible({ timeout: 500 });
      }).toPass({ timeout: 5_000 });
      const hb = (await handle.boundingBox())!;
      const marker = await row(text).evaluate((el) => {
        // A list row's first child is its marker column's content, centred in
        // it (a dot, a box) or as wide as it (a number).
        const col = el.firstElementChild?.getBoundingClientRect();
        const t = el.firstElementChild?.firstChild;
        let ink = col?.left ?? el.getBoundingClientRect().left;
        if (t?.nodeType === Node.TEXT_NODE) {
          // A number's own characters: a wide one hangs past its column's left.
          const r = document.createRange();
          r.selectNodeContents(t);
          ink = r.getBoundingClientRect().left;
        }
        return { centre: col ? col.left + col.width / 2 : Number.NaN, ink };
      });
      return {
        left: hb.x,
        right: hb.x + hb.width,
        centre: hb.x + hb.width / 2,
        column: marker.centre,
        ink: marker.ink,
      };
    };
    const centredOn = (child: { centre: number }, parent: { column: number }) =>
      expect(Math.abs(child.centre - parent.column)).toBeLessThanOrEqual(1);

    const a = await measure("A");
    const b = await measure("B");
    const c = await measure("C");
    centredOn(b, a);
    centredOn(c, b);
    expect(b.ink - b.right).toBeGreaterThan(0);

    // Both are drawn `10.` (a list's first number is its own; Para. ends the one above).
    for (const t of ["Ten", "Deep ten"]) await expect(row(t)).toContainText("10.");
    const one = await measure("One");
    const deep = await measure("Deep ten");
    centredOn(deep, one);
    // A number wider than its column never meets the grip, at any depth.
    expect(deep.ink - deep.right).toBeGreaterThan(0);
    const ten = await measure("Ten");
    expect(ten.ink - ten.right).toBeGreaterThan(0);

    centredOn(await measure("Nested task"), await measure("Task"));
    // The nested box still ticks.
    const box = row("Nested task").locator(".checkbox-hit");
    await box.click();
    await expect(box).toHaveAttribute("aria-checked", "true");

    // Top level: one line of grips down the gutter, a quote's included.
    const para = await measure("Para.");
    for (const top of [a, one, ten, await measure("Quote")]) {
      expect(Math.abs(top.left - para.left)).toBeLessThanOrEqual(1);
    }
  } finally {
    await g.close();
  }
});

test("a number wider than its column, at any depth, keeps clear of its grip", async () => {
  const top = [98, 99, 100].map((n) => `${n}. n${n}`).join("\n");
  const nested = ["1. Top", ...[98, 99, 100].map((n) => `   ${n}. d${n}`)].join("\n");
  const g = await launchApp({ "Wide.md": `${top}\n\nPara.\n\n${nested}\n` });
  try {
    await g.openNote("Wide");
    const rows = g.page.locator("[data-editor] > [data-block-id]");
    await rows.first().waitFor();
    for (const t of ["n98", "n100", "d98", "d100"]) {
      const row = rows.filter({ has: g.page.getByText(t, { exact: true }) });
      await expect(row).toContainText(`${t.slice(1)}.`);
      await row.scrollIntoViewIfNeeded();
      const id = await row.getAttribute("data-block-id");
      const handle = g.page.locator(`[data-testid="block-drag-handle"][data-target-block="${id}"]`);
      await expect(async () => {
        const box = (await row.boundingBox())!;
        await g.page.mouse.move(box.x + 150, box.y + 9);
        await g.page.mouse.move(box.x + 150, box.y + 8);
        await expect(handle).toBeVisible({ timeout: 500 });
      }).toPass({ timeout: 5_000 });
      const right = await handle.evaluate((el) => el.getBoundingClientRect().right);
      const ink = await row.evaluate((el) => {
        const r = document.createRange();
        r.selectNodeContents(el.firstElementChild!.firstChild!);
        return r.getBoundingClientRect().left;
      });
      // MARKER_CLEARANCE: never closer than 2px to the number's own ink.
      expect(ink - right, t).toBeGreaterThanOrEqual(1.5);
    }
  } finally {
    await g.close();
  }
});
