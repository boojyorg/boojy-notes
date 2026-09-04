/**
 * Once a note has been persisted and has not changed since, quitting or
 * blurring must not write it again.
 *
 * Reproduces the review finding where the quit flush rewrote every note edited
 * during the session, not just the one with pending keystrokes. Every touched
 * file got a fresh mtime in write order, so "Most recent" reshuffled after
 * each restart and any tool watching the folder saw phantom edits. Needs the
 * real app: the write debounce, the quit handshake and file mtimes are the
 * whole story.
 */
import { expect, test } from "@playwright/test";
import {
  END_OF_LINE,
  SETTLE_MS,
  expectNoTempFiles,
  launchApp,
  sleep,
  waitForFile,
} from "./harness";

test("quit and blur leave an already-persisted note untouched, and still save pending work", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n", "Beta.md": "Beta body.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" edited");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes(" edited"), {
      label: "Alpha to persist",
    });
    await sleep(SETTLE_MS);
    const alphaMtime = h.vault.mtimeMs("Alpha.md");

    // Switching apps blurs the window and flushes; nothing changed, so nothing
    // should be written.
    await h.page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await sleep(SETTLE_MS);
    expect(h.vault.mtimeMs("Alpha.md"), "Alpha rewritten on blur").toBe(alphaMtime);

    // Type into Beta and quit before its debounces have fired.
    await h.openNote("Beta");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    const betaMtimeBefore = h.vault.mtimeMs("Beta.md");
    await h.page.keyboard.type(" pending");
    await h.quit();

    expect(h.vault.read("Beta.md").trimEnd(), "pending text saved on quit").toBe(
      "Beta body. pending",
    );
    expect(h.vault.mtimeMs("Beta.md")).toBeGreaterThan(betaMtimeBefore);
    expect(h.vault.mtimeMs("Alpha.md"), "Alpha rewritten on quit").toBe(alphaMtime);
    expect(h.vault.read("Alpha.md").trimEnd()).toBe("Alpha body. edited");
    expectNoTempFiles(h.vault);
  } finally {
    await h.close();
  }
});
