/**
 * External edits are never silently overwritten.
 *
 * Policy (2026-09-06): a change made outside the app to a note that is not
 * being edited wins at once; so does one to the open note when nothing is
 * pending locally. Reproduces two review findings (B2): a note edited outside
 * while the user types in another note was written back over with the old
 * bytes; and an outside edit to the open note inside 1.5 s of the app's own
 * save was dropped by the watcher's timer before its bytes were looked at.
 * Needs the real app: the text-commit and write debounces, the watcher and
 * its echo suppression are what the bug lives in.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { END_OF_LINE, SETTLE_MS, launchApp, noteText, sleep, waitForFile } from "./harness";

const TODAY = new Date().toISOString().slice(0, 10);

test("a note edited outside while typing in another note keeps the outside edit", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n", "Beta.md": "Beta body.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    // Type slowly enough that the text-commit debounce is always pending.
    await h.page.keyboard.type(" one", { delay: 120 });
    h.vault.write("Beta.md", "Beta body.\nAdded outside.\n");
    await h.page.keyboard.type(" two three four", { delay: 120 });
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("four"));
    await sleep(SETTLE_MS);

    expect(h.vault.read("Beta.md"), "the outside edit survives on disk").toBe(
      "Beta body.\nAdded outside.\n",
    );
    expect(h.vault.read("Alpha.md")).toBe("Alpha body. one two three four\n");
    await h.openNote("Beta");
    expect(await noteText(h.page)).toBe("Beta body.\nAdded outside.");
    await sleep(SETTLE_MS);
    expect(h.vault.read("Beta.md")).toBe("Beta body.\nAdded outside.\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("an outside edit to the open note just after the app's own save is shown, and stays on disk", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" one");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes(" one"));
    // Inside the 1.5 s own-write window, with nothing pending locally.
    await sleep(400);
    h.vault.write("Alpha.md", "Alpha body. one\nAdded outside.\n");

    await expect
      .poll(() => noteText(h.page), { timeout: 5_000 })
      .toBe("Alpha body. one\nAdded outside.");
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha body. one\nAdded outside.\n");

    // Typing on after it is an edit of the outside version, not of the stale
    // one: the outside line is still there after the save. (The two lines are
    // one paragraph, so the caret sits on its first line.)
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" more");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes(" more"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha body. one more\nAdded outside.\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("an outside edit to the open note while edits are pending keeps both: disk under the name, yours in a conflict copy you continue in", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" mine", { delay: 60 });
    // Before the text commit and the write debounce have fired.
    h.vault.write("Alpha.md", "Alpha body.\nTheirs, from outside.\n");

    const copyName = `Alpha (conflicted copy ${TODAY})`;
    await expect(h.page.getByRole("textbox", { name: "Note title" })).toHaveText(copyName, {
      timeout: 5_000,
    });
    await expect(h.page.getByText("changed outside Boojy Notes")).toBeVisible();
    // The caret carried over: typing on continues the copy, at the end of the line.
    await h.page.keyboard.type(" still", { delay: 60 });
    await waitForFile(h.vault.file(`${copyName}.md`), (t) => t.includes("still"));
    await sleep(SETTLE_MS);

    expect(h.vault.read("Alpha.md"), "the outside version keeps the name").toBe(
      "Alpha body.\nTheirs, from outside.\n",
    );
    expect(h.vault.read(`${copyName}.md`)).toBe("Alpha body. mine still\n");
    expect(await noteText(h.page)).toBe("Alpha body. mine still");
    expect(
      h.vault
        .list()
        .filter((f) => f.endsWith(".md"))
        .sort(),
    ).toEqual(["Alpha.md", `${copyName}.md`].sort());

    // The original opens as the outside version, and is clean. (The harness's
    // row match is by substring, and the copy's title contains "Alpha" too.)
    await h.page
      .locator('[role="treeitem"]')
      .filter({ hasText: "Alpha" })
      .filter({ hasNotText: "conflicted" })
      .click();
    await expect(h.page.getByRole("textbox", { name: "Note title" })).toHaveText("Alpha");
    expect(await noteText(h.page)).toBe("Alpha body.\nTheirs, from outside.");
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha body.\nTheirs, from outside.\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("when the conflict copy cannot be written, blur and quit never put the local version over the outside edit", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n" });
  try {
    // Make the copy's write fail, and only the copy's: the atomic write opens
    // `.<name>.md.tmp` beside the file, so a directory in its place fails it
    // with EISDIR while `Alpha.md` itself stays perfectly writable.
    const copyName = `Alpha (conflicted copy ${TODAY})`;
    const blocker = path.join(h.vault.dir, `.${copyName}.md.tmp`);
    fs.mkdirSync(blocker);

    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" mine", { delay: 60 });
    h.vault.write("Alpha.md", "Alpha body.\nTheirs, from outside.\n");
    await expect(h.page.getByText("could not be saved as a copy")).toBeVisible({ timeout: 5_000 });

    // The local work is still here, and the outside version is untouched.
    expect(await noteText(h.page)).toBe("Alpha body. mine");
    expect(h.vault.read("Alpha.md")).toBe("Alpha body.\nTheirs, from outside.\n");

    // Blur, as switching apps does, then wait out every debounce and retry.
    await h.page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md"), "after blur").toBe("Alpha body.\nTheirs, from outside.\n");
    expect(h.vault.exists(`${copyName}.md`)).toBe(false);

    // Quit (its flush before close is the last chance to write anything).
    await h.quit();
    expect(h.vault.read("Alpha.md"), "after quit").toBe("Alpha body.\nTheirs, from outside.\n");
    expect(h.vault.exists(`${copyName}.md`)).toBe(false);
  } finally {
    await h.close();
  }
});
