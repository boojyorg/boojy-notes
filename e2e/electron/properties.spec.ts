import { expect, test } from "@playwright/test";
import { launchApp, MOD, SETTLE_MS, sleep, waitForFile } from "./harness";

/**
 * Editing a note's properties in place. Every edit reaches the file as a
 * change to that property's own text alone (a comment above and a trailing
 * comment survive); one ⌘Z takes it back; the fences go only when nothing,
 * not even a comment, is left; and an outside edit is never written over.
 */

const NOTE = [
  "---",
  "# Imported from Obsidian",
  "title: The Empire Strikes Back # the sequel",
  "year: 1980",
  'episode: "05"',
  "favourite: true",
  "cast:",
  "  - Mark Hamill",
  "  - Harrison Ford",
  "---",
  "Body.",
  "",
].join("\n");

const row = (key: string) => `.props-row[data-key="${key}"]`;

test("each edit writes only its property's text, and one ⌘Z takes it back", async () => {
  const h = await launchApp({ "Film.md": NOTE });
  const file = h.vault.file("Film.md");
  try {
    await h.openNote("Film");

    await h.page.locator(`${row("title")} .props-val`).click();
    await h.page.keyboard.press(`${MOD}+a`);
    await h.page.keyboard.type("Return of the Jedi");
    await h.page.keyboard.press("Enter");
    const titled = NOTE.replace("The Empire Strikes Back #", "Return of the Jedi #");
    await waitForFile(file, (t) => t === titled, { label: "the title, its comment kept" });
    // And the row shows it: the rows are React's to paint, after every commit.
    await expect(h.page.locator(`${row("title")} .props-value`)).toHaveText("Return of the Jedi");

    await h.page.locator(`${row("favourite")} [role=checkbox]`).click();
    const ticked = titled.replace("favourite: true", "favourite: false");
    await waitForFile(file, (t) => t === ticked, { label: "the box unticked" });

    await h.page.locator(`${row("cast")} [aria-label="Remove Mark Hamill"]`).click();
    const cast = ticked.replace("  - Mark Hamill\n", "");
    await waitForFile(file, (t) => t === cast, { label: "the item gone, the other's line kept" });

    // Several Backspaces, as a person renames: each one is taken (only the first was, once).
    await h.page.locator(`${row("year")} .props-name`).click();
    await h.page.keyboard.press(`${MOD}+a`);
    await h.page.keyboard.press("ArrowRight");
    for (let i = 0; i < 4; i++) await h.page.keyboard.press("Backspace");
    await expect(h.page.locator(`${row("year")} .props-input`)).toHaveValue("");
    await h.page.keyboard.type("released");
    await h.page.keyboard.press("Enter");
    const renamed = cast.replace("year: 1980", "released: 1980");
    await waitForFile(file, (t) => t === renamed, { label: "the name changed, the value kept" });

    await h.page.locator(`${row("episode")} .props-icon`).click();
    await h.page.getByRole("menuitemradio", { name: "Number" }).click();
    await expect(h.page.locator(".props-confirm")).toContainText("“05” will become 5.");
    await h.page.getByRole("menuitem", { name: "Keep as Text" }).click();
    await sleep(SETTLE_MS);
    expect(h.vault.read("Film.md"), "Keep changes nothing").toBe(renamed);

    // Focus back in the note's text, ⌘Z is the note's: the rename comes undone.
    await h.page.locator("[data-block-type='p']").first().click();
    await h.page.keyboard.press(`${MOD}+z`);
    await waitForFile(file, (t) => t === cast, { label: "one ⌘Z takes the rename back" });
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("removing the last property takes the fences only when nothing is left", async () => {
  const BARE = "---\ntitle: A\n---\nBody.\n";
  const COMMENTED = "---\n# keep me\ntitle: A\n---\nBody.\n";
  const h = await launchApp({ "Bare.md": BARE, "Commented.md": COMMENTED });
  try {
    for (const [name, expected] of [
      ["Bare", "Body.\n"],
      ["Commented", "---\n# keep me\n---\nBody.\n"],
    ] as const) {
      await h.openNote(name);
      await h.page.locator(`${row("title")} .props-icon`).click();
      await h.page.getByRole("menuitem", { name: "Remove" }).click();
      await waitForFile(h.vault.file(`${name}.md`), (t) => t === expected, {
        label: `${name} after Remove`,
      });
    }
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("an outside change to the property being edited is never written over", async () => {
  const h = await launchApp({ "Film.md": NOTE });
  const file = h.vault.file("Film.md");
  try {
    await h.openNote("Film");
    await h.page.locator(`${row("title")} .props-val`).click();
    await h.page.keyboard.press(`${MOD}+a`);
    await h.page.keyboard.type("Mine");

    // Another property changes outside: the edit stays open and both survive.
    const theirsYear = NOTE.replace("year: 1980", "year: 1981");
    h.vault.write("Film.md", theirsYear);
    await expect(h.page.locator(`${row("year")} .props-value`)).toHaveText("1981");
    await expect(h.page.locator(`${row("title")} .props-input`)).toHaveValue("Mine");
    await h.page.keyboard.press("Enter");
    await waitForFile(
      file,
      (t) => t === theirsYear.replace("The Empire Strikes Back #", "Mine #"),
      {
        label: "both changes kept",
      },
    );

    // The same property changes outside: the edit is set aside, the outside value stands.
    await h.page.locator(`${row("title")} .props-val`).click();
    await h.page.keyboard.press(`${MOD}+a`);
    await h.page.keyboard.type("Second");
    const theirsTitle = h.vault.read("Film.md").replace("Mine #", "Theirs #");
    h.vault.write("Film.md", theirsTitle);
    await expect(h.page.locator(`${row("title")} .props-notice`)).toContainText(
      "changed outside Boojy",
    );
    await sleep(SETTLE_MS);
    expect(h.vault.read("Film.md")).toBe(theirsTitle);

    // Restore brings the draft back for the user to keep, or not.
    await h.page.locator(`${row("title")} .props-restore`).click();
    await expect(h.page.locator(`${row("title")} .props-input`)).toHaveValue("Second");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("found in review: spaces kept on a blur, an anchor's holder kept, a vanished row's draft kept", async () => {
  const SPACED = '---\ntitle: "  A  "\n---\nBody.\n';
  const ANCHORED = "---\nsource: &value one\ncopy: *value\n---\nBody.\n";
  const h = await launchApp({ "Spaced.md": SPACED, "Anchored.md": ANCHORED, "Film.md": NOTE });
  try {
    await h.openNote("Spaced");
    await h.page.locator(`${row("title")} .props-val`).click();
    await h.page.locator("[data-block-type='p']").first().click();
    await sleep(SETTLE_MS);
    expect(h.vault.read("Spaced.md"), "opening and leaving writes nothing").toBe(SPACED);

    await h.openNote("Anchored");
    await h.page.locator(`${row("source")} .props-icon`).click();
    await h.page.getByRole("menuitem", { name: "Remove" }).click();
    await expect(h.page.locator(".props-note")).toContainText("couldn't make that change safely");
    await sleep(SETTLE_MS);
    expect(h.vault.read("Anchored.md"), "no dangling alias written").toBe(ANCHORED);

    await h.openNote("Film");
    await h.page.locator(`${row("title")} .props-val`).click();
    await h.page.keyboard.press(`${MOD}+a`);
    await h.page.keyboard.type("Mine");
    h.vault.write("Film.md", NOTE.replace("title:", "renamed:"));
    await expect(h.page.locator(".props-notice[data-lost]")).toContainText("It read “Mine”");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
