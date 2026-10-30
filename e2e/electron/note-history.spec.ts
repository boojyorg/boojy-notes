/**
 * Back and Forward through the notes opened (⌘[ / ⌘], Alt+← / → off the Mac,
 * View → Back / Forward, the arrows left of the path): a step only moves the
 * place, opening a note drops what was ahead, a note deleted since is stepped
 * over. Held in memory only.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { expandAllFolders, launchApp, menuClick, menuEnabled } from "./harness";
import { PNG } from "../fixtures";

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

test("the arrows step through notes and a picture, grey where there is nowhere to go", async () => {
  const h = await launchApp(
    { "Apple.md": "A.\n", "Banana.md": "B.\n", "Cherry.md": "C.\n" },
    { prepare: (vault) => fs.writeFileSync(vault.file("whiteboard.png"), PNG) },
  );
  try {
    const name = h.page.getByRole("textbox", { name: "Note title" });
    const picture = h.page.getByTestId("picture-view");
    const back = h.page.getByRole("button", { name: "Back", exact: true });
    const forward = h.page.getByRole("button", { name: "Forward", exact: true });

    await h.openNote("Apple");
    await expect(back).toHaveAttribute("aria-disabled", "true");
    await h.openNote("Banana");
    await expandAllFolders(h.page);
    await h.page.locator('[data-file-path$="whiteboard.png"]').click();
    await expect(picture).toBeVisible();
    await h.openNote("Cherry");
    await expect(name).toHaveText("Cherry");
    await expect(forward).toHaveAttribute("aria-disabled", "true");

    await back.click();
    await expect(picture).toBeVisible();
    await back.click();
    await expect(name).toHaveText("Banana");
    // Note to note, so the same button stays under the pointer as it greys.
    await back.click();
    await expect(name).toHaveText("Apple");
    await expect(back).toHaveAttribute("aria-disabled", "true");
    await expect(back).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    // Greyed, it still takes the press (Playwright waits out `aria-disabled`
    // unless forced) and does nothing.
    await back.click({ force: true });
    await expect(name).toHaveText("Apple");
    await expect(forward).not.toHaveAttribute("aria-disabled");

    // Banana deleted outside: Forward steps over it to the picture.
    fs.rmSync(h.vault.file("Banana.md"));
    await expect(h.page.getByRole("treeitem").filter({ hasText: "Banana" })).toHaveCount(0);
    await forward.click();
    await expect(picture).toBeVisible();
    await forward.click();
    await expect(name).toHaveText("Cherry");
    await expect(forward).toHaveAttribute("aria-disabled", "true");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
