/**
 * A special block's field is a real editable field. A table cell, a
 * callout's title or body and a code block's textarea are the browser's
 * while typed into; each commits what it holds on every input at the text
 * grain, state paints them only when they do not already hold its text, a
 * structural operation is a function of the block as the keystroke ref
 * holds it, and the serializer never writes a byte sequence the block's
 * syntax cannot hold.
 *
 * Reproduces the 2026-09-07 review's data-loss findings in the real app:
 * Shift+Enter in a table cell broke the table on the next open (§3.1); a
 * click into a callout body and out stripped its inline Markdown (§3.2);
 * Enter at the end of a code block did nothing and a fence's blank first
 * line went at the first keystroke (§1.3); text typed into a table cell was
 * lost by a row operation from the cell's own context menu (§3.4).
 */
import { expect, test } from "@playwright/test";
import { END_OF_LINE, MOD, SETTLE_MS, editorText, launchApp, sleep, waitForFile } from "./harness";

const NOTE = "Note.md";

test("a line break inside a table cell is <br> on disk, and the table opens whole again", async () => {
  const md = "Intro.\n\n| Name | Qty |\n| --- | --- |\n| Tea | 2 |\n| Milk | 1 |\n";
  const h = await launchApp({ [NOTE]: md });
  try {
    await h.openNote("Note");
    const cell = h.page.locator("table.table-block tbody td").first();
    await cell.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press("Shift+Enter");
    await h.page.keyboard.type("green");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("green"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toBe(
      "Intro.\n\n| Name | Qty |\n| --- | --- |\n| Tea<br>green | 2 |\n| Milk | 1 |\n",
    );

    // Enter moves down a row, never into a second line of the cell; on the
    // last row it adds one.
    await h.page.keyboard.press("Enter");
    await expect(h.page.locator("table.table-block tbody td").nth(2)).toBeFocused();
    await h.page.keyboard.press("Enter");
    await expect(h.page.locator("table.table-block tbody tr")).toHaveCount(3);
    await expect(h.page.locator("table.table-block tbody td").nth(4)).toBeFocused();
    await h.page.keyboard.type("Bread");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("Bread"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toBe(
      "Intro.\n\n| Name | Qty |\n| --- | --- |\n| Tea<br>green | 2 |\n| Milk | 1 |\n| Bread |  |\n",
    );

    await h.restart();
    await h.openNote("Note");
    const table = h.page.locator("table.table-block");
    await expect(table.locator("tbody tr")).toHaveCount(3);
    expect(await table.locator("tbody td").first().innerText()).toBe("Tea\ngreen");
    // No row became a paragraph: nothing outside the table holds a pipe.
    expect(await editorText(h.page)).not.toContain("|");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a click into a callout body and out keeps its inline Markdown; an edit keeps it too", async () => {
  const callout = "> [!note] Note\n> body with **bold**, `code` and [[Other]]\n";
  const md = `Intro.\n\n${callout}\nAfter.\n`;
  const h = await launchApp({ [NOTE]: md, "Other.md": "Other.\n" });
  try {
    await h.openNote("Note");
    const body = h.page.locator(".callout-body");
    await body.click();
    await h.page.locator("[data-block-type='p']", { hasText: "After." }).click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" Edited");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("Edited"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toBe(`Intro.\n\n${callout}\nAfter. Edited\n`);

    // Typing into the body commits the body as Markdown, formatting kept.
    await body.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" more");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("more"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toBe(
      "Intro.\n\n> [!note] Note\n> body with **bold**, `code` and [[Other]] more\n\nAfter. Edited\n",
    );
    expect(await body.locator("strong").innerText()).toBe("bold");

    // The title is one line: Shift+Enter moves to the body instead of breaking the marker line.
    await h.page.locator(".callout-title").click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press("Shift+Enter");
    await expect(body).toBeFocused();
    await h.page.locator(".callout-title").click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type("!");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("Note!"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toContain("> [!note] Note!\n> body with");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Enter at the end of a code block adds a line, a fence's blank first line survives, and undo is by burst", async () => {
  const md = "Intro.\n\n```js\n\nfirst\n```\n";
  const h = await launchApp({ [NOTE]: md });
  try {
    await h.openNote("Note");
    const ta = h.page.locator("textarea.code-textarea");
    expect(await ta.inputValue()).toBe("\nfirst");
    await ta.click();
    await h.page.evaluate(() => {
      const el = document.querySelector("textarea.code-textarea") as HTMLTextAreaElement;
      el.setSelectionRange(el.value.length, el.value.length);
    });
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.type("second");
    expect(await ta.inputValue()).toBe("\nfirst\nsecond");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("second"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toBe("Intro.\n\n```js\n\nfirst\nsecond\n```\n");

    // One Cmd+Z takes the burst back, not one character.
    await h.page.keyboard.press(`${MOD}+z`);
    expect(await ta.inputValue()).toBe("\nfirst");
    await waitForFile(h.vault.file(NOTE), (t) => !t.includes("second"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toBe(md);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("text typed into a table cell is kept by a row operation from the cell's own menu", async () => {
  const md = "| Name | Qty |\n| --- | --- |\n| Tea | 2 |\n| Milk | 1 |\n";
  const h = await launchApp({ [NOTE]: md });
  try {
    await h.openNote("Note");
    const cell = h.page.locator("table.table-block tbody td").first();
    await cell.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" leaves");
    // The menu keeps focus in the cell, so nothing ever blurred it.
    await cell.click({ button: "right" });
    await h.page.getByText("Insert Row Below").click();
    await expect(h.page.locator("table.table-block tbody tr")).toHaveCount(3);
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("leaves") && t.includes("|  |"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toBe(
      "| Name | Qty |\n| --- | --- |\n| Tea leaves | 2 |\n|  |  |\n| Milk | 1 |\n",
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
