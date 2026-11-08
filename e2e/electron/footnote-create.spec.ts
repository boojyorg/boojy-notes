/**
 * Making a footnote where the caret is. A typed `[^` shows the next number's
 * `n]` faintly after the caret; Enter or Tab types it and opens the panel for
 * the footnote's text. A typed `[^name]` nothing defines opens the panel too,
 * as does Insert footnote. The panel's text is a draft until Done, or a leave
 * with text in it (a press elsewhere, another note, a quit, a save point);
 * Escape or an empty leave writes nothing. Proven on the file's bytes and on
 * each ⌘Z.
 */
import { expect, type Page, test } from "@playwright/test";
import {
  type AppHandle,
  END_OF_LINE,
  launchApp,
  MOD,
  menuClick,
  menuEnabled,
  START_OF_LINE,
  sleep,
  waitForFile,
} from "./harness";

let h: AppHandle;
test.afterEach(async () => {
  await h?.close();
});
async function open(md: string) {
  h = await launchApp({ "F.md": md });
  await h.openNote("F");
}
const row = (page: Page, text: string) =>
  page.locator("[data-editor] > [data-block-id]").filter({ hasText: text });
const ghost = () => h.page.locator("[data-editor] .fn-ghost");
const panel = () => h.page.getByTestId("footnote-draft");
const title = () => h.page.getByTestId("footnote-draft-title");
const field = () => h.page.getByRole("textbox", { name: "Footnote text" });
const atEnd = async (text: string) => {
  await row(h.page, text).getByText(text).click();
  await h.page.keyboard.press(END_OF_LINE);
};
const fileIs = (md: string) => waitForFile(h.vault.file("F.md"), (t) => t === md);
/** A press on the editor's empty space, clear of the panel. */
const pressAway = async () => {
  const box = (await h.page.locator(".editor-scroll").boundingBox()) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  await h.page.mouse.click(box.x + box.width / 2, box.y + box.height - 40);
};

test("[^ shows the next number faintly; Enter types it and the panel takes the text; each ⌘Z steps back once", async () => {
  await open("Bread needs strong flour.\n");
  await atEnd("Bread needs strong flour.");
  await h.page.keyboard.type("[^");
  await expect(ghost()).toHaveAttribute("data-ghost", "1]");
  // Read by nothing: the file holds only what was typed.
  await fileIs("Bread needs strong flour.[^\n");
  await h.page.keyboard.press("Enter");
  await expect(title()).toHaveText("New footnote [1]");
  await expect(field()).toBeFocused();
  await h.page.keyboard.type("About 13% protein.");
  await h.page.keyboard.press("Enter");
  await expect(panel()).toHaveCount(0);
  await fileIs("Bread needs strong flour.[^1]\n\n[^1]: About 13% protein.\n");
  // The caret is back after [1].
  await h.page.keyboard.type(" Next");
  await fileIs("Bread needs strong flour.[^1] Next\n\n[^1]: About 13% protein.\n");
  await sleep(700);
  await h.page.keyboard.press(`${MOD}+z`);
  await fileIs("Bread needs strong flour.[^1]\n\n[^1]: About 13% protein.\n");
  await h.page.keyboard.press(`${MOD}+z`);
  await fileIs("Bread needs strong flour.[^1]\n");
  await h.page.keyboard.press(`${MOD}+z`);
  await fileIs("Bread needs strong flour.[^\n");
  await h.page.keyboard.press(`${MOD}+z`);
  await fileIs("Bread needs strong flour.\n");
  expect(h.pageErrors).toEqual([]);
});

test("Tab takes the ghost too; mid-line the ghost pushes the text along", async () => {
  await open("Flour. More text.\n");
  await atEnd("Flour. More text.");
  for (let i = 0; i < " More text.".length; i++) await h.page.keyboard.press("ArrowLeft");
  await h.page.keyboard.type("[^");
  await expect(ghost()).toHaveCount(1);
  const ghostRight = await ghost().evaluate((g) => g.getBoundingClientRect().right);
  const moreLeft = await row(h.page, "Flour.").evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = (n as Text).data.indexOf("More");
      if (at < 0) continue;
      const r = document.createRange();
      r.setStart(n, at);
      r.setEnd(n, at + 1);
      return r.getBoundingClientRect().left;
    }
    return -1;
  });
  expect(moreLeft).toBeGreaterThanOrEqual(ghostRight - 1);
  await h.page.keyboard.press("Tab");
  await expect(field()).toBeFocused();
  await h.page.keyboard.type("Mid.");
  await h.page.keyboard.press("Enter");
  await fileIs("Flour.[^1] More text.\n\n[^1]: Mid.\n");
});

test("any other key drops the ghost and types; Escape drops it", async () => {
  await open("Flour.\n");
  await atEnd("Flour.");
  await h.page.keyboard.type("[^");
  await expect(ghost()).toHaveCount(1);
  await h.page.keyboard.type("x");
  await expect(ghost()).toHaveCount(0);
  await fileIs("Flour.[^x\n");
  await h.page.keyboard.press("Backspace");
  await h.page.keyboard.press("Backspace");
  await h.page.keyboard.type("^");
  await expect(ghost()).toHaveCount(1);
  await h.page.keyboard.press("Escape");
  await expect(ghost()).toHaveCount(0);
  await fileIs("Flour.[^\n");
});

test("a typed [^name] nothing defines opens the panel, its name beside the number; a defined one just links", async () => {
  await open("One.[^1]\n\nTwo.\n\n[^1]: Ay.\n");
  await atEnd("Two.");
  await h.page.keyboard.type("[^1] more");
  await fileIs("One.[^1]\n\nTwo.[^1] more\n\n[^1]: Ay.\n");
  await expect(panel()).toHaveCount(0);
  await h.page.keyboard.type("[^Hi]");
  await expect(title()).toHaveText("New footnote [2]Hi");
  await h.page.keyboard.type("Hello.");
  await h.page.keyboard.press("Enter");
  await fileIs("One.[^1]\n\nTwo.[^1] more[^Hi]\n\n[^1]: Ay.\n[^Hi]: Hello.\n");
  // One ⌘Z takes the footnote; the typed reference is typing's to undo.
  await h.page.keyboard.press(`${MOD}+z`);
  await fileIs("One.[^1]\n\nTwo.[^1] more[^Hi]\n\n[^1]: Ay.\n");
});

test("a click on a reference nothing defines opens the panel for it; Done writes only its footnote", async () => {
  const md = "One.[^1] Three.[^3]\n\nWow [^6]\n\nHi\n\n[^1]: Ay.\n[^3]: Cee.\n";
  await open(md);
  const six = h.page.locator("[data-editor] .md-fn-ref").filter({ hasText: "[^6]" });
  await six.click();
  // Its number once written beside its label, as for a typed [^name].
  await expect(title()).toHaveText("New footnote [3]6");
  await h.page.keyboard.type("Six.");
  await h.page.keyboard.press("Enter");
  await fileIs(`${md}[^6]: Six.\n`);
  await expect(six).toHaveAttribute("data-n", "3");
  // One ⌘Z takes the footnote; the reference was the file's.
  await h.page.keyboard.press(`${MOD}+z`);
  await fileIs(md);
  expect(h.pageErrors).toEqual([]);
});

test("a reference nothing defines: Escape writes nothing; its menu says Write footnote; its hover says so", async () => {
  const md = "Wow.[^6]\n\nHi.\n";
  await open(md);
  const six = h.page.locator("[data-editor] .md-fn-ref");
  await six.click();
  await expect(panel()).toBeVisible();
  await h.page.keyboard.type("Never written");
  await h.page.keyboard.press("Escape");
  await expect(panel()).toHaveCount(0);
  await sleep(600);
  expect(h.vault.read("F.md")).toBe(md);

  await six.click({ button: "right" });
  await expect(h.page.getByRole("menuitem", { name: "Go to footnote" })).toHaveCount(0);
  await h.page.getByRole("menuitem", { name: "Write footnote" }).click();
  await expect(title()).toHaveText("New footnote [1]6");
  await h.page.keyboard.press("Escape");

  await expect(async () => {
    await h.page.mouse.move(5, 5);
    await six.hover();
    await expect(h.page.getByTestId("link-tooltip")).toHaveText(
      "[^6]no footnote yet · click to write it",
      { timeout: 1_500 },
    );
  }).toPass({ timeout: 10_000 });
});

test("in a callout, where no footnote can be written, a reference nothing defines offers no Write footnote and says so", async () => {
  const md = "> [!note]\n> Inside.[^x]\n\nAfter.\n";
  await open(md);
  const ref = h.page.locator("[data-editor] .md-fn-ref");
  await ref.click({ button: "right" });
  await expect(h.page.getByRole("menuitem", { name: "Edit reference…" })).toBeVisible();
  await expect(h.page.getByRole("menuitem", { name: "Write footnote" })).toHaveCount(0);
  await h.page.keyboard.press("Escape");
  await expect(async () => {
    await h.page.mouse.move(5, 5);
    await ref.hover();
    await expect(h.page.getByTestId("link-tooltip")).toHaveText("[^x]no footnote by this label", {
      timeout: 1_500,
    });
  }).toPass({ timeout: 10_000 });
  await ref.click();
  await expect(panel()).toHaveCount(0);
  expect(h.vault.read("F.md")).toBe(md);
});

// A reference edited in a table cell was read back as the whole table, which
// writes nothing: the cell showed the edit, the file had it only after the
// cell's next keystroke. The cell commits its own text now, as for typing.
const CELL = "| a | b |\n| - | - |\n| c[^1] x | d |\n\n[^1]: Def.\n[^2]: Two.\n";

test("Edit reference in a table cell is written at once", async () => {
  await open(CELL);
  await h.page.locator("[data-editor] td .md-fn-ref").click({ button: "right" });
  await h.page.getByRole("menuitem", { name: "Edit reference…" }).click();
  await h.page.getByRole("textbox", { name: "Footnote label" }).fill("2");
  await h.page.keyboard.press("Enter");
  await fileIs(CELL.replace("c[^1]", "c[^2]"));
});

test("Backspace after a reference in a table cell is written at once", async () => {
  await open(CELL);
  await h.page.locator("[data-editor] td").filter({ hasText: "x" }).first().click();
  await h.page.evaluate(() => {
    const ref = document.querySelector("[data-editor] td .md-fn-ref");
    const after = ref?.nextSibling;
    if (!ref || !after) throw new Error("no reference");
    const r = document.createRange();
    if (after.nodeType === Node.TEXT_NODE) r.setStart(after, 0);
    else r.setStartAfter(after);
    r.collapse(true);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(r);
  });
  await h.page.keyboard.press("Backspace");
  await fileIs(CELL.replace("c[^1] x", "c[^1 x"));
});

test("Format › Insert Footnote greys in a table cell, where it cannot write one", async () => {
  await open("| a | b |\n| - | - |\n| c | d |\n\nAfter.\n");
  await h.page.getByText("After.").click();
  await expect.poll(() => menuEnabled(h, "footnote")).toBe(true);
  await h.page.locator("[data-editor] td").filter({ hasText: "c" }).click();
  await expect.poll(() => menuEnabled(h, "footnote")).toBe(false);
});

test("Escape in the panel writes nothing and leaves the reference as typed, the caret after it", async () => {
  await open("Bread.\n");
  await atEnd("Bread.");
  await h.page.keyboard.type("[^Hi]");
  await expect(panel()).toBeVisible();
  await h.page.keyboard.type("Never written");
  await h.page.keyboard.press("Escape");
  await expect(panel()).toHaveCount(0);
  await h.page.keyboard.type("!");
  await fileIs("Bread.[^Hi]!\n");
});

test("Insert footnote opens the panel and writes nothing until Done; one ⌘Z takes both", async () => {
  await open("Bread.\n");
  await atEnd("Bread.");
  await menuClick(h, "footnote");
  await expect(field()).toBeFocused();
  await sleep(600);
  expect(h.vault.read("F.md")).toBe("Bread.\n");
  await h.page.keyboard.type("Menu one.");
  await h.page.keyboard.press("Enter");
  await fileIs("Bread.[^1]\n\n[^1]: Menu one.\n");
  await h.page.keyboard.press(`${MOD}+z`);
  await fileIs("Bread.\n");
});

test("a press elsewhere writes a draft holding text; an empty one writes nothing", async () => {
  await open("Bread.\n\nOther line.\n");
  await atEnd("Bread.");
  await h.page.keyboard.type("[^");
  await h.page.keyboard.press("Enter");
  await h.page.keyboard.type("Kept.");
  await pressAway();
  await fileIs("Bread.[^1]\n\nOther line.\n\n[^1]: Kept.\n");
  await atEnd("Other line.");
  await menuClick(h, "footnote");
  await expect(panel()).toBeVisible();
  await pressAway();
  await expect(panel()).toHaveCount(0);
  await sleep(1200);
  expect(h.vault.read("F.md")).toBe("Bread.[^1]\n\nOther line.\n\n[^1]: Kept.\n");
});

test("a draft is written by a quit, a save point and another note; a window blur leaves it open", async () => {
  h = await launchApp({ "F.md": "Bread.\n", "G.md": "Other.\n" });
  await h.openNote("F");
  const draft = async (text: string) => {
    await atEnd("Bread.");
    await menuClick(h, "footnote");
    await expect(field()).toBeFocused();
    await h.page.keyboard.type(text);
  };
  // Blur: the note is flushed, the panel stays for the user to come back to.
  await draft("Saved.");
  await h.page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await sleep(600);
  await expect(panel()).toBeVisible();
  // A save point (its key reaches the shell from the field) writes it first.
  await h.page.keyboard.press(`${MOD}+s`);
  await fileIs("Bread.[^1]\n\n[^1]: Saved.\n");
  await expect(panel()).toHaveCount(0);
  // Another note: written into the note it was made in.
  await draft(" Switch.");
  await h.page.keyboard.press(`${MOD}+p`);
  await h.page.keyboard.type("G");
  await h.page.keyboard.press("Enter");
  await fileIs("Bread.[^1][^2]\n\n[^1]: Saved.\n[^2]: Switch.\n");
  expect(h.vault.read("G.md")).toBe("Other.\n");
  // A quit.
  await h.openNote("F");
  await draft("Quit.");
  await h.quit();
  await fileIs("Bread.[^1][^2][^3]\n\n[^1]: Saved.\n[^2]: Switch.\n[^3]: Quit.\n");
});

test("in a table cell a note says no footnote goes there, and takes no key", async () => {
  await open("| a | b |\n| --- | --- |\n| x | y |\n");
  await h.page.locator("[data-editor] td").first().click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.type("[^");
  await expect(h.page.getByTestId("footnote-unavailable")).toHaveText(
    "Footnotes can't go in a table",
  );
  await expect(ghost()).toHaveCount(0);
  await h.page.keyboard.press("Enter");
  await expect(panel()).toHaveCount(0);
});

test("the ghost shows in the note open at launch and in a new note", async () => {
  h = await launchApp({ "F.md": "Other.\n" });
  await h.restart();
  // The note the app opens with, active before its editor is drawn.
  await h.page.locator("[data-editor] > [data-block-id]").first().click();
  await h.page.keyboard.type("Launch[^");
  await expect(ghost()).toHaveAttribute("data-ghost", "1]");
  await h.page.keyboard.press("Escape");
  await h.page.getByRole("button", { name: "New note", exact: true }).click();
  // A new note gives its name the caret first; then into the body.
  await expect(h.page.getByRole("textbox", { name: "Note title" })).toBeFocused();
  await h.page.locator("[data-editor] > [data-block-id]").first().click();
  await h.page.keyboard.type("Fresh[^");
  await expect(ghost()).toHaveAttribute("data-ghost", "1]");
});

test("a draft whose line changed outside is never lost: a notice keeps its text to copy", async () => {
  await open("Bread.\n");
  await atEnd("Bread.");
  await menuClick(h, "footnote");
  await expect(field()).toBeFocused();
  await h.page.keyboard.type("Kept text.");
  // Another app rewrites the line the reference was to go in.
  h.vault.write("F.md", "Bread, rewritten.\n");
  await expect(row(h.page, "rewritten")).toBeVisible();
  await h.page.getByRole("button", { name: "Done" }).click();
  const notice = h.page.getByText("Footnote not added", { exact: false });
  await expect(notice).toBeVisible();
  await h.page.getByRole("button", { name: "Copy text" }).click();
  await expect
    .poll(() => h.app.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe("Kept text.");
  await sleep(600);
  expect(h.vault.read("F.md")).toBe("Bread, rewritten.\n");
});

test("a [^label] typed at a line's start is a footnote line on its way: no panel opens", async () => {
  await open("Claim.[^9]\n\nNext\n");
  await row(h.page, "Next").click();
  await h.page.keyboard.press(START_OF_LINE);
  await h.page.keyboard.type("[^9]");
  // However slow the next key, the caret stays in the line.
  await sleep(400);
  await expect(panel()).toHaveCount(0);
  await h.page.keyboard.type(": ");
  await fileIs("Claim.[^9]\n\n[^9]: Next\n");
});
