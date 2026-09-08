/**
 * One owner for note state. Every change to a note (typing, a block drop, a
 * move between folders, the vault as the disk holds it) goes through
 * useHistory, which keeps the keystroke ref and React state together; and
 * history is the editor's: undo restores the text, never a location, and
 * never a note that no longer exists.
 *
 * Reproduces the review class where the sidebar move, the block drop, the
 * rebuild after an outside delete and the vault switch all used the raw
 * state setter: a change made inside the 300ms text-commit window was
 * reverted when the commit republished the keystroke ref, and undo could
 * carry an old folder or an old vault's note back into a write. Needs the
 * real app: the seams are the text-commit debounce, the write debounce, the
 * watcher and the main process's vault switch.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import {
  END_OF_LINE,
  MOD,
  SETTLE_MS,
  expectNoTempFiles,
  launchApp,
  moveNoteToFolder,
  noteText,
  sidebarNoteTitles,
  sleep,
  waitForFile,
} from "./harness";

/** Force the renderer to produce one compositor frame, so pending animation-frame callbacks run. */
async function pumpFrame(page: Page) {
  await page.screenshot({ type: "jpeg", quality: 10 }).catch(() => {});
}

test("undo after moving the open note into a folder undoes the typing and leaves the file where it was moved", async () => {
  const h = await launchApp({
    "Journal.md": "Today was fine.\n",
    "Work/Other.md": "Elsewhere.\n",
  });
  try {
    await h.openNote("Journal");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" A");
    await waitForFile(h.vault.file("Journal.md"), (t) => t.includes(" A"), {
      label: "typed text to save",
    });

    await moveNoteToFolder(h.page, "Journal", "Work");
    await expect.poll(() => h.vault.exists("Work/Journal.md")).toBe(true);
    await sleep(SETTLE_MS);
    expect(h.vault.exists("Journal.md")).toBe(false);

    // Drag never navigates: the note is still open. Undo the typing.
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press(`${MOD}+z`);
    await waitForFile(h.vault.file("Work/Journal.md"), (t) => !t.includes(" A"), {
      label: "undo to save in the folder",
    });
    await sleep(SETTLE_MS);

    expect(await noteText(h.page)).toBe("Today was fine.");
    // Before: the undo snapshot carried `folder: null`, and the write moved
    // the file back to the root.
    expect(h.vault.exists("Journal.md")).toBe(false);
    expect(h.vault.read("Work/Journal.md")).toBe("Today was fine.\n");
    expectNoTempFiles(h.vault);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a block dropped right after a keystroke keeps both the typed text and the new order", async () => {
  const h = await launchApp({ "List.md": "One\n\nTwo\n\nThree\n" });
  try {
    await h.openNote("List");
    const blocks = h.page.locator("[data-block-id]");
    await blocks.first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" typed");

    // Straight into the drag, inside the text-commit window: hover the third
    // block to reveal its gutter grip, lift it and drop it above the first.
    const third = await blocks.nth(2).boundingBox();
    const first = await blocks.nth(0).boundingBox();
    if (!third || !first) throw new Error("blocks not visible");
    // The grip follows the pointer on an animation frame, and the hidden test
    // window on the Linux runner produces no frames on its own (the grip
    // stayed on the clicked block there for 30 s); a screenshot request
    // forces one. The grip already showing for the clicked block is not the
    // one to press.
    const thirdId = await blocks.nth(2).getAttribute("data-block-id");
    const grip = h.page.locator(
      `[data-testid="block-drag-handle"][data-target-block="${thirdId}"]`,
    );
    for (let i = 0; i < 20 && (await grip.count()) === 0; i++) {
      await h.page.mouse.move(third.x + 40 + (i % 2), third.y + third.height / 2);
      await pumpFrame(h.page);
    }
    await grip.waitFor({ timeout: 2_000 });
    const gripBox = await grip.boundingBox();
    if (!gripBox) throw new Error("grip not visible");
    const gx = gripBox.x + gripBox.width / 2;
    const gy = gripBox.y + gripBox.height / 2;
    await h.page.mouse.move(gx, gy);
    await h.page.mouse.down();
    // The drag lifts on the first real movement; carry only once it has.
    await h.page.mouse.move(gx, gy - 8, { steps: 2 });
    await h.page.waitForFunction(() => document.body.classList.contains("block-dragging"), null, {
      timeout: 2_000,
      polling: 50,
    });
    await h.page.mouse.move(gx, first.y + 2, { steps: 4 });
    await sleep(50);
    await h.page.mouse.up();

    // Before: the drop was a raw state write, and the pending text commit
    // then republished the keystroke ref with the old order.
    await waitForFile(h.vault.file("List.md"), (t) => t === "Three\n\nOne typed\n\nTwo\n", {
      label: "reordered note with the typed text",
    });
    await sleep(SETTLE_MS);
    expect(await noteText(h.page)).toBe("Three\nOne typed\nTwo");
    expect(h.vault.read("List.md")).toBe("Three\n\nOne typed\n\nTwo\n");

    // One history entry for the drop: undo restores the order, keeps the text.
    await h.page.keyboard.press(`${MOD}+z`);
    await waitForFile(h.vault.file("List.md"), (t) => t === "One typed\n\nTwo\n\nThree\n", {
      label: "undo of the drop",
    });
    expectNoTempFiles(h.vault);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a note deleted outside while typing in another: the typing is saved in full, the deleted note stays gone, untouched notes are not rewritten", async () => {
  const h = await launchApp({
    "Alpha.md": "Alpha.\n",
    "Beta.md": "Beta.\n",
    "Gamma.md": "Gamma.\n",
  });
  try {
    const gammaMtime = h.vault.mtimeMs("Gamma.md");
    await h.openNote("Beta");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" one");
    fs.unlinkSync(h.vault.file("Alpha.md"));
    // Keep the text commit pending while the delete arrives and the vault is
    // rebuilt from disk: every keystroke re-arms the 300ms window.
    await h.page.keyboard.type(" two three four", { delay: 80 });

    await waitForFile(h.vault.file("Beta.md"), (t) => t === "Beta. one two three four\n", {
      label: "the whole typed text to save",
    });
    await expect
      .poll(() => sidebarNoteTitles(h.page), { timeout: 5_000 })
      .toEqual(["Beta", "Gamma"]);
    await sleep(SETTLE_MS);

    // Before: the rebuild was a raw state write; the pending commit then
    // republished the keystroke ref, which still held Alpha, and every
    // rebuilt note read as changed: Alpha was written to a fresh file and
    // Gamma rewritten.
    expect(h.vault.list()).toEqual(["Beta.md", "Gamma.md"]);
    expect(h.vault.mtimeMs("Gamma.md")).toBe(gammaMtime);
    expect(await noteText(h.page)).toBe("Beta. one two three four");
    expectNoTempFiles(h.vault);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("switching vault with unsaved edits writes them into the old vault, and undo afterwards writes nothing into the new one", async () => {
  const h = await launchApp({ "Journal.md": "Today was fine.\n" });
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-e2e-other-"));
  try {
    fs.writeFileSync(path.join(other, "Theirs.md"), "Their note.\n");
    // The folder picker is native; answer it from the main process.
    await h.app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
    }, other);

    await h.openNote("Journal");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" A");
    // Straight to Settings → Storage → Change, inside the write debounce.
    await h.page.getByTestId("wordmark-settings-button").click();
    await h.page.getByRole("button", { name: "Change" }).click();

    await expect.poll(() => sidebarNoteTitles(h.page), { timeout: 5_000 }).toEqual(["Theirs"]);
    // The old vault got the edit before the switch.
    expect(h.vault.read("Journal.md")).toBe("Today was fine. A\n");

    await h.page.getByRole("button", { name: "Close settings" }).click();
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(`${MOD}+z`);
    await sleep(SETTLE_MS);

    // Before: undo restored the old vault's note into state, and the dirty
    // scan wrote it into the new vault as a new file.
    expect(fs.readdirSync(other).sort()).toEqual(["Theirs.md"]);
    expect(fs.readFileSync(path.join(other, "Theirs.md"), "utf8")).toBe("Their note.\n");
    expect(h.vault.list()).toEqual(["Journal.md"]);
    expect(h.vault.read("Journal.md")).toBe("Today was fine. A\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
    fs.rmSync(other, { recursive: true, force: true });
  }
});
