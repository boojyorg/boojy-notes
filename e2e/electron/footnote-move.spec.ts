/**
 * Move footnotes to bottom (right-click, Format › Move Footnotes to Bottom):
 * every footnote under the note's last line, in number order, as one commit
 * that one undo takes back byte for byte. It waits for the note as its file
 * holds it to be kept in its history first ("Before moving footnotes"), and
 * moves nothing when that or the write before it fails, or when the note
 * changed or was left while it waited.
 */
import { expect, test } from "@playwright/test";
import {
  type AppHandle,
  END_OF_LINE,
  launchApp,
  MOD,
  menuClick,
  menuEnabled,
  sleep,
  waitForFile,
} from "./harness";

let h: AppHandle;

test.afterEach(async () => {
  await h?.close();
});

const NOTE = "One.[^b] Two.[^a]\n\n[^a]: Ay.\n\nMiddle.\n\n[^b]: Bee.\n";
const MOVED = "One.[^b] Two.[^a]\n\nMiddle.\n\n[^b]: Bee.\n[^a]: Ay.\n";

async function open() {
  h = await launchApp({ "F.md": NOTE, "Other.md": "Other.\n" });
  await h.openNote("F");
  // The caret in the note, as a reader's would be.
  await h.page.locator("[data-editor] > [data-block-id]").filter({ hasText: "Middle." }).click();
}
const file = () => h.vault.read("F.md");
const toast = (text: string) => h.page.locator("[data-toast-kind]").filter({ hasText: text });

/**
 * Hold the main process's answer to `history-mark` until the returned
 * function is called, then answer with `answer` (or the real handler's).
 */
async function holdMark(answer?: unknown): Promise<() => Promise<void>> {
  await h.app.evaluate(({ ipcMain }, answer) => {
    type Handler = (...args: unknown[]) => unknown;
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })
      ._invokeHandlers;
    const mark = handlers.get("history-mark") as Handler;
    const g = globalThis as unknown as { releaseMark?: () => void; marks?: number };
    g.marks = 0;
    const held = new Promise<void>((resolve) => {
      g.releaseMark = resolve;
    });
    handlers.set("history-mark", async (...args) => {
      g.marks = (g.marks ?? 0) + 1;
      if (g.marks === 1) await held;
      return answer ?? mark(...args);
    });
  }, answer);
  return () =>
    h.app.evaluate(() => (globalThis as unknown as { releaseMark: () => void }).releaseMark());
}
const marks = () => h.app.evaluate(() => (globalThis as unknown as { marks: number }).marks);

test("right-click moves the footnotes under the note in number order; a version is kept first; one undo restores the bytes", async () => {
  await open();
  await expect.poll(() => menuEnabled(h, "moveFootnotes")).toBe(true);
  await h.page
    .locator("[data-editor] > [data-block-id]")
    .filter({ hasText: "Middle." })
    .getByText("Middle.")
    .click({ button: "right" });
  await h.page.getByRole("menuitem", { name: "Move footnotes to bottom" }).click();
  await waitForFile(h.vault.file("F.md"), (t) => t === MOVED, { label: "the moved note" });
  await expect(toast("Footnotes moved to the bottom")).toBeVisible();

  // In place now: the Format item greys, the right-click row goes.
  await expect.poll(() => menuEnabled(h, "moveFootnotes")).toBe(false);
  await h.page.getByText("Middle.").click({ button: "right" });
  await expect(h.page.getByRole("menuitem", { name: "Insert footnote" })).toBeVisible();
  await expect(h.page.getByRole("menuitem", { name: "Move footnotes to bottom" })).toHaveCount(0);
  await h.page.keyboard.press("Escape");

  // The note as it was is in its history.
  await h.page.locator("button[aria-label='Note actions']").click();
  await h.page.getByRole("menuitem", { name: /Version History/ }).click();
  const list = h.page.getByRole("listbox", { name: "Versions" });
  await expect(list.getByRole("option").nth(1)).toContainText("Before moving footnotes");
  await h.page.keyboard.press("Escape");

  await h.page.getByText("Middle.").click();
  await h.page.keyboard.press(`${MOD}+z`);
  await waitForFile(h.vault.file("F.md"), (t) => t === NOTE, { label: "the undone note" });
  expect(h.pageErrors).toEqual([]);
});

test("Format › Move Footnotes to Bottom writes a pending edit first and moves it with the note", async () => {
  await open();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(" Typed");
  await menuClick(h, "moveFootnotes");
  await waitForFile(h.vault.file("F.md"), (t) => t === MOVED.replace("Middle.", "Middle. Typed"), {
    label: "the moved note with the edit",
  });
});

test("a safety save that fails moves nothing and says so", async () => {
  await open();
  const release = await holdMark({ ok: false, reason: "failed" });
  await menuClick(h, "moveFootnotes");
  await release();
  await expect(toast("Footnotes not moved")).toBeVisible();
  await sleep(1500);
  expect(file()).toBe(NOTE);
  await expect(h.page.locator('[data-editor] [data-block-type="footnote"]').first()).toContainText(
    "Ay.",
  );
});

test("a save that fails before it moves nothing and says so", async () => {
  await open();
  await h.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, () => unknown> })
      ._invokeHandlers;
    handlers.set("write-note", () => {
      throw new Error("disk full");
    });
  });
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(" Typed");
  await menuClick(h, "moveFootnotes");
  await expect(toast("Footnotes not moved")).toBeVisible();
  expect(file()).toBe(NOTE);
  await expect(h.page.getByText("Middle. Typed")).toBeVisible();
});

test("typing while the safety save is answered: written and kept again, then moved", async () => {
  await open();
  const release = await holdMark();
  await menuClick(h, "moveFootnotes");
  await expect.poll(marks).toBe(1);
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(" Typed");
  await release();
  await waitForFile(h.vault.file("F.md"), (t) => t === MOVED.replace("Middle.", "Middle. Typed"), {
    label: "the moved note with the edit",
  });
  expect(await marks()).toBe(2);
});

test("another note opened while the safety save is answered: nothing moves", async () => {
  await open();
  const release = await holdMark();
  await menuClick(h, "moveFootnotes");
  await expect.poll(marks).toBe(1);
  await h.openNote("Other");
  await release();
  await sleep(1500);
  expect(file()).toBe(NOTE);
  await expect(toast("Footnotes")).toHaveCount(0);
});
