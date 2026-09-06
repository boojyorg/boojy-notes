/**
 * File and data preservation: a normal edit, save and restart cycle never
 * makes a note or folder disappear, never removes a deliberate backslash
 * escape, and never turns an empty Markdown construct into a different block.
 *
 * Reproduces three review findings. A note or folder named with a leading
 * dot (`.env`, `.archive`) was written fine and then skipped by the vault
 * walk and the watcher, so it vanished at the next restart with everything in
 * it. `\*not italic\*` lost its backslashes on the first edit and rendered as
 * italic on the next repaint. An empty bullet, numbered item, checkbox or
 * heading left behind on screen came back from disk as a paragraph.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import {
  END_OF_LINE,
  MOD,
  SETTLE_MS,
  editorTitle,
  expandAllFolders,
  expectTitlesMatchFiles,
  launchApp,
  moveNoteToFolder,
  noteText,
  renameRow,
  sidebarNoteTitles,
  sleep,
  waitForFile,
} from "./harness";

/** The type of every block on screen, top to bottom, as the block roots carry it. */
const blockTypes = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-block-id]")).map((b) =>
      b.getAttribute("data-block-type"),
    ),
  );

async function nameNewFolder(page: import("@playwright/test").Page, name: string) {
  const input = page.locator("input:focus");
  await input.waitFor();
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
}

test("a note or folder asked to start with a dot gets a visible name and survives a restart", async () => {
  const h = await launchApp({ "Plain.md": "Body.\n", "Other.md": "Other.\n" });
  try {
    await h.openNote("Plain");
    await renameRow(h.page, "Plain", ".env");
    await waitForFile(h.vault.file("_env.md"), (t) => t === "Body.\n", {
      label: "renamed file under its visible name",
    });
    await expect.poll(() => editorTitle(h.page)).toBe("_env");
    await expectTitlesMatchFiles(h.page, h.vault);

    await h.page.getByRole("button", { name: "New folder" }).click();
    await nameNewFolder(h.page, ".archive");
    await expect(h.page.locator('[data-folder-path="_archive"]')).toBeVisible();
    await expect.poll(() => h.vault.exists("_archive")).toBe(true);
    await moveNoteToFolder(h.page, "_env", "_archive");
    await waitForFile(h.vault.file("_archive/_env.md"), (t) => t === "Body.\n", {
      label: "note moved into the folder",
    });

    // Nothing hidden, so nothing lost: both are still there after a restart.
    await h.restart();
    await expandAllFolders(h.page);
    await expect(h.page.locator('[data-folder-path="_archive"]')).toBeVisible();
    expect((await sidebarNoteTitles(h.page)).sort()).toEqual(["Other", "_env"]);
    await expectTitlesMatchFiles(h.page, h.vault);
    expect(
      h.vault
        .list()
        .filter((f) => f.endsWith(".md"))
        .sort(),
    ).toEqual(["Other.md", "_archive/_env.md"]);
    expect(fs.readdirSync(h.vault.dir).filter((n) => n.startsWith("."))).toEqual([]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a backslash escape is shown as written and survives an edit, a save and a restart", async () => {
  const source = "\\*not italic\\* and \\# not a tag.\n";
  const h = await launchApp({ "Escapes.md": source });
  try {
    await h.openNote("Escapes");
    const block = h.page.locator("[data-block-id]").first();
    await expect(block).toHaveText("\\*not italic\\* and \\# not a tag.");
    expect(await block.locator("em, .inline-tag").count()).toBe(0);

    await block.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" Edited");
    await waitForFile(h.vault.file("Escapes.md"), (t) => t.includes("Edited"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Escapes.md")).toBe("\\*not italic\\* and \\# not a tag. Edited\n");
    expect(await block.locator("em, .inline-tag").count()).toBe(0);

    await h.restart();
    await h.openNote("Escapes");
    expect(await noteText(h.page)).toBe("\\*not italic\\* and \\# not a tag. Edited");
    expect(await h.page.locator("[data-block-id] em, [data-block-id] .inline-tag").count()).toBe(0);
    expect(h.vault.read("Escapes.md")).toBe("\\*not italic\\* and \\# not a tag. Edited\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("empty list items and headings open as themselves, and one left behind comes back as itself", async () => {
  const seeded = "- \n1. \n- [ ] \n- [x] \n# \n## \nEnd.\n";
  const h = await launchApp({ "Empties.md": seeded, "Start.md": "Start.\n" });
  try {
    // Reading: the file's empty forms are the blocks they say they are.
    await h.openNote("Empties");
    const expectedTypes = ["bullet", "numbered", "checkbox", "checkbox", "h1", "h2", "p", "p"];
    expect(await blockTypes(h.page)).toEqual(expectedTypes);
    expect(
      await h.page
        .locator('[data-block-type="checkbox"] [role="checkbox"]')
        .evaluateAll((els) => els.map((e) => e.getAttribute("aria-checked"))),
    ).toEqual(["false", "true"]);

    // An edit elsewhere in the note rewrites the file without touching them.
    await h.page.locator("[data-block-id]").nth(6).click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" Edited");
    await waitForFile(h.vault.file("Empties.md"), (t) => t.includes("Edited"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Empties.md")).toBe("- \n1. \n- [ ] \n- [x] \n# \n## \nEnd. Edited\n");

    // Authoring: type a bullet marker, leave the item empty, move on.
    await h.openNote("Start");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.type("- ");
    // The third block is the empty last row the file's final newline makes.
    await expect.poll(() => blockTypes(h.page)).toEqual(["p", "bullet", "p"]);
    await h.openNote("Empties");
    await waitForFile(h.vault.file("Start.md"), (t) => t.includes("- "));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Start.md")).toBe("Start.\n- \n");

    await h.restart();
    await h.openNote("Empties");
    expect(await blockTypes(h.page)).toEqual(expectedTypes);
    await h.openNote("Start");
    expect(await blockTypes(h.page)).toEqual(["p", "bullet", "p"]);
    expect(h.vault.read("Start.md")).toBe("Start.\n- \n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
