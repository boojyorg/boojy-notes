/**
 * A note edited while its own write is in flight must still reach disk.
 *
 * The flush writes dirty notes one after another and cleared each note's dirty
 * mark when its write returned, whatever had happened meanwhile. An edit that
 * landed during the flush re-marked the note and scheduled the next flush,
 * which then found nothing to write: the newer text stayed on screen and the
 * older on disk until quit or blur. A single write is over in ~10ms, so the
 * window is widened here the way a user can widen it: a bulk move marks many
 * notes dirty at once and the flush writes them in turn, and a keystroke in
 * the open note lands while notes ahead of it are still being written.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  MOD,
  expectNoteMatchesDisk,
  launchApp,
  moveNoteToFolder,
  sleep,
  waitForFile,
  type AppHandle,
} from "./harness";

const COUNT = 150;
const TARGET = "Zz Target";
const REMAINING_WHEN_TYPING = 45;

let h: AppHandle;

test.afterEach(async () => {
  await h?.close();
});

test("a keystroke that lands while a bulk move is still writing reaches disk", async () => {
  const seed: Record<string, string> = {
    "Box/Keep.md": "Kept.\n",
    [`${TARGET}.md`]: "Target line.\n",
  };
  for (let i = 1; i <= COUNT; i++) seed[`Note ${String(i).padStart(3, "0")}.md`] = "Line.\n";
  h = await launchApp(seed);
  await h.openNote(TARGET);

  // Select every root note (the open one included) and drag them all into Box.
  const rows = h.page.locator("[data-note-id]");
  await rows.first().click({ modifiers: [MOD] });
  await rows.last().click({ modifiers: ["Shift"] });
  // The shift-click scrolled to the bottom; the row to drag and the folder to
  // drop on both live at the top.
  await rows.first().scrollIntoViewIfNeeded();
  const firstTitle = (await rows.first().innerText()).trim();
  await moveNoteToFolder(h.page, firstTitle, "Box");

  // The flush relocates one file per write. Type once most of them have
  // moved, so the keystroke's commit lands while the target's turn is still
  // ahead, and its own debounced flush would fire only after that turn.
  const box = path.join(h.vault.dir, "Box");
  const t0 = Date.now();
  while (fs.readdirSync(box).length < COUNT + 2 - REMAINING_WHEN_TYPING) {
    if (Date.now() - t0 > 20_000) throw new Error("bulk move did not progress");
    await sleep(5);
  }
  // Focus the block directly rather than through a click: a click's
  // actionability checks take long enough to miss the window.
  await h.page.evaluate(() => {
    const el = document.querySelector("[data-block-id]") as HTMLElement;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await h.page.keyboard.type(" x");
  const typedAt = Date.now() - t0;

  const file = path.join("Box", `${TARGET}.md`);
  await waitForFile(h.vault.file(file), (t) => t.includes("Target line. x"), {
    label: `typed text to reach ${file} (typed at ${typedAt}ms)`,
    timeout: 8_000,
  });
  await expectNoteMatchesDisk(h.page, h.vault, file);
  expect(h.pageErrors).toEqual([]);
});
