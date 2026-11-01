/**
 * Chromium's copied look never stays on screen: deleting a code span's last
 * character and typing on wrote plain text to the file but left the code's
 * font and grey on the new text (`<font>` and a styled `<span>`), in a
 * paragraph and in a table cell. A closing marker typed in a cell or a
 * callout body converts at once, as in a paragraph (it waited for the next
 * repaint from state, which a field holding state's text never gets). And an
 * edited row of a table lined up but for one long row sits with its neighbours.
 */
import { expect, test } from "@playwright/test";
import { END_OF_LINE, SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const TABLE = [
  "| You want   | You type    |",
  "| ---------- | ----------- |",
  "| Heading    | `# Heading` |",
  "| Code block | three backticks above and below |",
  "| Tag        | `#tag`      |",
];
const NOTE = `${TABLE.join("\n")}\n\nTag \`#tag\` end\n`;

/** Select all of the code span in `host`, delete it and type `text`. */
async function retypeCode(host: import("@playwright/test").Locator, text: string) {
  await host.locator("code").click();
  await host.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el.querySelector("code")!);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await host.page().keyboard.press("Backspace");
  await host.page().keyboard.type(text);
}

test("retyping a deleted code span's text leaves plain text on screen, in a cell and a paragraph", async () => {
  const h = await launchApp({ "Cheat.md": NOTE });
  try {
    await h.openNote("Cheat");
    const cell = h.page.locator("table.table-block tbody td").nth(5);
    await retypeCode(cell, "tag");
    await waitForFile(h.vault.file("Cheat.md"), (t) => t.includes("| tag"));
    await sleep(SETTLE_MS);
    await expect(cell.locator("font, span[style], code")).toHaveCount(0);
    await expect(cell).toHaveText("tag");

    const para = h.page.locator("[data-block-type='p']").first();
    await retypeCode(para, "tag");
    await waitForFile(h.vault.file("Cheat.md"), (t) => t.includes("Tag tag"));
    await sleep(SETTLE_MS);
    await expect(para.locator("font, span[style], code")).toHaveCount(0);
    // The caret stayed where the typing left it: one more letter lands after "tag".
    await h.page.keyboard.type("s");
    await waitForFile(h.vault.file("Cheat.md"), (t) => t.includes("tags"));
    await sleep(SETTLE_MS);

    // The edited row sits with its neighbours; the long row and the rest keep their lines.
    expect(h.vault.read("Cheat.md")).toBe(
      `${[...TABLE.slice(0, 4), "| Tag        | tag         |"].join("\n")}\n\nTag tags end\n`,
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a closing marker typed in a cell or a callout body converts at once, as in a paragraph", async () => {
  const md = "| A | B |\n| --- | --- |\n| Tag | x |\n\n> [!note] Note\n> body\n";
  const h = await launchApp({ "Fields.md": md });
  try {
    await h.openNote("Fields");
    const cell = h.page.locator("table.table-block tbody td").nth(1);
    await cell.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" `tag` **b**");
    await waitForFile(h.vault.file("Fields.md"), (t) => t.includes("**b**"));
    await sleep(SETTLE_MS);
    await expect(cell.locator("code")).toHaveText("tag");
    await expect(cell.locator("strong")).toHaveText("b");
    // The caret sits after the new element: typing goes on outside it.
    await h.page.keyboard.type(" c");
    const body = h.page.locator(".callout-body");
    await body.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" ==hi== and *it*");
    await waitForFile(h.vault.file("Fields.md"), (t) => t.includes("*it*"));
    await sleep(SETTLE_MS);
    await expect(body.locator("mark")).toHaveText("hi");
    await expect(body.locator("em")).toHaveText("it");
    expect(h.vault.read("Fields.md")).toBe(
      "| A | B |\n| --- | --- |\n| Tag | x `tag` **b** c |\n\n> [!note] Note\n> body ==hi== and *it*\n",
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
