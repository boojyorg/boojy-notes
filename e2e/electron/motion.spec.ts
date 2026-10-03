/**
 * The small clock's two promises, checked in the real app with motion on
 * (the rest of the suite runs with reduced motion, so nothing races a fade).
 *
 *  - A menu is placed by its resting size, not by the size it has a frame
 *    into growing: in the corner it still clears the window by its margin.
 *  - A surface is gone the moment it closes, and what fades is a copy that
 *    nothing can reach: inert, hidden from assistive tech, no ids, no pointer.
 *    The timing itself is CSS and is not sampled here.
 */
import { expect, test, type Page } from "@playwright/test";
import { launchApp, type AppHandle } from "./harness";

const menuItem = (h: { page: Page }) => h.page.getByRole("menuitem", { name: "Cut" });

async function openEditMenuAtCorner(h: AppHandle) {
  await h.openNote("Alpha");
  await h.page.evaluate(() => {
    const editor = document.querySelector("[data-editor]") as HTMLElement;
    editor.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: window.innerWidth - 6,
        clientY: window.innerHeight - 6,
      }),
    );
  });
  await menuItem(h).waitFor();
}

test("a menu opened in the corner is placed by its resting size", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" }, { motion: true });
  try {
    await openEditMenuAtCorner(h);
    // The menu is still arriving (0.96 and growing), so its rect is short of
    // what it will rest at; measured at rest, it clears the window by its
    // margin only if it was placed by that resting size.
    const margins = await h.page.evaluate(() => {
      const menu = document.querySelector('[role="menu"].motion-pop') as HTMLElement;
      menu.style.setProperty("scale", "1", "important");
      const r = menu.getBoundingClientRect();
      menu.style.removeProperty("scale");
      return {
        right: Math.round(window.innerWidth - r.right),
        bottom: Math.round(window.innerHeight - r.bottom),
      };
    });
    expect(margins).toEqual({ right: 8, bottom: 8 });
  } finally {
    await h.close();
  }
});

test("a closed menu is gone at once and leaves an unreachable copy that removes itself", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" }, { motion: true });
  try {
    await openEditMenuAtCorner(h);
    // The copy lives ~150ms, less than a poll: record it as it arrives.
    await h.page.evaluate(() => {
      const seen: Record<string, unknown>[] = [];
      (window as unknown as { __ghosts: typeof seen }).__ghosts = seen;
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes) {
            const el = node as HTMLElement;
            if (!el.classList?.contains("motion-ghost")) continue;
            seen.push({
              inert: el.hasAttribute("inert"),
              hidden: el.getAttribute("aria-hidden"),
              ids: el.querySelectorAll("[id]").length,
              data: [el, ...el.querySelectorAll("*")].filter((n) =>
                n.getAttributeNames().some((a) => a.startsWith("data-")),
              ).length,
              pointer: getComputedStyle(el).pointerEvents,
              text: el.textContent,
            });
          }
      }).observe(document.body, { childList: true });
    });
    await h.page.keyboard.press("Escape");
    // The real one is gone now, not after the fade.
    await expect(menuItem(h)).toHaveCount(0);

    await expect
      .poll(() =>
        h.page.evaluate(() => (window as unknown as { __ghosts: unknown[] }).__ghosts.length),
      )
      .toBe(1);
    const [ghost] = await h.page.evaluate(
      () => (window as unknown as { __ghosts: Record<string, unknown>[] }).__ghosts,
    );
    expect(ghost).toMatchObject({ inert: true, hidden: "true", ids: 0, data: 0, pointer: "none" });
    expect(String(ghost.text)).toContain("Cut");

    await expect(h.page.locator(".motion-ghost")).toHaveCount(0);
  } finally {
    await h.close();
  }
});

test("Settings leaves its scrim and its pane as copies, and is gone at once", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" }, { motion: true });
  try {
    await h.page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __ghosts: string[] }).__ghosts = seen;
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes) {
            const el = node as HTMLElement;
            if (el.classList?.contains("motion-ghost")) seen.push(el.className);
          }
      }).observe(document.body, { childList: true });
    });
    await h.page.getByTestId("wordmark-settings-button").click();
    const settings = h.page.getByRole("dialog", { name: "Settings" });
    await settings.waitFor();
    await h.page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
    await expect
      .poll(() =>
        h.page.evaluate(() => (window as unknown as { __ghosts: string[] }).__ghosts.length),
      )
      .toBe(2);
    await expect(h.page.locator(".motion-ghost")).toHaveCount(0);
  } finally {
    await h.close();
  }
});

test("first-run setup arrives as a dialog and leaves its scrim and itself as copies", async () => {
  const h = await launchApp({}, { firstRun: true, motion: true });
  try {
    const setup = h.page.getByRole("dialog", { name: "Welcome to Boojy Notes" });
    await setup.waitFor();
    await expect(setup).toHaveClass(/motion-pop/);
    await h.page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { __ghosts: string[] }).__ghosts = seen;
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes) {
            const el = node as HTMLElement;
            if (el.classList?.contains("motion-ghost")) seen.push(el.className);
          }
      }).observe(document.body, { childList: true });
    });
    await h.page.keyboard.press("Escape");
    await expect(setup).toHaveCount(0);
    await expect
      .poll(() =>
        h.page.evaluate(() => (window as unknown as { __ghosts: string[] }).__ghosts.length),
      )
      .toBe(2);
    await expect(h.page.locator(".motion-ghost")).toHaveCount(0);
  } finally {
    await h.close();
  }
});

test("reduced motion leaves no copy at all", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    await openEditMenuAtCorner(h);
    await h.page.keyboard.press("Escape");
    await expect(menuItem(h)).toHaveCount(0);
    await expect(h.page.locator(".motion-ghost")).toHaveCount(0);
  } finally {
    await h.close();
  }
});

/**
 * A reorder settles: each block that changed place is drawn back where it was
 * and glides to where it now is. The frame that starts the glide must already
 * hold the new order (else nothing moves, and the old order is painted once
 * more), so what is checked is each animation's start, recorded as it is made:
 * the distance the block travels, and the note's order at that moment.
 */
type Settle = { text: string; translate: string; opacity: number; order: string[] };

async function recordSettles(page: Page) {
  await page.evaluate(() => {
    const seen: Settle[] = [];
    (window as unknown as { __settles: Settle[] }).__settles = seen;
    const real = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const first = (frames as Keyframe[])[0] ?? {};
      if (this instanceof HTMLElement && this.dataset.blockId && first.translate) {
        seen.push({
          text: (this.textContent ?? "").trim(),
          translate: String(first.translate),
          opacity: Number(first.opacity),
          order: [...document.querySelectorAll("[data-editor] > [data-block-id]")]
            .map((b) => (b.textContent ?? "").trim())
            .filter(Boolean),
        });
      }
      return real.call(this, frames, options);
    };
  });
}

const settles = (page: Page) =>
  page.evaluate(() => (window as unknown as { __settles: Settle[] }).__settles);

/** How far a settle starts from its place, in px (negative: from above). */
const travel = (s: Settle) => Number.parseFloat(s.translate.split(" ")[1]);

test("Cmd+Shift+Down trades two blocks by gliding, from the new order", async () => {
  const h = await launchApp({ "Alpha.md": "One\n\nTwo\n\nThree\n" }, { motion: true });
  try {
    await h.openNote("Alpha");
    await recordSettles(h.page);
    await h.page.locator('[data-block-type="p"]', { hasText: "One" }).click();
    await h.page.keyboard.press("ControlOrMeta+Shift+ArrowDown");
    await expect.poll(() => settles(h.page).then((s) => s.length)).toBe(2);
    const [a, b] = await settles(h.page);
    const byText = Object.fromEntries([a, b].map((s) => [s.text, s]));
    expect(a.order).toEqual(["Two", "One", "Three"]);
    // One went down, so it starts above its new place; Two the reverse.
    expect(travel(byText.One)).toBeLessThan(0);
    expect(travel(byText.Two)).toBeGreaterThan(0);
    // Nothing is left on the blocks once they have settled.
    await expect.poll(() => h.page.evaluate(() => document.getAnimations().length)).toBe(0);
  } finally {
    await h.close();
  }
});

test("a dropped block settles from where its copy was, as translucent, and the copy is gone", async () => {
  const h = await launchApp({ "Alpha.md": "One\n\nTwo\n\nThree\n" }, { motion: true });
  try {
    await h.openNote("Alpha");
    await recordSettles(h.page);
    const page = h.page;
    const one = page.locator('[data-block-type="p"]', { hasText: "One" });
    const three = page.locator('[data-block-type="p"]', { hasText: "Three" });
    const oneBox = await one.boundingBox();
    const threeBox = await three.boundingBox();
    if (!oneBox || !threeBox) throw new Error("blocks not visible");
    const id = await one.getAttribute("data-block-id");
    await page.mouse.move(oneBox.x + 40, oneBox.y + oneBox.height / 2);
    const grip = page.locator(`[data-testid="block-drag-handle"][data-target-block="${id}"]`);
    await grip.waitFor({ timeout: 2_000 });
    const g = await grip.boundingBox();
    if (!g) throw new Error("grip not visible");
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 + 8, { steps: 2 });
    await page.waitForFunction(() => document.body.classList.contains("block-dragging"));
    // Past Three's middle, and a little further so the copy is below the slot.
    await page.mouse.move(g.x + g.width / 2, threeBox.y + threeBox.height + 12, { steps: 6 });
    await page.mouse.up();

    await expect.poll(() => settles(page).then((s) => s.length)).toBe(3);
    const all = await settles(page);
    const dropped = all.find((s) => s.text === "One");
    expect(dropped?.order).toEqual(["Two", "Three", "One"]);
    expect(dropped?.opacity).toBeCloseTo(0.35);
    // The neighbours it passed move up into its old place.
    for (const s of all.filter((s) => s.text !== "One")) expect(travel(s)).toBeGreaterThan(0);
    await expect(page.locator("body > div[style*='position: fixed'] [data-block-id]")).toHaveCount(
      0,
    );
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  } finally {
    await h.close();
  }
});
