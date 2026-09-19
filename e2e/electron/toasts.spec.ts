/**
 * Notifications. A receipt of something that went well is a quiet surface with
 * a mark on it and goes by itself; anything the user may have to act on waits
 * to be dismissed, and ends when it stops being true. The stack sits at the
 * foot of the editor, never over the sidebar rows the action just changed.
 *
 * Needs the real app: a receipt is desktop-only (the web build has no Trash),
 * the placement depends on the live sidebar width, and a save failure is a real
 * refusal from the filesystem.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { MOD, SETTLE_MS, launchApp, sleep } from "./harness";

const seed = { "Note one.md": "One.\n", "Note two.md": "Two.\n" };

/** Where the toast stack's left edge is, and where the sidebar ends. */
async function edges(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const toast = document.querySelector("[data-toast-kind]") as HTMLElement;
    const tree = document.querySelector("[role=tree]") as HTMLElement;
    return {
      toastLeft: toast?.parentElement?.getBoundingClientRect().left ?? -1,
      sidebarRight: tree ? tree.getBoundingClientRect().right : 0,
    };
  });
}

test("a note sent to the Trash is a receipt: the Trash mark, no ×, gone by itself", async () => {
  test.skip(process.platform !== "darwin", "moves files to the OS Trash");
  const h = await launchApp(seed);
  try {
    await h.page
      .locator("[data-note-id]")
      .filter({ hasText: "Note one" })
      .click({ button: "right" });
    await h.page.getByRole("menuitem", { name: "Delete", exact: true }).click();

    const toast = h.page.locator("[data-toast-kind]");
    await expect(toast).toHaveAttribute("data-toast-kind", "done");
    await expect(toast).toContainText("moved to the Trash");
    // Its own mark, not a tick, and no × — it is going anyway.
    expect(await toast.locator("svg.lucide-trash2").count()).toBe(1);
    await expect(toast.getByRole("button", { name: "Dismiss" })).toHaveCount(0);
    // A receipt is news, not an interruption.
    await expect(toast).toHaveAttribute("role", "status");

    // The surface is the app's own, never a slab of the accent, and the message
    // is ordinary ink rather than white on the mark (about 2:1).
    const paint = await toast.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, fg: cs.color };
    });
    expect(paint.bg).not.toBe("rgb(143, 193, 198)");
    expect(paint.bg).not.toBe("rgba(143, 193, 198, 0.92)");
    expect(paint.fg).not.toBe("rgb(255, 255, 255)");

    await expect(toast).toHaveCount(0, { timeout: 6_000 });
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the stack stands at the foot of the editor, and follows the sidebar", async () => {
  test.skip(process.platform !== "darwin", "moves files to the OS Trash");
  const h = await launchApp(seed);
  try {
    await h.page
      .locator("[data-note-id]")
      .filter({ hasText: "Note one" })
      .click({ button: "right" });
    await h.page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await expect(h.page.locator("[data-toast-kind]")).toBeVisible();

    // Sidebar showing: the stack starts past the tree, so a row the deletion
    // changed is never behind it.
    const open = await edges(h.page);
    expect(open.sidebarRight).toBeGreaterThan(100);
    expect(open.toastLeft).toBeGreaterThanOrEqual(open.sidebarRight - 1);

    // Hidden: it comes back to the window's own edge. The note is opened first,
    // because its row is what a click would need.
    await h.openNote("Note two");
    await h.page.keyboard.press(`${MOD}+\\`);
    await sleep(500);
    await h.page.getByRole("button", { name: "Note actions" }).click();
    await h.page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    const collapsed = await edges(h.page);
    expect(collapsed.toastLeft).toBeLessThan(40);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a save that cannot land waits to be dismissed, and the receipt of its recovery ends it", async () => {
  const h = await launchApp({ "Note.md": "One.\n" });
  try {
    await h.openNote("Note");
    // The vault stops taking writes: the atomic save has nowhere to put its
    // temp file, so the write really fails.
    const mode = fs.statSync(h.vault.dir).mode;
    fs.chmodSync(h.vault.dir, 0o500);
    try {
      await h.page.locator("[data-block-type='p']").first().click();
      await h.page.keyboard.type(" Edited.");

      const toast = h.page.locator("[data-toast-kind]");
      await expect(toast).toHaveAttribute("data-toast-kind", "error");
      await expect(toast).toContainText("Failed to save");
      // It waits: its own × is the way out, and no timer takes it.
      await expect(toast.getByRole("button", { name: "Dismiss" })).toBeVisible();
      await sleep(5_000);
      await expect(toast).toHaveAttribute("data-toast-kind", "error");
      // One problem, one notice, however many retries have run.
      await expect(toast).toHaveCount(1);
    } finally {
      fs.chmodSync(h.vault.dir, mode);
    }

    // Writing works again: the notice is replaced by a receipt, which fades.
    await h.page.keyboard.type(" More.");
    await expect(h.page.locator("[data-toast-kind]")).toHaveAttribute("data-toast-kind", "done", {
      timeout: 10_000,
    });
    await expect(h.page.locator("[data-toast-kind]")).toContainText("Saved");
    await sleep(SETTLE_MS);
    expect(h.vault.read("Note.md")).toBe("One. Edited. More.\n");
    await expect(h.page.locator("[data-toast-kind]")).toHaveCount(0, { timeout: 6_000 });
    // The refusals the test caused are the only errors it may log.
    for (const err of h.pageErrors) expect(err).toMatch(/write failed .* EACCES/);
  } finally {
    await h.close();
  }
});
