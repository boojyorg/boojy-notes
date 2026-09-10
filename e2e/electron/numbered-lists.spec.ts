import { expect, test } from "@playwright/test";
import { END_OF_LINE, MOD, launchApp, waitForFile } from "./harness";

const listRows = (page: import("@playwright/test").Page) =>
  page.locator('[data-block-type="numbered"]').evaluateAll((rows) =>
    rows.map((row) => ({
      marker: row.firstElementChild?.textContent,
      text: row.querySelector('[role="textbox"]')?.textContent,
      indent: (row as HTMLElement).style.paddingLeft,
    })),
  );

test("numbered children and grandchildren keep their numbering and depth after a restart", async () => {
  const h = await launchApp({ "List.md": "" });
  try {
    await h.openNote("List");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.type("1. Parent");
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.press("Tab");
    // Another Tab cannot skip a level without another parent item.
    await h.page.keyboard.press("Tab");
    await h.page.keyboard.type("Child");
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.press("Tab");
    await h.page.keyboard.type("Grandchild");
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.press("Shift+Tab");
    await h.page.keyboard.type("Second child");
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.press("Shift+Tab");
    await h.page.keyboard.type("Sibling");
    const expected = "1. Parent\n   1. Child\n      1. Grandchild\n   2. Second child\n2. Sibling";
    await waitForFile(h.vault.file("List.md"), (text) => text === expected);
    const rows = await listRows(h.page);
    expect(rows.map((row) => row.marker)).toEqual(["1.", "1.", "1.", "2.", "2."]);
    expect(rows[0].indent).toBe(rows[4].indent);
    expect(rows[1].indent).toBe(rows[3].indent);
    expect(parseFloat(rows[2].indent)).toBeGreaterThan(parseFloat(rows[1].indent));
    await h.restart();
    expect(await listRows(h.page)).toEqual(rows);
    expect(h.vault.read("List.md")).toBe(expected);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("editing imported list text preserves source markers; reordering renumbers, and undo restores them", async () => {
  const source = "7. Alpha\n7. Beta\n9. Gamma\n\nOutside.";
  const h = await launchApp({ "Imported.md": source });
  try {
    await h.openNote("Imported");
    const item = h.page.getByRole("textbox", { name: "Numbered item" }).nth(1);
    await item.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type("!");
    const edited = source.replace("Beta", "Beta!");
    await waitForFile(h.vault.file("Imported.md"), (text) => text === edited);
    expect((await listRows(h.page)).map((row) => row.marker)).toEqual(["7.", "8.", "9."]);
    await h.page.keyboard.press(`${MOD}+Shift+ArrowUp`);
    await waitForFile(
      h.vault.file("Imported.md"),
      (text) => text === "7. Beta!\n8. Alpha\n9. Gamma\n\nOutside.",
    );
    await h.page.keyboard.press(`${MOD}+z`);
    await waitForFile(h.vault.file("Imported.md"), (text) => text === edited);
    await h.restart();
    expect(h.vault.read("Imported.md")).toBe(edited);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
