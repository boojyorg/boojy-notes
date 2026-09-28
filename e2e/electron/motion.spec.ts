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
import { expect, test } from "@playwright/test";
import { launchApp } from "./harness";

const menuItem = (h: { page: import("@playwright/test").Page }) =>
  h.page.getByRole("menuitem", { name: "Cut" });

async function openEditMenuAtCorner(h: Awaited<ReturnType<typeof launchApp>>) {
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
