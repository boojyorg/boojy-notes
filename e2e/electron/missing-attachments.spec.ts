/**
 * An attachment a note links to that the vault does not hold (moved, renamed,
 * never synced): the block shows a quiet "Not found" card in its place, never
 * a card that opens nothing or a raw path in a dashed box. Find it… copies
 * the chosen file in under the name the note links to, so the note changes no
 * byte. The native picker is answered from the main process.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { type AppHandle, SETTLE_MS, launchApp, sleep } from "./harness";

const NOTE = "Before.\n\n![[report.pdf]]\n\n![[photo.png]]\n\nAfter.\n";
// A 1×1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** Page errors, less the 404 the browser logs for the missing picture itself. */
const realErrors = (h: AppHandle) =>
  h.pageErrors.filter((e) => !e.includes("Failed to load resource") || !e.includes("404"));

/** The next native open panel answers with `filePath`. */
function answerPicker(h: AppHandle, filePath: string) {
  return h.app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as never;
  }, filePath);
}

test("a missing file and a missing picture show Not found cards, and the note is untouched", async () => {
  const h = await launchApp({ "Reading.md": NOTE });
  try {
    await h.openNote("Reading");
    const cards = h.page.getByTestId("missing-attachment");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText("report.pdf");
    await expect(cards.nth(1)).toContainText("photo.png");
    await expect(cards.nth(0)).toContainText("Not found");
    await sleep(SETTLE_MS);
    expect(h.vault.read("Reading.md")).toBe(NOTE);
    expect(realErrors(h)).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Find it… copies the chosen file in under the linked name, and the card becomes the file", async () => {
  const h = await launchApp({ "Reading.md": NOTE });
  try {
    const elsewhere = path.join(path.dirname(h.vault.dir), "Downloads");
    fs.mkdirSync(elsewhere);
    fs.writeFileSync(path.join(elsewhere, "report (1).pdf"), "%PDF\n");
    fs.writeFileSync(path.join(elsewhere, "IMG_2231.png"), PNG);
    await h.openNote("Reading");
    const cards = h.page.getByTestId("missing-attachment");
    await expect(cards).toHaveCount(2);

    // The file: a click on the card.
    await answerPicker(h, path.join(elsewhere, "report (1).pdf"));
    await cards.filter({ hasText: "report.pdf" }).click();
    await expect(cards).toHaveCount(1);
    expect(h.vault.read("attachments/report.pdf")).toBe("%PDF\n");

    // The picture: the ··· menu's Find it….
    await answerPicker(h, path.join(elsewhere, "IMG_2231.png"));
    await cards.getByRole("button", { name: "Attachment options" }).click();
    await h.page.getByRole("menuitem", { name: "Find it…" }).click();
    await expect(cards).toHaveCount(0);
    await expect(h.page.locator('img[src*="photo.png"]')).toBeVisible();

    await sleep(SETTLE_MS);
    expect(h.vault.read("Reading.md")).toBe(NOTE);
    expect(realErrors(h)).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Remove takes the missing attachment's block out of the note", async () => {
  const h = await launchApp({ "Reading.md": NOTE });
  try {
    await h.openNote("Reading");
    const cards = h.page.getByTestId("missing-attachment");
    await cards.filter({ hasText: "report.pdf" }).click({ button: "right" });
    await h.page.getByRole("menuitem", { name: "Remove" }).click();
    await expect(cards).toHaveCount(1);
    await expect
      .poll(() => h.vault.read("Reading.md"), { timeout: 5_000 })
      .toBe("Before.\n\n![[photo.png]]\n\nAfter.\n");
    expect(realErrors(h)).toEqual([]);
  } finally {
    await h.close();
  }
});
