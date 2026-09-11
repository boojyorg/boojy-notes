import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { END_OF_LINE, MOD, SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const source = readFileSync(
  path.resolve("tests/fixtures/preservation/tilde-code-content.md"),
  "utf8",
);
const body = source.split("~~~~markdown  \n")[1].split("\n~~~~~ \t")[0];

for (const lang of ["", "javascript"]) {
  test(`clicking visible code after blank lines edits that character (${lang || "plain"})`, async () => {
    const codeBody = "\n\nconst x = 1;\n\n\nconst y = 2;\n";
    const original = `~~~~${lang}\n${codeBody}\n~~~~\n`;
    const h = await launchApp({ "Click code.md": original });
    try {
      await h.openNote("Click code");
      const code = h.page.locator("textarea.code-textarea");
      for (const digit of ["1", "2"]) {
        // Aim at the visible glyph, not a position computed from the textarea:
        // the bug was that these two layers disagreed after an empty line.
        const point = await h.page.locator(".code-overlay").evaluate((overlay, target) => {
          const walker = document.createTreeWalker(overlay, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const at = node.textContent?.indexOf(target) ?? -1;
            if (at < 0) continue;
            const range = document.createRange();
            range.setStart(node, at);
            range.setEnd(node, at + 1);
            const box = range.getBoundingClientRect();
            return { x: box.x + box.width * 0.8, y: box.y + box.height / 2 };
          }
          throw new Error(`No visible ${target} in the code overlay`);
        }, digit);
        await h.page.mouse.click(point.x, point.y);
        expect(await code.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(
          codeBody.indexOf(digit) + 1,
        );
        await h.page.keyboard.press("Backspace");
        await h.page.keyboard.type("9");
        await waitForFile(
          h.vault.file("Click code.md"),
          (text) => text === original.replace(digit, "9"),
        );
        await h.page.keyboard.press(`${MOD}+z`);
        await expect(code).toHaveValue(codeBody);
        await waitForFile(h.vault.file("Click code.md"), (text) => text === original);
      }
      await h.restart();
      await h.openNote("Click code");
      await expect(h.page.locator("textarea.code-textarea")).toHaveValue(codeBody);
      expect(h.vault.read("Click code.md")).toBe(original);
      expect(h.pageErrors).toEqual([]);
    } finally {
      await h.close();
    }
  });
}

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
