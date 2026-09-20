/**
 * The link picker (2026-09-20): one popover for a web address and a note,
 * from Cmd+K, the toolbar, `[[`, a right-click and a click on a link that
 * names no note or two. Proven in the real app because what it writes is a
 * file's bytes, because creating a note from it is a file, and because the
 * caret, the selection and the popover's placement are measured there.
 */
import { expect, type Page, test } from "@playwright/test";
import {
  END_OF_LINE,
  expandAllFolders,
  launchApp,
  MOD,
  SETTLE_MS,
  sleep,
  waitForFile,
} from "./harness";

const FILES: Record<string, string> = {
  "Personal/Week 38.md":
    "Next week I want to get back to the reading list.\n\nTalk: https://www.youtube.com/watch?v=dQw4w9WgXcQ\n\nThe plan for the second semester with [[Todd's Note]] and [[Old plan]].\n",
  "Personal/Goals.md": "Personal goals.\n",
  "University/Semester 1/Goals.md": "Uni goals.\n",
  "University/Semester 1/Semester plan.md": "Plan.\n",
  "University/Archive/Todd's Note.md": "Todd.\n",
  "Reading/google.com.md": "Clipping.\n",
};
const NOTE = "Personal/Week 38.md";

const picker = (page: Page) => page.getByTestId("link-picker");
const field = (page: Page) => page.getByPlaceholder("Paste a link or search notes…");
const rowsOf = (page: Page) =>
  picker(page)
    .locator('[role="option"]')
    .evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).innerText.replace(/\s+/g, " ").trim()),
    );
const block = (page: Page, n: number) => page.locator("[data-block-id]").nth(n);

/** Select `word` inside block `n` by double-clicking its middle, then extend by `extra` characters. */
async function selectWords(page: Page, n: number, from: string, count: number) {
  const b = block(page, n);
  // The block's left edge: its middle may be a link, and a click there opens it.
  await b.click({ position: { x: 4, y: 8 } });
  await page.keyboard.press(START_OF_BLOCK);
  const text = await b.innerText();
  const at = text.indexOf(from);
  for (let i = 0; i < at; i++) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < count; i++) await page.keyboard.press("Shift+ArrowRight");
}
const START_OF_BLOCK = process.platform === "darwin" ? "Meta+ArrowLeft" : "Home";

test("selected words become a note link with those words as its text; a namesake is written with its folder", async () => {
  const h = await launchApp(FILES);
  try {
    await expandAllFolders(h.page);
    await h.openNote("Week 38");
    await selectWords(h.page, 2, "second semester", "second semester".length);
    await h.page.keyboard.press(`${MOD}+k`);
    await expect(picker(h.page)).toBeVisible();
    await expect(field(h.page)).toBeFocused();
    // The words wear the wash while the popover holds focus; nothing of it reaches the file.
    await expect(h.page.locator("[data-block-id] mark.link-picker-wash")).toHaveText(
      "second semester",
    );
    await h.page.keyboard.type("plan");
    expect(await rowsOf(h.page)).toEqual([
      "Semester plan University/Semester 1",
      "Create note “plan”",
    ]);
    await h.page.keyboard.press("Enter");
    await expect(picker(h.page)).toHaveCount(0);
    await expect(h.page.locator("mark.link-picker-wash")).toHaveCount(0);
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("[[Semester plan|second semester]]"));
    expect(h.vault.read(NOTE)).not.toContain("mark");
    // The caret continues after the link.
    await h.page.keyboard.type("!");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("[[Semester plan|second semester]]!"));

    // A namesake: two Goals rows told apart by folder; the chosen one carries its folder.
    await selectWords(h.page, 0, "reading list", "reading list".length);
    await h.page.keyboard.press(`${MOD}+k`);
    await h.page.keyboard.type("goals");
    // Two rows told apart by folder, and no Create row: a note of that name exists.
    expect(await rowsOf(h.page)).toEqual(["Goals Personal", "Goals University/Semester 1"]);
    await h.page.keyboard.press("ArrowDown");
    await h.page.keyboard.press("Enter");
    await waitForFile(h.vault.file(NOTE), (t) =>
      t.includes("[[University/Semester 1/Goals|reading list]]"),
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("an address without its scheme is the first row and gets https; a note of that name is its own row; Create only where no note exists", async () => {
  const h = await launchApp(FILES);
  try {
    await expandAllFolders(h.page);
    await h.openNote("Week 38");
    await block(h.page, 0).click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" ");
    await h.page.keyboard.press(`${MOD}+k`);
    await h.page.keyboard.type("google.com");
    expect(await rowsOf(h.page)).toEqual(["Link to google.com", "google.com Reading"]);
    await h.page.keyboard.press("Escape");
    await expect(picker(h.page)).toHaveCount(0);

    await h.page.keyboard.press(`${MOD}+k`);
    await h.page.keyboard.type("github.com/boojy");
    expect(await rowsOf(h.page)).toEqual([
      "Link to github.com/boojy",
      "Create note “github.com/boojy”",
    ]);
    await picker(h.page).getByTestId("link-row-url").click();
    await expect(picker(h.page)).toHaveCount(0);
    // Nothing selected: a bare address, kept verbatim. (The space typed
    // before it reaches the file as U+00A0, the known trailing-space residue,
    // so the check starts at the address.)
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("https://github.com/boojy\n"));

    // The [[ route is notes only: no address row for the same letters.
    await h.page.keyboard.type(" [[goo");
    await expect(picker(h.page)).toBeVisible();
    await expect(h.page.getByPlaceholder("Search notes…")).toBeFocused();
    // Notes only, and Create for the letters as typed, never an address row.
    expect(await rowsOf(h.page)).toEqual(["google.com Reading", "Create note “goo”"]);
    await h.page.keyboard.press("Enter");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("[[google.com]]"));
    // And the caret continues outside the link.
    await h.page.keyboard.type(" after");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("[[google.com]] after"));
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("editing: Text and Destination, no list until the destination changes, Enter or a press outside commits, Tab commits nothing, an invalid destination is refused", async () => {
  const h = await launchApp(FILES);
  try {
    await expandAllFolders(h.page);
    await h.openNote("Week 38");
    // Cmd+K with the caret in the link edits it. A click on a link opens it,
    // so the caret walks in from the block's start.
    await block(h.page, 1).click({ position: { x: 4, y: 8 } });
    await h.page.keyboard.press(START_OF_BLOCK);
    for (let i = 0; i < 10; i++) await h.page.keyboard.press("ArrowRight");
    await h.page.keyboard.press(`${MOD}+k`);
    const text = h.page.getByLabel("Text");
    const dest = h.page.getByLabel("Destination");
    await expect(text).toBeFocused();
    await expect(dest).toHaveValue("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await expect(picker(h.page).locator('[role="listbox"]')).toHaveCount(0);
    await h.page.keyboard.type("Link to YouTube");
    await h.page.keyboard.press("Tab");
    await expect(dest).toBeFocused();
    await expect(picker(h.page)).toBeVisible();
    await h.page.keyboard.press("Enter");
    await expect(picker(h.page)).toHaveCount(0);
    await waitForFile(h.vault.file(NOTE), (t) =>
      t.includes("Talk: [Link to YouTube](https://www.youtube.com/watch?v=dQw4w9WgXcQ)"),
    );

    // A wikilink: right-click, Edit link…, change the destination: only then a list.
    const todd = h.page.locator("[data-block-id] .wikilink", { hasText: "Todd's Note" });
    await todd.click({ button: "right" });
    await h.page.getByText("Edit link…").click();
    await expect(text).toBeFocused();
    await expect(dest).toHaveValue("[[Todd's Note]]");
    await dest.fill("");
    await h.page.keyboard.type("zzz");
    expect(await rowsOf(h.page)).toEqual(["Create note “zzz”"]);
    await h.page.keyboard.press("ArrowDown");
    // An invalid destination: nothing chosen, refused, the link untouched.
    await dest.fill("");
    await h.page.keyboard.press("Enter");
    await expect(picker(h.page)).toBeVisible();
    await expect(dest).toHaveAttribute("aria-invalid", "true");
    await h.page.keyboard.type("Goals");
    await h.page.keyboard.press("ArrowDown");
    await h.page.keyboard.press("Enter");
    await waitForFile(h.vault.file(NOTE), (t) =>
      t.includes("[[University/Semester 1/Goals|Todd's Note]]"),
    );

    // A press outside commits a text change.
    const renamed = h.page.locator("[data-block-id] .wikilink", { hasText: "Todd's Note" });
    await renamed.click({ button: "right" });
    await h.page.getByText("Edit link…").click();
    await expect(text).toBeFocused();
    await h.page.keyboard.type("Todd");
    await h.page.locator(".editor-scroll").click({ position: { x: 20, y: 400 } });
    await waitForFile(h.vault.file(NOTE), (t) =>
      t.includes("[[University/Semester 1/Goals|Todd]]"),
    );

    // Remove keeps the words.
    await h.page
      .locator("[data-block-id] .wikilink", { hasText: "Todd" })
      .click({ button: "right" });
    await h.page.getByText("Remove link").click();
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("with Todd and [[Old plan]]"));
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the chip says where a link goes; a missing or shared name says so and its click opens the picker", async () => {
  const h = await launchApp({
    ...FILES,
    "Personal/Week 38.md":
      "See [[Goals]], [[Old plan]] and [[Todd's Note]] and https://example.org\n",
  });
  try {
    await expandAllFolders(h.page);
    await h.openNote("Week 38");
    const chip = h.page.getByTestId("link-tooltip");
    const links = h.page.locator("[data-block-id] .wikilink");
    // Two notes share the name: drawn unresolved, the chip says so.
    await expect(links.nth(0)).toHaveClass(/wikilink-broken/);
    // Re-hovered until the chip shows: the Linux runner sends a stray mouseout
    // ~500 ms after a hover when the other worker launches, which cancels the
    // rest (the tooltip specs do the same).
    const chipFor = async (target: ReturnType<Page["locator"]>, text: string) => {
      await expect(async () => {
        await h.page.mouse.move(5, 5);
        await target.hover();
        await expect(chip).toHaveText(text, { timeout: 1_500 });
      }).toPass({ timeout: 10_000 });
    };
    await chipFor(links.nth(0), "Goals2 notes share this name");
    await chipFor(links.nth(1), "Old planno note by this name");
    await chipFor(links.nth(2), "Todd's NoteUniversity/Archive");
    await chipFor(h.page.locator("[data-block-id] a").first(), "https://example.org");
    await h.page.mouse.move(5, 5);
    await expect(chip).toHaveCount(0);

    // The keyboard: a caret that comes to rest inside a link shows the chip too.
    // (The block's left edge: its middle is a link, and a click there opens it.)
    await block(h.page, 0).click({ position: { x: 4, y: 8 } });
    await h.page.keyboard.press(START_OF_BLOCK);
    for (let i = 0; i < 6; i++) await h.page.keyboard.press("ArrowRight");
    await expect(chip).toHaveText("Goals2 notes share this name", { timeout: 2_000 });
    await h.page.keyboard.press(START_OF_BLOCK);
    await expect(chip).toHaveCount(0);

    // A click on the shared name opens the picker with both candidates and no guess.
    await links.nth(0).click();
    await expect(picker(h.page)).toBeVisible();
    expect(await rowsOf(h.page)).toEqual(["Goals Personal", "Goals University/Semester 1"]);
    await h.page.keyboard.press("Enter");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("See [[Personal/Goals|Goals]]"));
    await expect(links.nth(0)).not.toHaveClass(/wikilink-broken/);
    await sleep(SETTLE_MS);
    expect(h.vault.list()).not.toContain("Old plan.md");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
