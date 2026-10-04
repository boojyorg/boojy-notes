/**
 * Back and Forward through the notes opened (⌘[ / ⌘], Alt+← / → off the Mac,
 * View → Back / Forward): a step only moves the place, opening a note drops
 * what was ahead, a note deleted since is stepped over. Held in memory only.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { launchApp, menuClick, menuEnabled } from "./harness";

const BACK = process.platform === "darwin" ? "Meta+BracketLeft" : "Alt+ArrowLeft";
const FORWARD = process.platform === "darwin" ? "Meta+BracketRight" : "Alt+ArrowRight";

test("back and forward walk the notes opened; a new opening drops Forward; a deleted note is skipped", async () => {
  const h = await launchApp({
    "Apple.md": "A.\n",
    "Banana.md": "B.\n",
    "Cherry.md": "C.\n",
    "Damson.md": "D.\n",
  });
  try {
    const name = h.page.getByRole("textbox", { name: "Note title" });
    for (const t of ["Apple", "Banana", "Cherry"]) {
      await h.openNote(t);
      await expect(name).toHaveText(t);
    }
    await expect.poll(() => menuEnabled(h, "forward")).toBe(false);
    await expect.poll(() => menuEnabled(h, "back")).toBe(true);

    await h.page.keyboard.press(BACK);
    await expect(name).toHaveText("Banana");
    await menuClick(h, "back");
    await expect(name).toHaveText("Apple");
    await expect.poll(() => menuEnabled(h, "back")).toBe(false);
    await h.page.keyboard.press(FORWARD);
    await expect(name).toHaveText("Banana");

    // Opening another from here drops Cherry from Forward.
    await h.openNote("Damson");
    await expect(name).toHaveText("Damson");
    await expect.poll(() => menuEnabled(h, "forward")).toBe(false);

    // Banana deleted outside: Back steps over it to Apple.
    fs.rmSync(h.vault.file("Banana.md"));
    await expect(h.page.getByRole("treeitem").filter({ hasText: "Banana" })).toHaveCount(0);
    await h.page.keyboard.press(BACK);
    await expect(name).toHaveText("Apple");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
