/**
 * Footnotes as Reading view numbers them, edited in place: a reference is one
 * sealed character showing `[1]` (by first reference), a definition shows
 * `1.` (an unused one a dash, its label above it on hover or with the caret),
 * the footnotes that end the note sit under a divider, ↩ goes back up. The
 * file's bytes are the file's: nothing is renumbered or moved. An inline
 * footnote stays whole and muted. A footnote's later paragraphs belong to it.
 */
import { expect, type Page, test } from "@playwright/test";
import {
  type AppHandle,
  END_OF_LINE,
  launchApp,
  MOD,
  menuClick,
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

test("references show their numbers, definitions theirs; inline footnotes stay as written; an edit elsewhere keeps every byte", async () => {
  await open(NOTE);
  // Each reference holds its source; its number is drawn over it.
  await expect(refs(h.page)).toHaveText(["[^1]", "[^proof]"]);
  await expect(refs(h.page).nth(0)).toHaveAttribute("data-n", "1");
  await expect(refs(h.page).nth(1)).toHaveAttribute("data-n", "2");
  await expect(inlines(h.page)).toHaveText(["^[Version **1.0** [[followed]].]"]);
  // Literal: nothing inside an inline footnote is drawn.
  await expect(inlines(h.page).locator("strong, .wikilink")).toHaveCount(0);
  const raised = await refs(h.page)
    .first()
    .evaluate((el) => getComputedStyle(el).verticalAlign);
  expect(raised).toBe("super");
  // Each definition its own row, its number before it; its label is the file's.
  await expect(defs(h.page)).toHaveCount(2);
  await expect(defs(h.page).locator("[data-footnote-label]")).toHaveText(["1", "proof"]);
  const shown = await defs(h.page)
    .locator("[data-footnote-label]")
    .evaluateAll((els) => els.map((el) => getComputedStyle(el, "::after").content));
  expect(shown).toEqual(['"1."', '"2."']);
  // Text follows them, so they do not end the note: no divider.
  expect(
    await defs(h.page)
      .first()
      .evaluate((el) => el.hasAttribute("data-fn-group")),
  ).toBe(false);
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

const BACK = process.platform === "darwin" ? "Meta+BracketLeft" : "Alt+ArrowLeft";

test("a reference's hover shows its definition, later paragraphs too; a missing one is said", async () => {
  await open(`${NOTE}\nNowhere.[^x]\n`);
  const chip = h.page.getByTestId("link-tooltip");
  const chipFor = async (label: string, want: string) => {
    await expect(async () => {
      await h.page.mouse.move(5, 5);
      await refs(h.page).filter({ hasText: label }).hover();
      await expect(chip).toHaveText(want, { timeout: 1_500 });
    }).toPass({ timeout: 10_000 });
  };
  await chipFor("[^proof]", "Twelve hours.\nThe cold slows the yeast.");
  await expect(h.page.getByTestId("link-tooltip-mark")).toHaveCount(0);
  await chipFor("[^x]", "[^x]no footnote by this label");
  await expect(h.page.getByTestId("link-tooltip-mark")).toHaveCount(1);
  expect(h.pageErrors).toEqual([]);
});

test("a click on a reference puts the caret at its definition's end; Back returns to it", async () => {
  await open(NOTE);
  await refs(h.page).filter({ hasText: "[^1]" }).click();
  await h.page.keyboard.type(" Strong.");
  await waitForFile(h.vault.file("F.md"), (t) => t.includes("[^1]: Bread flour. Strong.\n"));
  // Back returns to the reference: the next letters land beside it.
  await h.page.keyboard.press(BACK);
  await h.page.keyboard.type("~");
  await waitForFile(h.vault.file("F.md"), (t) => /\[\^1\]~|~\[\^1\]/.test(t.split("\n")[0]));
  await h.page.keyboard.press("Backspace");

  expect(h.pageErrors).toEqual([]);
});

test("right-click on a reference: Go to footnote; elsewhere Insert footnote opens the panel at the word, one undo takes both", async () => {
  const md = "Claim one.[^1] Claim two.\n\n[^1]: First.\n";
  await open(md);
  await refs(h.page).first().click({ button: "right" });
  await h.page.getByRole("menuitem", { name: "Go to footnote" }).click();
  await h.page.keyboard.type("!");
  await waitForFile(h.vault.file("F.md"), (t) => t.endsWith("[^1]: First.!\n"));
  await h.page.keyboard.press("Backspace");
  await waitForFile(h.vault.file("F.md"), (t) => t === md);

  // From the menu bar: after "two", before the full stop.
  await row(h.page, "Claim two.").click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.press("ArrowLeft");
  // Typed at once: a letter must land in the panel, never in the line.
  await menuClick(h, "footnote");
  await h.page.keyboard.type("Second.");
  await h.page.keyboard.press("Enter");
  const inserted = "Claim one.[^1] Claim two[^2].\n\n[^1]: First.\n[^2]: Second.\n";
  await waitForFile(h.vault.file("F.md"), (t) => t === inserted);
  await expect(refs(h.page)).toHaveText(["[^1]", "[^2]"]);

  await h.page.keyboard.press(`${MOD}+z`); // the reference and its definition, together
  await waitForFile(h.vault.file("F.md"), (t) => t === md, { label: "one undo took both" });

  // The right-click menu's row runs the same command, at the word clicked.
  await row(h.page, "Claim two.").getByText("Claim two.").click({ button: "right" });
  await h.page.getByRole("menuitem", { name: "Insert footnote" }).click();
  await h.page.keyboard.type("Third.");
  await h.page.keyboard.press("Enter");
  await waitForFile(
    h.vault.file("F.md"),
    (t) => t.includes("[^2]") && t.endsWith("[^2]: Third.\n"),
  );
  expect(h.pageErrors).toEqual([]);
});

test("`/footnote` on an empty line makes the next footnote's definition", async () => {
  await open("Claim.[^4]\n\nNext\n");
  await row(h.page, "Next").click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.press("Enter");
  await h.page.keyboard.type("/footnote");
  await h.page.keyboard.press("Enter");
  await h.page.keyboard.type("Its text.");
  await waitForFile(h.vault.file("F.md"), (t) => t === "Claim.[^4]\n\nNext\n\n[^5]: Its text.\n");
  expect(h.pageErrors).toEqual([]);
});

test("pasted footnotes keep their labels, byte for byte", async () => {
  await open("Here\n");
  const pasted =
    "Flour.[^flour] Time.[^time] Again.[^flour]\n\n[^time]: Twelve hours.\n[^flour]: Strong.\n[^unused]: Nobody.";
  await h.app.evaluate(({ clipboard }, t) => clipboard.writeText(t), pasted);
  await row(h.page, "Here").click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.press("Enter");
  await h.page.keyboard.press(`${MOD}+v`);
  await waitForFile(h.vault.file("F.md"), (t) => t === `Here\n\n${pasted}\n`, {
    label: "the pasted footnotes as written",
  });
  await expect(defs(h.page).locator("[data-footnote-label]")).toHaveText([
    "time",
    "flour",
    "unused",
  ]);
  expect(h.pageErrors).toEqual([]);
});

test("numbers follow first reference: repeats share one, a missing definition stays text, an unused or earlier duplicate is a dash", async () => {
  await open(
    "A.[^b] B.[^a] C.[^b] D.[^gone]\n\n[^a]: Ay.\n[^b]: First bee.\n[^b]: Bee.\n[^spare]: Nobody.\n",
  );
  const n = (loc: ReturnType<typeof refs>) =>
    loc.evaluateAll((els) => els.map((el) => el.getAttribute("data-n")));
  expect(await n(refs(h.page))).toEqual(["1", "2", "1", null]);
  expect(await n(defs(h.page).locator("[data-footnote-label]"))).toEqual(["2", null, "1", null]);
  // They end the note: a divider above the first of them.
  expect(
    await defs(h.page)
      .first()
      .evaluate((el) => el.hasAttribute("data-fn-group")),
  ).toBe(true);
  // No definition: the reference shows its own text.
  await expect(refs(h.page).nth(3)).toBeVisible();
  const missing = await refs(h.page)
    .nth(3)
    .evaluate((el) => (el.querySelector(".md-fn-src") as HTMLElement).offsetWidth > 0);
  expect(missing).toBe(true);
  expect(h.pageErrors).toEqual([]);
});

test("a reference is one character to the arrows; Backspace opens it back into its text, one character at a time; one undo brings it back", async () => {
  const md = "Flour.[^proof] Time.[^1]\n\n[^1]: One.\n[^proof]: Two.\n";
  await open(md);
  const first = () => file().split("\n")[0];
  await row(h.page, "Time.").getByText("Time.").click();
  await h.page.keyboard.press(END_OF_LINE);
  // Two arrows: over the number at the line's end, then the full stop.
  await h.page.keyboard.press("ArrowLeft");
  await h.page.keyboard.press("ArrowLeft");
  await h.page.keyboard.type("!");
  await waitForFile(h.vault.file("F.md"), () => first() === "Flour.[^proof] Time!.[^1]");
  await h.page.keyboard.press("Backspace");
  await waitForFile(h.vault.file("F.md"), () => first() === "Flour.[^proof] Time.[^1]");
  await sleep(SETTLE_MS);
  await h.page.keyboard.press(END_OF_LINE);
  // Backspace takes the closing ], as typing it made the number: [^1 again,
  // the caret at its end, shown as the text it now is.
  await h.page.keyboard.press("Backspace");
  await waitForFile(h.vault.file("F.md"), () => first() === "Flour.[^proof] Time.[^1");
  await expect(refs(h.page)).toHaveCount(1);
  await expect(row(h.page, "Time.")).toContainText("Time.[^1");
  await h.page.keyboard.press("Backspace");
  await waitForFile(h.vault.file("F.md"), () => first() === "Flour.[^proof] Time.[^");
  // Typed back, the ] seals it again.
  await h.page.keyboard.type("1]");
  await waitForFile(h.vault.file("F.md"), () => first() === "Flour.[^proof] Time.[^1]");
  await expect(refs(h.page)).toHaveCount(2);
  await h.page.keyboard.press("Backspace");
  await waitForFile(h.vault.file("F.md"), () => first() === "Flour.[^proof] Time.[^1");
  await sleep(SETTLE_MS);
  await h.page.keyboard.press(`${MOD}+z`);
  await waitForFile(h.vault.file("F.md"), () => file() === md, { label: "one undo" });
  expect(h.pageErrors).toEqual([]);
});

test("copying across a reference carries its source; pasted back, it is a number at once", async () => {
  await open("Flour.[^a] Time.\n\n[^a]: One.\n");
  await row(h.page, "Flour.").getByText("Time.").click();
  await h.page.keyboard.press(START_OF_LINE);
  for (let i = 0; i < 7; i++) await h.page.keyboard.press("Shift+ArrowRight");
  await h.page.keyboard.press(`${MOD}+c`);
  await expect
    .poll(() => h.app.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe("Flour.[^a]");
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.press(`${MOD}+v`);
  await waitForFile(h.vault.file("F.md"), (t) => t.startsWith("Flour.[^a] Time.Flour.[^a]\n"));
  await expect(refs(h.page)).toHaveCount(2);
  await expect(refs(h.page).nth(1)).toHaveAttribute("data-n", "1");
  expect(h.pageErrors).toEqual([]);
});

/** The point just past a footnote's text, where its ↩ is drawn. */
async function backArrow(page: Page, text: string) {
  const at = await defs(page)
    .filter({ hasText: text })
    .locator('[role="textbox"]')
    .evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const rects = r.getClientRects();
      const last = rects[rects.length - 1];
      return { x: last.right + 9, y: (last.top + last.bottom) / 2 };
    });
  await page.mouse.click(at.x, at.y);
}

test("↩ returns to the reference that was clicked while that jump is the visit open; otherwise to the first", async () => {
  await open("One.[^a] Two.[^a]\n\nMore text.\n\n[^a]: Ay.\n");
  // From the second reference: back to it, the next letter after it.
  await refs(h.page).nth(1).click();
  await backArrow(h.page, "Ay.");
  await h.page.keyboard.type("~");
  await waitForFile(h.vault.file("F.md"), (t) => t.startsWith("One.[^a] Two.[^a]~\n"));
  await h.page.keyboard.press("Backspace");
  await sleep(SETTLE_MS);
  // Reached without a jump (a click in its text): the first reference.
  await defs(h.page).getByText("Ay.").click();
  await backArrow(h.page, "Ay.");
  await h.page.keyboard.type("~");
  await waitForFile(h.vault.file("F.md"), (t) => t.startsWith("One.[^a]~ Two.[^a]\n"));
  expect(h.pageErrors).toEqual([]);
});

test("↩ tints the [1] it lands on, visibly, then lets it go", async () => {
  await open("One.[^a]\n\nMore text.\n\n[^a]: Ay.\n");
  const ref = refs(h.page).first();
  await expect(ref).toHaveAttribute("data-n", "1");
  // Judged on the pixels: the [1] is drawn by CSS over hidden source text.
  const plain = await ref.screenshot();
  await defs(h.page).getByText("Ay.").click();
  await backArrow(h.page, "Ay.");
  await expect.poll(async () => (await ref.screenshot()).equals(plain)).toBe(false);
  await expect
    .poll(async () => (await ref.screenshot()).equals(plain), { timeout: 5000 })
    .toBe(true);
  expect(h.pageErrors).toEqual([]);
});

test("an unused footnote's label shows above its dash with the caret in the line, the row unmoved", async () => {
  await open(
    "Flour.[^a]\n\n[^a]: One.\n[^a-much-longer-unused-label]: Nobody points here, and this line wraps on a narrow window.\n",
  );
  const unused = defs(h.page).nth(1);
  const label = (el: Element) => getComputedStyle(el, "::before").content;
  const text = unused.locator('[role="textbox"]');
  const before = await text.boundingBox();
  expect(await unused.evaluate(label)).toBe("none");
  await row(h.page, "Flour.").getByText("Flour.").click();
  await h.page.keyboard.press("ArrowDown");
  await h.page.keyboard.press("ArrowDown");
  await expect.poll(() => unused.evaluate(label)).toBe('"a-much-longer-unused-label"');
  expect(await text.boundingBox()).toEqual(before);
  expect(h.pageErrors).toEqual([]);
});

test("Edit reference changes the label a reference names, and says what it reaches", async () => {
  await open("Claim.[^a] More.[^b]\n\n[^a]: Ay.\n[^b]: Bee.\n");
  await refs(h.page).nth(1).click({ button: "right" });
  await h.page.getByRole("menuitem", { name: "Edit reference…" }).click();
  const field = h.page.getByRole("textbox", { name: "Footnote label" });
  await expect(field).toBeFocused();
  // The heading ties the [2] the note shows to the label the file holds.
  const heading = h.page.getByTestId("footnote-ref-heading");
  await expect(heading).toHaveText("Footnote 2 · label");
  await expect(h.page.getByTestId("footnote-ref-reaches")).toHaveText("→ Bee.");
  await field.fill("a");
  await expect(heading).toHaveText("Footnote 1 · label");
  await expect(h.page.getByTestId("footnote-ref-reaches")).toHaveText("→ Ay.");
  await field.fill("zz");
  await expect(heading).toHaveText("Footnote · label");
  await expect(h.page.getByTestId("footnote-ref-reaches")).toHaveText("No footnote by this label");
  await field.fill("a");
  await h.page.keyboard.press("Enter");
  await waitForFile(h.vault.file("F.md"), (t) => t.startsWith("Claim.[^a] More.[^a]\n"));
  // [^b] now has no reference: a dash.
  await expect(refs(h.page).nth(1)).toHaveAttribute("data-n", "1");
  expect(h.pageErrors).toEqual([]);
});

test("Edit reference never leaves a half-typed label: Done waits for a valid one; Escape or a press away restore the original", async () => {
  const md = "Claim.[^b] More.\n\n[^b]: Bee.\n";
  await open(md);
  const field = h.page.getByRole("textbox", { name: "Footnote label" });
  const editRef = async () => {
    await refs(h.page).first().click({ button: "right" });
    await h.page.getByRole("menuitem", { name: "Edit reference…" }).click();
    await expect(field).toBeFocused();
  };
  // Typed a letter at a time: "bad" is valid on the way, "bad label" is not.
  await editRef();
  await h.page.keyboard.type("bad label");
  await expect(h.page.getByTestId("footnote-ref-reaches")).toHaveText("A label has no spaces");
  // Done is greyed (aria-disabled); a press on it, or Enter, closes nothing.
  const done = h.page.getByRole("button", { name: "Done" });
  await expect(done).toHaveAttribute("aria-disabled", "true");
  await done.click({ force: true });
  await h.page.keyboard.press("Enter");
  await expect(field).toBeVisible();
  await h.page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);
  await waitForFile(h.vault.file("F.md"), (t) => t === md, { label: "the original label back" });
  await sleep(SETTLE_MS);
  // The same by a press elsewhere in the note.
  await editRef();
  await h.page.keyboard.type("bad label");
  await row(h.page, "Bee.").getByText("Bee.").click();
  await expect(field).toHaveCount(0);
  await sleep(SETTLE_MS);
  expect(file()).toBe(md);
  expect(h.pageErrors).toEqual([]);
});

test("Back to reference: ↩ by name in a footnote's menu, opened from the keyboard with Shift+F10", async () => {
  await open("One.[^a] Two.\n\n[^a]: Ay.\n");
  await defs(h.page).getByText("Ay.").click();
  await h.page.keyboard.press("Shift+F10");
  const back = h.page.getByRole("menuitem", { name: "Back to reference" });
  await expect(back).toBeVisible();
  await h.page.keyboard.press("ArrowDown");
  await h.page.keyboard.press("Enter");
  await h.page.keyboard.type("~");
  await waitForFile(h.vault.file("F.md"), (t) => t.startsWith("One.[^a]~ Two.\n"));
  expect(h.pageErrors).toEqual([]);
});
