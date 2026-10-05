/**
 * A note file the app cannot edit as text (not UTF-8, here Windows-1252) is
 * listed, greyed with a mark, and opens to a line saying so instead of the
 * editor. Its bytes are never written: before, it loaded with U+FFFD in
 * place of its accented letters and the first save wrote them over the file.
 * A rename moves the file as it is.
 */
import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { SETTLE_MS, launchApp, noteText, sleep, typeAtEnd, type Vault } from "./harness";

// "Café crème" in Windows-1252: é is 0xE9 and è is 0xE8, neither UTF-8.
const CP1252 = Buffer.from("Café crème\n", "latin1");

const row = (h: { page: Page }, title: string) =>
  h.page.locator("[data-note-id]").filter({ hasText: title });

const bytes = (vault: Vault, rel: string) => fs.readFileSync(vault.file(rel));

test("a note that is not UTF-8 is listed and shown as unreadable, and its bytes are never written", async () => {
  const h = await launchApp(
    { "Good.md": "Good text.\n" },
    { prepare: (vault: Vault) => fs.writeFileSync(vault.file("Old.md"), CP1252) },
  );
  try {
    await expect(row(h, "Old").getByTestId("unreadable-mark")).toBeVisible();
    await expect(row(h, "Good").getByTestId("unreadable-mark")).toHaveCount(0);

    await row(h, "Old").click();
    await expect(h.page.getByTestId("unreadable-note")).toBeVisible();

    await h.openNote("Good");
    await typeAtEnd(h.page, " More.");
    await sleep(SETTLE_MS);
    expect(h.vault.read("Good.md")).toContain("More.");

    await h.restart();
    await expect(row(h, "Old").getByTestId("unreadable-mark")).toBeVisible();
    expect(bytes(h.vault, "Old.md").equals(CP1252)).toBe(true);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("renaming an unreadable note moves its file with the bytes it had", async () => {
  const h = await launchApp(
    { "Good.md": "Good text.\n" },
    { prepare: (vault: Vault) => fs.writeFileSync(vault.file("Old.md"), CP1252) },
  );
  try {
    await h.openNote("Good");
    await row(h, "Old").dblclick();
    const field = h.page.locator("[data-note-id] input");
    await field.fill("Older");
    await field.press("Enter");
    await expect
      .poll(() => h.vault.list().sort(), { timeout: 5_000 })
      .toEqual(["Good.md", "Older.md"]);
    await sleep(SETTLE_MS);
    expect(bytes(h.vault, "Older.md").equals(CP1252)).toBe(true);
    await expect(row(h, "Older").getByTestId("unreadable-mark")).toBeVisible();
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a note overwritten from outside with bytes that are not UTF-8 turns unreadable, and comes back once the file holds text", async () => {
  const h = await launchApp({ "Plans.md": "Plans.\n", "Good.md": "Good text.\n" });
  try {
    await h.openNote("Plans");
    fs.writeFileSync(h.vault.file("Plans.md"), CP1252);
    const view = h.page.getByTestId("unreadable-note");
    await expect(view).toBeVisible({ timeout: 5_000 });
    await expect(row(h, "Plans").getByTestId("unreadable-mark")).toBeVisible();

    // Try again reads the file as it still is: still unreadable, nothing written.
    await view.getByRole("button", { name: "Try again" }).click();
    await sleep(SETTLE_MS);
    await expect(view).toBeVisible();
    expect(bytes(h.vault, "Plans.md").equals(CP1252)).toBe(true);

    // Fixed outside: the watcher brings the text back.
    fs.writeFileSync(h.vault.file("Plans.md"), "Café crème\n", "utf-8");
    await expect.poll(() => noteText(h.page), { timeout: 5_000 }).toBe("Café crème");
    await expect(row(h, "Plans").getByTestId("unreadable-mark")).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
