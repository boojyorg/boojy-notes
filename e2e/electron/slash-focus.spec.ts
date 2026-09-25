/**
 * A block chosen from the slash menu owns the next keystroke when it has a
 * field of its own: Code block focuses its textarea, Callout its title,
 * Table its first cell. A block with no field (a divider) keeps the
 * paragraph opened under it. Before this (review 2026-09-07, §1.5) every
 * special block put the caret in the paragraph after it, so the code you
 * asked for stayed empty and your lines landed as paragraphs beneath it.
 */
import { expect, test } from "@playwright/test";
import { END_OF_LINE, SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

const NOTE = "Note.md";

/** Open a fresh paragraph under the intro and choose `command` from `/`. */
async function chooseFromSlashMenu(h: Awaited<ReturnType<typeof launchApp>>, command: string) {
  await h.page.locator("[data-block-type='p']", { hasText: "Intro." }).click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.press("Enter");
  await h.page.keyboard.type(`/${command}`);
  const menu = h.page.getByRole("listbox", { name: "Slash commands" });
  await expect(menu.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await h.page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
}

test("Code block from the slash menu takes the next keystroke into its textarea", async () => {
  const h = await launchApp({ [NOTE]: "Intro.\n" });
  try {
    await h.openNote("Note");
    await chooseFromSlashMenu(h, "code");
    await expect(h.page.locator("textarea.code-textarea")).toBeFocused();
    await h.page.keyboard.type("const a = 1;");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("const a"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toContain("```\nconst a = 1;\n```");
    expect(await h.page.locator("[data-block-type='p']").allInnerTexts()).not.toContain(
      "const a = 1;",
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

// The same rule for the typed fence, which waits for its space as `# ` does
// (2026-09-19): before that ``` made the block and put the caret in the
// paragraph under it, so the first line of code landed as prose beneath the
// empty block you had just asked for.
test("a code block typed as ``` and a space takes the next keystroke into its textarea", async () => {
  const h = await launchApp({ [NOTE]: "Intro.\n" });
  try {
    await h.openNote("Note");
    await h.page.locator("[data-block-type='p']", { hasText: "Intro." }).click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.type("``` ");
    await expect(h.page.locator("textarea.code-textarea")).toBeFocused();
    await h.page.keyboard.type("const a = 1;");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("const a"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toContain("```\nconst a = 1;\n```");
    expect(await h.page.locator("[data-block-type='p']").allInnerTexts()).not.toContain(
      "const a = 1;",
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

// The space is the trigger: until it arrives the fence is text you can keep
// typing, which is also how a literal ``` gets typed at all.
test("a fence with no space after it stays text under the caret", async () => {
  const h = await launchApp({ [NOTE]: "Intro.\n" });
  try {
    await h.openNote("Note");
    await h.page.locator("[data-block-type='p']", { hasText: "Intro." }).click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.type("```rust");
    await expect(h.page.locator("textarea.code-textarea")).toHaveCount(0);
    expect(await h.page.locator("[data-block-type='p']").allInnerTexts()).toContain("```rust");
    // And the space it was waiting for opens the block, in that language.
    await h.page.keyboard.type(" ");
    await expect(h.page.locator("textarea.code-textarea")).toBeFocused();
    await expect(h.page.getByRole("button", { name: "Code language" })).toHaveText(/rust/);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Callout from the slash menu takes the next keystroke into its title", async () => {
  const h = await launchApp({ [NOTE]: "Intro.\n" });
  try {
    await h.openNote("Note");
    await chooseFromSlashMenu(h, "call");
    await expect(h.page.locator(".callout-title")).toBeFocused();
    await h.page.keyboard.type("Heads up");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("Heads up"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toContain("> [!note] Heads up");
    expect(await h.page.locator("[data-block-type='p']").allInnerTexts()).not.toContain("Heads up");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Table from the slash menu takes the next keystroke into its first cell", async () => {
  const h = await launchApp({ [NOTE]: "Intro.\n" });
  try {
    await h.openNote("Note");
    await chooseFromSlashMenu(h, "table");
    await expect(h.page.locator("table.table-block th").first()).toBeFocused();
    await h.page.keyboard.type("Name");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("Name"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toContain("| Name |");
    expect(await h.page.locator("[data-block-type='p']").allInnerTexts()).not.toContain("Name");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Divider from the slash menu still opens a paragraph under it and types there", async () => {
  const h = await launchApp({ [NOTE]: "Intro.\n" });
  try {
    await h.openNote("Note");
    await chooseFromSlashMenu(h, "div");
    await h.page.keyboard.type("after");
    await waitForFile(h.vault.file(NOTE), (t) => t.includes("after"));
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toContain("---\n\nafter");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
