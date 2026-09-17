/**
 * A persisted note's title is its filename. Whatever the filesystem does to a
 * requested name — a collision suffix, invalid characters replaced, whitespace
 * trimmed — the sidebar and the editor show the name the file actually has,
 * as soon as the write lands, and a restart reveals nothing new.
 *
 * Reproduces two review findings. Moving a note beside a namesake produced
 * `Meeting notes-2.md` on disk while both rows still read "Meeting notes", and
 * every later save bounced the file between `-2` and `-3` because uniqueness
 * checking counted the note's own file as a collision. Renaming to a name with
 * characters a filename cannot hold showed the fictional name until restart.
 */
import { expect, test } from "@playwright/test";
import {
  END_OF_LINE,
  type Vault,
  MOD,
  SETTLE_MS,
  editorTitle,
  expectNoTempFiles,
  expectTitlesMatchFiles,
  launchApp,
  moveNoteToFolder,
  renameRow,
  sidebarNoteTitles,
  sleep,
  waitForFile,
} from "./harness";

const mdFiles = (vault: Vault) =>
  vault
    .list()
    .filter((f) => f.endsWith(".md"))
    .sort();

/**
 * A new note starts unnamed: the field is empty under the caret with
 * `Untitled` as a placeholder (nothing selected to type over), the sidebar
 * row reads Untitled rather than standing blank, and the file is
 * `Untitled.md` at once. Typing names it. The placeholder is read from the
 * DOM, so a Backspace that empties a real name shows it in the same frame,
 * starting where the caret does. (Before 2026-09-17 the note was a real
 * `Untitled` selected whole; emptying it showed a bare pill for 300 ms and
 * then the placeholder 5px behind the caret.)
 */
test("a new note starts unnamed under the caret, reads Untitled everywhere, and is named by typing", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.getByRole("button", { name: "New note", exact: true }).click();
    const title = h.page.getByRole("textbox", { name: "Note title" });
    await expect(title).toBeFocused();
    await expect(title).toHaveText("");
    expect(await h.page.evaluate(() => window.getSelection()?.toString())).toBe("");
    const placeholder = () =>
      h.page.evaluate(() => {
        const el = document.querySelector("[data-title]") as HTMLElement;
        const s = getComputedStyle(el, "::before");
        return {
          content: s.content,
          padLeft: s.paddingLeft,
          minWidth: el.style.minWidth || getComputedStyle(el).minWidth,
          // The field is border-box: a minimum that forgets the pill's
          // padding clips the last letter and, focused, draws a scrollbar.
          overflows: el.scrollWidth > el.clientWidth,
        };
      });
    const first = await placeholder();
    expect(first.content).toBe('"Untitled"');
    // Inherits the field's padding, so it starts under the caret.
    expect(first.padLeft).not.toBe("0px");
    expect(Number.parseFloat(first.minWidth)).toBeGreaterThan(0);
    expect(first.overflows).toBe(false);
    // The sidebar row is never blank: a muted Untitled until the name lands.
    await expect(h.page.locator('[role="treeitem"]').filter({ hasText: "Untitled" })).toHaveCount(
      1,
    );
    await expect.poll(() => h.vault.exists("Untitled.md")).toBe(true);

    // A short name keeps the placeholder's width under the caret; the field
    // fits the name once the caret has left.
    const widthOf = () =>
      h.page.evaluate(() => document.querySelector("[data-title]")!.clientWidth);
    const emptyWidth = await widthOf();
    await h.page.keyboard.type("M");
    expect(await widthOf()).toBe(emptyWidth);
    await h.page.keyboard.type("eeting");
    await waitForFile(h.vault.file("Meeting.md"), (t) => t === "", {
      label: "the new note under the name typed",
    });
    await sleep(SETTLE_MS);
    expect(mdFiles(h.vault)).toEqual(["Alpha.md", "Meeting.md"]);
    await expectTitlesMatchFiles(h.page, h.vault);
    expect((await placeholder()).content).toBe("none");

    // A rename that never empties follows its text: deleting `Meeting` down
    // to `Me` narrows the field below the placeholder's width.
    await h.page.locator("[data-block-id]").first().click();
    await h.page.getByRole("textbox", { name: "Note title" }).click();
    await h.page.keyboard.press("End");
    for (let i = 0; i < 5; i++) await h.page.keyboard.press("Backspace");
    await expect.poll(() => editorTitle(h.page)).toBe("Me");
    expect(await widthOf()).toBeLessThan(emptyWidth);

    // Emptying a real name shows the placeholder in the same frame, not
    // after the title's 300 ms commit, and from then on its width holds
    // under whatever is typed next until the caret leaves.
    await h.page.keyboard.press(`${MOD}+a`);
    await h.page.keyboard.press("Backspace");
    const emptied = await placeholder();
    expect(emptied.content).toBe('"Untitled"');
    expect(Number.parseFloat(emptied.minWidth)).toBeGreaterThan(0);
    expect(emptied.overflows).toBe(false);
    await h.page.keyboard.type("h");
    expect(await widthOf()).toBe(emptyWidth);
    await h.page.locator("[data-block-id]").first().click();
    await expect.poll(widthOf).toBeLessThan(emptyWidth);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a moved namesake takes the resolved filename and keeps it across saves and restarts", async () => {
  const h = await launchApp({
    "Work/Meeting notes.md": "In Work.\n",
    "Meeting notes.md": "At root.\n",
  });
  try {
    await moveNoteToFolder(h.page, "Meeting notes", "Work");

    // The filesystem resolves the collision; the namesake is untouched.
    await waitForFile(h.vault.file("Work/Meeting notes-2.md"), (t) => t === "At root.\n", {
      label: "moved file under its suffixed name",
    });
    await expect.poll(() => h.vault.exists("Meeting notes.md"), { timeout: 3_000 }).toBe(false);
    expect(h.vault.read("Work/Meeting notes.md")).toBe("In Work.\n");

    // The sidebar shows the name the file really has, without a restart.
    await expectTitlesMatchFiles(h.page, h.vault);
    expect((await sidebarNoteTitles(h.page)).sort()).toEqual(["Meeting notes", "Meeting notes-2"]);

    // Saving the moved note again and again never moves its file.
    await h.openNote("Meeting notes-2");
    expect(await editorTitle(h.page)).toBe("Meeting notes-2");
    for (let i = 1; i <= 3; i++) {
      await h.page.locator("[data-block-id]").first().click();
      await h.page.keyboard.press(END_OF_LINE);
      await h.page.keyboard.type(` edit ${i}`);
      await waitForFile(h.vault.file("Work/Meeting notes-2.md"), (t) => t.includes(`edit ${i}`));
      await sleep(SETTLE_MS);
      expect(
        h.vault.list().filter((f) => f.endsWith(".md")),
        `after save ${i}`,
      ).toEqual(["Work/Meeting notes-2.md", "Work/Meeting notes.md"]);
    }
    expect(h.vault.read("Work/Meeting notes.md")).toBe("In Work.\n");
    expectNoTempFiles(h.vault);

    // A restart reveals nothing the user had not already seen.
    await h.restart();
    await expectTitlesMatchFiles(h.page, h.vault);
    expect((await sidebarNoteTitles(h.page)).sort()).toEqual(["Meeting notes", "Meeting notes-2"]);
    expect(h.vault.list().filter((f) => f.endsWith(".md"))).toEqual([
      "Work/Meeting notes-2.md",
      "Work/Meeting notes.md",
    ]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a name the filesystem cannot hold shows as the name the file got, immediately", async () => {
  const h = await launchApp({ "Plain.md": "Body.\n", "Other.md": "Other.\n" });
  try {
    await h.openNote("Plain");
    await renameRow(h.page, "Plain", "Notes: a/b?");
    await waitForFile(h.vault.file("Notes_ a_b_.md"), (t) => t === "Body.\n", {
      label: "renamed file under its sanitised name",
    });
    await expect.poll(() => h.vault.exists("Plain.md"), { timeout: 3_000 }).toBe(false);

    // Sidebar row and editor title both read the real filename, before any restart.
    await expectTitlesMatchFiles(h.page, h.vault);
    await expect.poll(() => editorTitle(h.page)).toBe("Notes_ a_b_");

    // Renaming onto an existing name resolves to a suffix, shown at once.
    await renameRow(h.page, "Notes_ a_b_", "Other");
    await waitForFile(h.vault.file("Other-2.md"), (t) => t === "Body.\n", {
      label: "renamed file under its suffixed name",
    });
    await expectTitlesMatchFiles(h.page, h.vault);
    await expect.poll(() => editorTitle(h.page)).toBe("Other-2");
    expect(h.vault.read("Other.md")).toBe("Other.\n");

    // Leading and trailing whitespace is not part of a filename either. Typed
    // in the editor's title field, which (unlike the sidebar rename) trims
    // nothing itself and stays focused while the write resolves: the sidebar
    // shows the real name at once, the leading spaces are painted away, and
    // the trailing ones stay under the caret so typing on can continue (the
    // trailing-space test below).
    await h.page.getByRole("textbox", { name: "Note title" }).click();
    await h.page.keyboard.press(`${MOD}+a`);
    await h.page.keyboard.type("  Padded  ");
    await waitForFile(h.vault.file("Padded.md"), (t) => t === "Body.\n", {
      label: "renamed file under its trimmed name",
    });
    await expectTitlesMatchFiles(h.page, h.vault);
    // (Chromium holds a typed trailing space as U+00A0; `\s` covers both.)
    await expect.poll(() => editorTitle(h.page)).toMatch(/^Padded\s\s$/);

    // A change of letter case alone renames the file too (on a
    // case-insensitive volume that is the note's own file under a new name).
    await renameRow(h.page, "Padded", "padded");
    await waitForFile(h.vault.file("padded.md"), (t) => t === "Body.\n", {
      label: "renamed file under its new casing",
    });
    await sleep(SETTLE_MS);
    expect(mdFiles(h.vault)).toEqual(["Other.md", "padded.md"]);
    await expectTitlesMatchFiles(h.page, h.vault);
    await expect.poll(() => editorTitle(h.page)).toBe("padded");

    // A cleared title is left alone while the caret is still in it (the
    // placeholder already reads Untitled), even once the write has landed
    // under `Untitled.md`; it becomes the file's name the moment the caret
    // leaves, with no further edit (2026-09-17: it used to wait for the next
    // write). The emptied field's own line break must not become the title:
    // that made a file called `_.md`.
    await h.page.getByRole("textbox", { name: "Note title" }).click();
    await h.page.keyboard.press(`${MOD}+a`);
    await h.page.keyboard.press("Backspace");
    await expect.poll(() => h.vault.exists("Untitled.md")).toBe(true);
    await sleep(SETTLE_MS);
    // (innerText reads the empty field's own <br> as a newline.)
    expect((await editorTitle(h.page)).trim()).toBe("");
    await h.page.locator("[data-block-id]").first().click();
    await expect.poll(() => editorTitle(h.page)).toBe("Untitled");
    await expectTitlesMatchFiles(h.page, h.vault);
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" more");
    await waitForFile(h.vault.file("Untitled.md"), (t) => t === "Body. more\n", {
      label: "file under the Untitled fallback",
    });
    await sleep(SETTLE_MS);
    expect(mdFiles(h.vault)).toEqual(["Other.md", "Untitled.md"]);
    await expectTitlesMatchFiles(h.page, h.vault);
    await expect.poll(() => editorTitle(h.page)).toBe("Untitled");
    expectNoTempFiles(h.vault);

    await h.restart();
    await expectTitlesMatchFiles(h.page, h.vault);
    expect(mdFiles(h.vault)).toEqual(["Other.md", "Untitled.md"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

/**
 * Review 2026-09-07, §2.7. A trailing space typed into the title is not part
 * of a filename, so the write lands `Meeting.md`; the field then took that
 * name back while the caret was still in it, the space under the caret went
 * with it, and `notes` typed next gave `Meetingnotes`. A resolution that is
 * whitespace at the edges alone is adopted into state (the sidebar and the
 * next write use the real name) and the focused field is left as typed.
 */
test("a trailing space typed into the title survives the write resolving under the caret", async () => {
  const h = await launchApp({ "Plain.md": "Body.\n" });
  try {
    await h.openNote("Plain");
    await h.page.getByRole("textbox", { name: "Note title" }).click();
    await h.page.keyboard.press(`${MOD}+a`);
    await h.page.keyboard.type("Meeting ");
    await waitForFile(h.vault.file("Meeting.md"), (t) => t === "Body.\n", {
      label: "renamed file under its trimmed name",
    });
    await expectTitlesMatchFiles(h.page, h.vault);
    await sleep(SETTLE_MS);

    await h.page.keyboard.type("notes");
    await waitForFile(h.vault.file("Meeting notes.md"), (t) => t === "Body.\n", {
      label: "renamed file under the full name",
    });
    await sleep(SETTLE_MS);
    expect(mdFiles(h.vault)).toEqual(["Meeting notes.md"]);
    await expectTitlesMatchFiles(h.page, h.vault);
    expect(await editorTitle(h.page)).toBe("Meeting notes");
    expectNoTempFiles(h.vault);

    // A character the filesystem rewrites is painted in place, and the
    // trailing space beside it still survives.
    await h.page.keyboard.press(`${MOD}+a`);
    await h.page.keyboard.type("a/b ");
    await waitForFile(h.vault.file("a_b.md"), (t) => t === "Body.\n", {
      label: "renamed file under its sanitised name",
    });
    await sleep(SETTLE_MS);
    await h.page.keyboard.type("notes");
    await waitForFile(h.vault.file("a_b notes.md"), (t) => t === "Body.\n", {
      label: "renamed file under the full sanitised name",
    });
    await sleep(SETTLE_MS);
    expect(mdFiles(h.vault)).toEqual(["a_b notes.md"]);
    await expectTitlesMatchFiles(h.page, h.vault);
    expect(await editorTitle(h.page)).toBe("a_b notes");

    await h.restart();
    await h.openNote("a_b notes");
    expect(await editorTitle(h.page)).toBe("a_b notes");
    expect(mdFiles(h.vault)).toEqual(["a_b notes.md"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
