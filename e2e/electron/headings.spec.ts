import { expect, test } from "@playwright/test";
import { END_OF_LINE, MOD, launchApp, waitForFile } from "./harness";

test("imported H1–H6 render, edit, keep their spelling and reopen as headings", async () => {
  const original =
    "Intro.\n\n" +
    [1, 2, 3, 4, 5, 6]
      .map((level) => `  ${"#".repeat(level)}\tHeading ${level}  ### \t`)
      .join("\n") +
    "\n\nAfter.";
  const h = await launchApp({ "Headings.md": original });
  try {
    await h.openNote("Headings");
    let expected = original;
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const heading = h.page.locator(`h${level}[data-block-type="h${level}"]`);
      await expect(heading).toHaveText(`Heading ${level}`);
      await heading.click();
      await h.page.keyboard.press(END_OF_LINE);
      await h.page.keyboard.type(" edited");
      expected = expected.replace(`Heading ${level}`, `Heading ${level} edited`);
      await waitForFile(h.vault.file("Headings.md"), (text) => text === expected);
    }
    await h.page.keyboard.press(`${MOD}+z`);
    await expect(h.page.locator("h6[data-block-type]")).toHaveText("Heading 6");
    await h.page.keyboard.press(`${MOD}+Shift+z`);
    await expect(h.page.locator("h6[data-block-type]")).toHaveText("Heading 6 edited");
    await h.restart();
    await h.openNote("Headings");
    for (const level of [1, 2, 3, 4, 5, 6]) {
      await expect(h.page.locator(`h${level}[data-block-type]`)).toHaveText(
        `Heading ${level} edited`,
      );
    }
    expect(h.vault.read("Headings.md")).toBe(expected);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("typed H1–H6 and searched H4–H6 share heading Enter and navigation behaviour", async () => {
  const h = await launchApp({ "Writing.md": "Intro." });
  try {
    await h.openNote("Writing");
    await h.page.locator('[data-block-type="p"]').click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press("Enter");
    for (const level of [1, 2, 3, 4, 5, 6]) {
      await h.page.keyboard.type(`${"#".repeat(level)} Typed ${level}${level === 6 ? " ###" : ""}`);
      await expect(h.page.locator(`h${level}[data-block-type]`)).toHaveText(
        `Typed ${level}${level === 6 ? " ###" : ""}`,
      );
      await h.page.keyboard.press(level % 2 ? "Enter" : "Shift+Enter");
      await h.page.keyboard.type(`Body ${level}`);
      await expect(
        h.page.locator('[data-block-type="p"]').filter({ hasText: `Body ${level}` }),
      ).toHaveCount(1);
      await h.page.keyboard.press("Enter");
    }
    const menu = h.page.getByRole("menu", { name: "Slash commands" });
    for (const level of [4, 5, 6]) {
      await h.page.keyboard.type("/");
      await expect(menu.getByRole("menuitem")).toHaveCount(11);
      await expect(menu.getByRole("menuitem").filter({ hasText: "Heading 4" })).toHaveCount(0);
      await h.page.keyboard.type(`h${level}`);
      await expect(menu.getByRole("menuitem")).toHaveCount(1);
      await expect(menu.getByRole("menuitem")).toContainText(`Heading ${level}`);
      await h.page.keyboard.press("Enter");
      await h.page.keyboard.type(`Searched ${level}`);
      await expect(h.page.locator(`h${level}[data-block-type]`).last()).toHaveText(
        `Searched ${level}`,
      );
      await h.page.keyboard.press("Enter");
      await h.page.keyboard.press("ArrowUp");
      expect(
        await h.page.evaluate(() =>
          window
            .getSelection()
            ?.anchorNode?.parentElement?.closest("[data-block-type]")
            ?.getAttribute("data-block-type"),
        ),
      ).toBe(`h${level}`);
      await h.page.keyboard.press("ArrowDown");
    }
    await waitForFile(h.vault.file("Writing.md"), (text) => text.includes("###### Searched 6"));
    await h.restart();
    await h.openNote("Writing");
    for (const level of [1, 2, 3, 4, 5, 6]) {
      await expect(h.page.locator(`h${level}[data-block-type]`).first()).toHaveText(
        `Typed ${level}${level === 6 ? " ###" : ""}`,
      );
    }
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
