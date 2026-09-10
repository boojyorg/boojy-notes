import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { END_OF_LINE, MOD, SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const source = readFileSync(
  path.resolve("tests/fixtures/preservation/tilde-code-content.md"),
  "utf8",
);
const body = source.split("~~~~markdown  \n")[1].split("\n~~~~~ \t")[0];

test("an imported tilde fence stays one code block through outside and inside edits, undo and restart", async () => {
  const h = await launchApp({ "Fences.md": source });
  try {
    await h.openNote("Fences");
    const code = h.page.locator("textarea.code-textarea");
    await expect(code).toHaveCount(1);
    await expect(code).toHaveValue(body);
    await expect(h.page.locator('[data-block-type="h1"], table.table-block')).toHaveCount(0);

    await h.page.locator('[data-block-type="p"]').filter({ hasText: "EDITME" }).click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" Edited.");
    const outsideEdit = source.replace("before code.", "before code. Edited.");
    await waitForFile(h.vault.file("Fences.md"), (text) => text === outsideEdit);
    await sleep(SETTLE_MS);
    expect(h.vault.read("Fences.md")).toBe(outsideEdit);
    await expect(code).toHaveValue(body);

    const editedBody = body.replace("const x = 1;", "const x = 2;");
    await code.fill(editedBody);
    const insideEdit = outsideEdit.replace(body, editedBody);
    await waitForFile(h.vault.file("Fences.md"), (text) => text === insideEdit);
    await h.page.keyboard.press(`${MOD}+z`);
    await expect(code).toHaveValue(body);
    await waitForFile(h.vault.file("Fences.md"), (text) => text === outsideEdit);
    await h.page.keyboard.press(`${MOD}+Shift+z`);
    await expect(code).toHaveValue(editedBody);
    await waitForFile(h.vault.file("Fences.md"), (text) => text === insideEdit);

    await h.restart();
    await h.openNote("Fences");
    await expect(h.page.locator("textarea.code-textarea")).toHaveValue(editedBody);
    expect(h.vault.read("Fences.md")).toBe(insideEdit);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
