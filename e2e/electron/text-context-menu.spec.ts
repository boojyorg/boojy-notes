/**
 * The editor's right-click menu (2026-09-23): Cut, Copy and Paste on text, a
 * link's own actions above them on a link, and never the selection toolbar
 * beside it. Cut and Copy go through the editor's own cut and copy handlers
 * (what they wrote is read off the event, after the handler); Paste is the
 * main process pasting into the focused editor, so the OS clipboard is set
 * just before it.
 */
import { expect, test } from "@playwright/test";
import { SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

/** Select `from`..`to` of the first text node of the paragraph holding `text`. */
const select = (page, text: string, from: number, to: number) =>
  page.evaluate(
    ({ text, from, to }) => {
      const p = [...document.querySelectorAll("[data-editor] [data-block-id]")].find((b) =>
        b.textContent?.includes(text),
      )!;
      const node = p.firstChild!;
      const range = document.createRange();
      range.setStart(node, from);
      range.setEnd(node, to);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      const r = range.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    { text, from, to },
  );

/** Record what each cut or copy wrote, after the editor's handler has run. */
const recordClipboardEvents = (page) =>
  page.evaluate(() => {
    const w = window as unknown as { __written: string[] };
    w.__written = [];
    for (const type of ["cut", "copy"])
      window.addEventListener(type, (e) =>
        w.__written.push(`${type}:${(e as ClipboardEvent).clipboardData?.getData("text/plain")}`),
      );
  });

test("Copy and Cut from the right-click menu write what the keys write", async () => {
  const h = await launchApp({ "Alpha.md": "Hello brave world\n" });
  try {
    await h.openNote("Alpha");
    await recordClipboardEvents(h.page);
    const menu = h.page.locator(".editor-context-menu");

    const toolbar = h.page.getByRole("toolbar", { name: "Text formatting" });
    let at = await select(h.page, "Hello", 6, 11);
    await expect(toolbar).toBeVisible();
    await h.page.mouse.click(at.x, at.y, { button: "right" });
    await expect(menu).toBeVisible();
    // One surface at a time: the selection toolbar stands down for the menu.
    await expect(toolbar).toHaveCount(0);
    await menu.getByRole("menuitem", { name: /^Copy/ }).click();
    await expect(menu).toHaveCount(0);
    expect(await h.page.evaluate(() => (window as any).__written)).toEqual(["copy:brave"]);

    at = await select(h.page, "Hello", 6, 12);
    await h.page.mouse.click(at.x, at.y, { button: "right" });
    await menu.getByRole("menuitem", { name: /^Cut/ }).click();
    await waitForFile(h.vault.file("Alpha.md"), (t) => !t.includes("brave"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Hello world\n");
    expect(await h.page.evaluate(() => (window as any).__written)).toContain("cut:brave ");
  } finally {
    await h.close();
  }
});

test("Paste from the right-click menu pastes at the caret", async () => {
  const h = await launchApp({ "Alpha.md": "Hello world\n" });
  try {
    await h.openNote("Alpha");
    const at = await select(h.page, "Hello", 6, 6);
    await h.app.evaluate(({ clipboard }) => clipboard.writeText("brave "));
    await h.page.mouse.click(at.x, at.y, { button: "right" });
    const menu = h.page.locator(".editor-context-menu");
    // Nothing selected: nothing to cut or copy.
    await expect(menu.getByRole("menuitem", { name: /^Cut/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await menu.getByRole("menuitem", { name: /^Paste/ }).click();
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("brave"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Hello brave world\n");
  } finally {
    await h.close();
  }
});

test("a link's menu carries its own actions above Cut, Copy and Paste", async () => {
  const h = await launchApp({ "Alpha.md": "See [Example](https://example.com) here.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("a", { hasText: "Example" }).click({ button: "right" });
    const items = h.page.locator(".editor-context-menu [role=menuitem]");
    await expect(items).toHaveText([
      "Open link",
      "Copy link",
      "Edit link…",
      "Remove link",
      /^Cut/,
      /^Copy/,
      /^Paste/,
    ]);
    await h.page.keyboard.press("Escape");
    await expect(h.page.locator(".editor-context-menu")).toHaveCount(0);
  } finally {
    await h.close();
  }
});
