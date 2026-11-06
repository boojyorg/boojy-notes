/**
 * Footnotes as Obsidian's editing view shows them: a reference stays the
 * literal `[^label]`, small and raised; an inline footnote stays whole and
 * muted; a definition is its own row with its label in the margin; nothing
 * is numbered, and the file's bytes are the file's. A footnote's later
 * paragraphs belong to it: moved, deleted and copied with it, one undo each.
 */
import { expect, type Page, test } from "@playwright/test";
import {
  type AppHandle,
  END_OF_LINE,
  launchApp,
  MOD,
  SETTLE_MS,
  START_OF_LINE,
  sleep,
  waitForFile,
} from "./harness";

let h: AppHandle;
let savedClipboard = "";

test.afterEach(async () => {
  await h?.app.evaluate(({ clipboard }, t) => clipboard.writeText(t), savedClipboard);
  await h?.close();
});

async function open(md: string) {
  h = await launchApp({ "F.md": md });
  savedClipboard = await h.app.evaluate(({ clipboard }) => clipboard.readText());
  await h.openNote("F");
  return h.page.locator("[data-editor] > [data-block-id]");
}
const refs = (page: Page) => page.locator("[data-editor] .md-fn-ref");
const inlines = (page: Page) => page.locator("[data-editor] .md-fn-inline");
const defs = (page: Page) => page.locator('[data-editor] [data-block-type="footnote"]');
const row = (page: Page, text: string) =>
  page.locator("[data-editor] > [data-block-id]").filter({ hasText: text });
const file = () => h.vault.read("F.md");

const NOTE =
  "Strong flour.[^1] Overnight.[^proof] Out in 2020.^[Version **1.0** [[followed]].]\n\n" +
  "[^1]: Bread flour.\n" +
  "[^proof]: Twelve hours.\n\n" +
  "    The cold slows the yeast.\n\n" +
  "Edit here.\n";

test("references, inline footnotes and definitions are drawn as written; an edit elsewhere keeps their bytes", async () => {
  await open(NOTE);
  await expect(refs(h.page)).toHaveText(["[^1]", "[^proof]"]);
  await expect(inlines(h.page)).toHaveText(["^[Version **1.0** [[followed]].]"]);
  // Literal: nothing inside an inline footnote is drawn.
  await expect(inlines(h.page).locator("strong, .wikilink")).toHaveCount(0);
  const raised = await refs(h.page)
    .first()
    .evaluate((el) => getComputedStyle(el).verticalAlign);
  expect(raised).toBe("super");
  // Each definition its own row, its label in the margin, never a number.
  await expect(defs(h.page)).toHaveCount(2);
  await expect(defs(h.page).locator("[data-footnote-label]")).toHaveText(["1", "proof"]);
  await expect(h.page.locator("[data-footnote-continuation]")).toHaveText([
    "    The cold slows the yeast.",
  ]);

  await row(h.page, "Edit here.").click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(" Done.");
  await waitForFile(
    h.vault.file("F.md"),
    (t) => t === NOTE.replace("Edit here.", "Edit here. Done."),
  );
  expect(h.pageErrors).toEqual([]);
});

test("a letter typed right after a reference is ordinary text", async () => {
  await open("Claim.[^1]\n\n[^1]: Source.\n");
  await row(h.page, "Claim.").click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type(" More");
  await waitForFile(h.vault.file("F.md"), (t) => t.startsWith("Claim.[^1] More\n"));
  await expect(refs(h.page)).toHaveText(["[^1]"]);
  // The caret stayed where it was: the next letters follow "More".
  await h.page.keyboard.type("!");
  await waitForFile(h.vault.file("F.md"), (t) => t.startsWith("Claim.[^1] More!\n"));
  await expect(refs(h.page)).toHaveText(["[^1]"]);
});

test("`[^9]: ` typed at a line's start makes a definition; Backspace at its start sheds it; undo returns it", async () => {
  await open("Claim.[^9]\n\nNext\n");
  await row(h.page, "Next").click();
  await h.page.keyboard.press(START_OF_LINE);
  await h.page.keyboard.type("[^9]: ");
  await expect(defs(h.page)).toHaveCount(1);
  await expect(defs(h.page).locator("[data-footnote-label]")).toHaveText(["9"]);
  await waitForFile(h.vault.file("F.md"), (t) => t === "Claim.[^9]\n\n[^9]: Next\n");

  // The caret is at the text's start: Backspace sheds the label, text kept.
  await h.page.keyboard.press("Backspace");
  await expect(defs(h.page)).toHaveCount(0);
  await waitForFile(h.vault.file("F.md"), (t) => t === "Claim.[^9]\n\nNext\n");
  await h.page.keyboard.press(`${MOD}+z`);
  await expect(defs(h.page)).toHaveCount(1);
  await waitForFile(h.vault.file("F.md"), (t) => t === "Claim.[^9]\n\n[^9]: Next\n");
});

const GROUP = "[^long]: First paragraph.\n\n    Second paragraph.\n";
const TWO = `One.[^long] Two.[^b]\n\n${GROUP}\n[^b]: Definition B.\n\nAfter.\n`;

test("⌘⇧↓ moves a footnote with its later paragraph past the next footnote; one undo puts it back", async () => {
  await open(TWO);
  await defs(h.page).filter({ hasText: "First paragraph." }).locator('[role="textbox"]').click();
  await h.page.keyboard.press(`${MOD}+Shift+ArrowDown`);
  await waitForFile(
    h.vault.file("F.md"),
    (t) => t === `One.[^long] Two.[^b]\n\n[^b]: Definition B.\n\n${GROUP}\nAfter.\n`,
    { label: "the footnote and its second paragraph moved below [^b]" },
  );
  await h.page.keyboard.press(`${MOD}+z`);
  await waitForFile(h.vault.file("F.md"), (t) => t === TWO, { label: "one undo" });

  // A paragraph moved up passes the whole group, never landing inside it.
  await row(h.page, "After.").click();
  await h.page.keyboard.press(`${MOD}+Shift+ArrowUp`);
  await h.page.keyboard.press(`${MOD}+Shift+ArrowUp`);
  await waitForFile(
    h.vault.file("F.md"),
    (t) => t === `One.[^long] Two.[^b]\n\nAfter.\n\n${GROUP}\n[^b]: Definition B.\n`,
    { label: "After. moved above the whole group" },
  );
  expect(h.pageErrors).toEqual([]);
});

test("a selected footnote brings its later paragraph: copied whole, deleted in one step, undone in one", async () => {
  await open(TWO);
  await defs(h.page).filter({ hasText: "First paragraph." }).locator('[role="textbox"]').click();
  await h.page.keyboard.press("Escape"); // selects the footnote, its paragraph with it
  await h.page.keyboard.press(`${MOD}+c`);
  await expect
    .poll(() => h.app.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe(GROUP.trimEnd());
  await h.page.keyboard.press("Backspace");
  await waitForFile(
    h.vault.file("F.md"),
    (t) => t === "One.[^long] Two.[^b]\n\n[^b]: Definition B.\n\nAfter.\n",
    { label: "the footnote and its paragraph removed together" },
  );
  await h.page.keyboard.press(`${MOD}+z`);
  await waitForFile(h.vault.file("F.md"), (t) => t === TWO, { label: "one undo brings both" });
  await sleep(SETTLE_MS);
  expect(file()).toBe(TWO);
  expect(h.pageErrors).toEqual([]);
});
