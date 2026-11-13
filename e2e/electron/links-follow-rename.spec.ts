/**
 * Links follow a rename or a move made in the app.
 *
 * Renaming `Beta` to `Gamma` used to leave every `[[Beta]]` in the vault
 * naming nothing, drawn dashed; moving a note broke each link that spelled
 * its path. Now every link keeps meaning the note it meant
 * (utils/linkRewrite): the notes that link to it are rewritten once the name
 * has settled, each keeping a version of what its file held first, and one
 * toast says how many links moved. Only the link changes in each file.
 *
 * Crosses the write debounce, IPC, the rename on disk and the watcher's echo,
 * so it is proven here, from the files.
 */
import { expect, test } from "@playwright/test";
import {
  SETTLE_MS,
  editorTitle,
  expandAllFolders,
  launchApp,
  moveNoteToFolder,
  renameRow,
  sleep,
  waitForFile,
} from "./harness";

const ALPHA = [
  "See [[Beta]], [[Beta#Intro|the intro]] and a [link](Beta.md).",
  "",
  "![[Beta]]",
  "",
  "Not `[[Beta]]`, and [[Other]] stays.",
  "",
].join("\n");

test("renaming a note in the sidebar rewrites the links to it, once, and renaming back restores them", async () => {
  const h = await launchApp({
    "Alpha.md": ALPHA,
    "Beta.md": "# Intro\n\nBeta body.\n",
    "Other.md": "Other.\n",
    "Plain.md": "No links here.\n",
  });
  try {
    await h.openNote("Plain");
    await renameRow(h.page, "Beta", "Gamma");
    const followed = ALPHA.replace(/\[\[Beta/g, "[[Gamma")
      .replace("(Beta.md)", "(Gamma.md)")
      .replace("`[[Gamma]]`", "`[[Beta]]`");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t === followed);
    await expect(h.page.getByText("Updated 4 links in 1 note.")).toBeVisible();

    // Only the notes that linked to it were written; the rest hold their bytes.
    await sleep(SETTLE_MS);
    expect(h.vault.list().sort()).toEqual(["Alpha.md", "Gamma.md", "Other.md", "Plain.md"]);
    expect(h.vault.read("Gamma.md")).toBe("# Intro\n\nBeta body.\n");
    expect(h.vault.read("Other.md")).toBe("Other.\n");

    // The links work: the first one opens the renamed note.
    await h.openNote("Alpha");
    // No link is left dashed: each names a note that exists.
    await expect(h.page.locator("[data-block-id] .wikilink-broken")).toHaveCount(0);
    await h.page
      .locator("[data-block-id] .wikilink", { hasText: /^Gamma$/ })
      .first()
      .click();
    await expect.poll(() => editorTitle(h.page)).toBe("Gamma");

    // What Alpha's file held before its links moved is a version of its own.
    await h.openNote("Alpha");
    await h.page.locator("button[aria-label='Note actions']").click();
    await h.page.getByRole("menuitem", { name: /Version History/ }).click();
    const versions = h.page.getByRole("listbox", { name: "Versions" });
    await expect(
      versions.getByRole("option").filter({ hasText: "Before link update" }),
    ).toHaveCount(1);
    await h.page.keyboard.press("Escape");

    await renameRow(h.page, "Gamma", "Beta");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t === ALPHA);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a name typed with pauses in the name field moves the links once, when the caret leaves", async () => {
  const h = await launchApp({ "Alpha.md": "[[Beta]]\n", "Beta.md": "Beta body.\n" });
  try {
    await h.openNote("Beta");
    const title = h.page.getByRole("textbox", { name: "Note title" });
    await title.click();
    await h.page.keyboard.press("ControlOrMeta+a");
    await h.page.keyboard.type("Ga");
    // The pause renames the file to its half-typed name; the links wait.
    await waitForFile(h.vault.file("Ga.md"), () => true);
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("[[Beta]]\n");
    await expect(h.page.getByText(/Updated \d+ link/)).toHaveCount(0);

    await h.page.keyboard.type("mma");
    await h.page.keyboard.press("Enter");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t === "[[Gamma]]\n");
    await expect(h.page.getByText("Updated 1 link in 1 note.")).toHaveCount(1);
    expect(h.vault.list().sort()).toEqual(["Alpha.md", "Gamma.md"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("moving a note carries the links that spelled its path, and the open note is repainted", async () => {
  const h = await launchApp({
    "Alpha.md": "[[Work/Gamma]] and [g](Work/Gamma.md)\n",
    "Work/Gamma.md": "Gamma.\n",
  });
  try {
    await expandAllFolders(h.page);
    await h.openNote("Alpha");
    await moveNoteToFolder(h.page, "Gamma", null);
    await waitForFile(h.vault.file("Alpha.md"), (t) => t === "[[Gamma]] and [g](Gamma.md)\n");
    // The note on screen shows the link it now holds, without being reopened.
    await expect(h.page.locator("[data-block-id] .wikilink").first()).toHaveText("Gamma");
    await expect(h.page.locator("[data-block-id] .wikilink-broken")).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
