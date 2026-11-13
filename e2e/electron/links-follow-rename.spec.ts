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

test("renaming a folder carries every link that spelled its path, in one go", async () => {
  const index =
    "[[Uni/Notes]], [n](Uni/Notes.md) and [[Uni/Deep/Essay#Intro|essay]]; [[Notes]] by name.\n";
  const h = await launchApp({
    "Index.md": index,
    "Uni/Notes.md": "[e](Deep/Essay.md) and [[Uni/Deep/Essay]]\n",
    "Uni/Deep/Essay.md": "# Intro\n\nEssay.\n",
  });
  try {
    await expandAllFolders(h.page);
    await h.openNote("Index");
    await renameRow(h.page, "Uni", "Study");
    // A path that named the folder is the shortest clear name now; a link by
    // name alone never needed the path and is left as written.
    const followed =
      "[[Notes]], [n](Study/Notes.md) and [[Essay#Intro|essay]]; [[Notes]] by name.\n";
    await waitForFile(h.vault.file("Index.md"), (t) => t === followed);
    // Inside the folder: the relative link still reaches its neighbour as
    // written; the one that spelled the old path follows.
    await waitForFile(
      h.vault.file("Study/Notes.md"),
      (t) => t === "[e](Deep/Essay.md) and [[Essay]]\n",
    );
    await expect(h.page.getByText("Updated 4 links in 2 notes.")).toBeVisible();
    await expect(h.page.locator("[data-block-id] .wikilink-broken")).toHaveCount(0);

    await sleep(SETTLE_MS);
    expect(h.vault.list().sort()).toEqual(["Index.md", "Study/Deep/Essay.md", "Study/Notes.md"]);
    expect(h.vault.read("Study/Deep/Essay.md")).toBe("# Intro\n\nEssay.\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a name typed and the app closed with the caret still in the name field: the links follow first", async () => {
  const h = await launchApp({ "Alpha.md": "[[Beta]]\n", "Beta.md": "Beta body.\n" });
  try {
    await h.openNote("Beta");
    await h.page.getByRole("textbox", { name: "Note title" }).click();
    await h.page.keyboard.press("ControlOrMeta+a");
    await h.page.keyboard.type("Gamma");
    await h.restart();
    expect(h.vault.list().sort()).toEqual(["Alpha.md", "Gamma.md"]);
    expect(h.vault.read("Alpha.md")).toBe("[[Gamma]]\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("undo in a note whose links moved never brings the old links back", async () => {
  const h = await launchApp({ "Alpha.md": "See [[Beta]].\n", "Beta.md": "Beta body.\n" });
  try {
    await h.openNote("Alpha");
    const block = h.page.locator("[data-block-id]").first();
    await block.click();
    await h.page.keyboard.press("ControlOrMeta+ArrowRight");
    await h.page.keyboard.type(" More");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t === "See [[Beta]]. More\n");

    await renameRow(h.page, "Beta", "Gamma");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t === "See [[Gamma]]. More\n");

    // The typing is an undo entry of Alpha holding `[[Beta]]`: it went with
    // the rewrite. (The rename opened the renamed note; undo there would undo
    // the rename, and the links would rightly follow back.)
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press("ControlOrMeta+z");
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("See [[Gamma]]. More\n");
    await expect(h.page.locator("[data-block-id] .wikilink-broken")).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a new note typed through a name that links were waiting for does not capture them", async () => {
  const h = await launchApp({ "Alpha.md": "A note to write: [[Project]].\n" });
  try {
    await h.openNote("Alpha");
    await h.page.getByRole("button", { name: "New note", exact: true }).click();
    const title = h.page.getByRole("textbox", { name: "Note title" });
    await expect(title).toBeFocused();
    await h.page.keyboard.type("Project");
    // The pause writes the file under its half-typed name.
    await waitForFile(h.vault.file("Project.md"), () => true);
    await h.page.keyboard.type(" Plan");
    await h.page.keyboard.press("Enter");
    await waitForFile(h.vault.file("Project Plan.md"), () => true);
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("A note to write: [[Project]].\n");
    await expect(h.page.getByText(/Updated \d+ link/)).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
