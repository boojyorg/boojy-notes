import { expect, test } from "@playwright/test";
import { launchApp, MOD, waitForFile } from "./harness";

/**
 * A list property is edited an item at a time, and each change reaches the
 * file as that item's own bytes: a flow list's spacing and line breaks and a
 * blank line between block items stay as written. A click on an item edits
 * it, Enter saves and opens the next, a press on the unused space adds, and
 * a tag's Search is in its menu.
 */

const NOTE = [
  "---",
  "cast:",
  "  - Mark Hamill",
  "",
  "  - Harrison Ford",
  "tags: [ starwars ,  demo ]",
  "aliases: [Episode V,",
  "  Empire]",
  "---",
  "Body.",
  "",
].join("\n");

const row = (key: string) => `.props-row[data-key="${key}"]`;
const item = (key: string, i: number) => `${row(key)} .props-item-text[data-index="${i}"]`;

test("each item change writes only that item's bytes", async () => {
  const h = await launchApp({ "Film.md": NOTE });
  const file = h.vault.file("Film.md");
  try {
    await h.openNote("Film");

    // A click edits the item where it stands; Enter saves it and opens the next.
    await h.page.locator(item("cast", 0)).click();
    await expect(h.page.locator(`${row("cast")} .props-input`)).toHaveValue("Mark Hamill");
    await h.page.keyboard.press(`${MOD}+a`);
    await h.page.keyboard.type("Mark Hamil");
    await h.page.keyboard.press("Enter");
    const one = NOTE.replace("Mark Hamill", "Mark Hamil");
    await waitForFile(file, (t) => t === one, { label: "one item's text, the blank line kept" });
    await h.page.keyboard.type("Carrie Fisher");
    await h.page.keyboard.press("Enter");
    const two = one.replace("  - Mark Hamil\n", "  - Mark Hamil\n  - Carrie Fisher\n");
    await waitForFile(file, (t) => t === two, { label: "a new item after the edited one" });
    await h.page.keyboard.press("Enter");
    await expect(h.page.locator(`${row("cast")} .props-input`)).toHaveCount(0);

    // A flow list keeps its spacing: a tag edited, then one added by the unused space.
    await h.page.locator(item("tags", 1)).click();
    await h.page.keyboard.press(`${MOD}+a`);
    await h.page.keyboard.type("demos");
    await h.page.keyboard.press("Escape");
    await h.page.locator(item("tags", 1)).click();
    await h.page.keyboard.press("End");
    await h.page.keyboard.type("s");
    await h.page.keyboard.press("Enter");
    const three = two.replace("[ starwars ,  demo ]", "[ starwars ,  demos ]");
    await waitForFile(file, (t) => t === three, { label: "the tag's text, the spacing kept" });
    await h.page.keyboard.press("Escape");
    const tags = h.page.locator(`${row("tags")} .props-list`);
    const box = await tags.boundingBox();
    if (!box) throw new Error("no tags list");
    await h.page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
    await h.page.keyboard.type("scifi ");
    const four = three.replace("[ starwars ,  demos ]", "[ starwars ,  demos ,  scifi ]");
    await waitForFile(file, (t) => t === four, {
      label: "a tag added with the list's own separator",
    });
    await h.page.keyboard.press("Escape");

    // A list split over lines keeps its line break when an item goes.
    await h.page.locator(`${row("aliases")} [aria-label="Remove Episode V"]`).click();
    const five = four.replace("aliases: [Episode V,\n  Empire]", "aliases: [Empire]");
    await waitForFile(file, (t) => t === five, { label: "the item and its separator only" });

    // Backspace twice in an empty new item takes the one before it.
    await h.page.locator(item("cast", 2)).click();
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.press("Backspace");
    await expect(h.page.locator(`${row("cast")} [data-armed]`)).toContainText("Harrison Ford");
    await h.page.keyboard.press("Backspace");
    const six = five.replace("\n  - Harrison Ford", "");
    await waitForFile(file, (t) => t === six, { label: "the picked item gone" });
    await h.page.keyboard.press("Escape");

    // ⌘Z, back in the note, takes the last change back.
    await h.page.locator("[data-block-type='p']").first().click();
    await h.page.keyboard.press(`${MOD}+z`);
    await waitForFile(file, (t) => t === five, { label: "one ⌘Z brings the item back" });
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a tag's menu opens Search for it; a click edits it", async () => {
  const h = await launchApp({ "Film.md": NOTE, "Other.md": "about #demo here\n" });
  try {
    await h.openNote("Film");
    await h.page.locator(item("tags", 1)).click({ button: "right" });
    await h.page.getByRole("menuitem", { name: "Search for #demo" }).click();
    const dialog = h.page.getByRole("dialog", { name: "Search" });
    await expect(dialog.getByTestId("search-tag-chip")).toHaveText(/#demo/);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
