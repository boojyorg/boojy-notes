/**
 * An outside edit to the open note keeps the user's place: the caret stays
 * where it was and the next keystroke lands there, in the outside version.
 * Every read of a file used to mint fresh block ids, so an edit to one line
 * remounted every block and the next keystroke opened a paragraph at the
 * note's end. A burst of outside writes while typing keeps both sides. Needs
 * the real app: the watcher, the debounces and the repaint are the subject.
 */
import fs from "node:fs";
import { type Page, expect, test } from "@playwright/test";
import {
  type AppHandle,
  END_OF_LINE,
  SETTLE_MS,
  launchApp,
  mdFiles,
  noteText,
  sleep,
  waitForFile,
} from "./harness";

const TODAY = new Date().toISOString().slice(0, 10);
const title = (page: Page) => page.getByRole("textbox", { name: "Note title" });

/** The caret at the end of the open note's `index`th block, with everything saved. */
async function caretAtEnd(h: AppHandle, index: number) {
  await h.page.locator("[data-block-id]").nth(index).click();
  await h.page.keyboard.press(END_OF_LINE);
  await sleep(SETTLE_MS);
}

/** An outside write to `file`, and the open note showing it. */
async function outsideWrite(h: AppHandle, file: string, text: string, shows: string) {
  h.vault.write(file, text);
  await expect.poll(() => noteText(h.page), { timeout: 5_000 }).toContain(shows);
}

test("typing after an outside edit to another paragraph lands at the caret, and both changes are kept", async () => {
  const h = await launchApp({ "Essay.md": "First.\n\nSecond.\n\nThird.\n" });
  try {
    await h.openNote("Essay");
    await caretAtEnd(h, 2);
    await outsideWrite(h, "Essay.md", "First, from outside.\n\nSecond.\n\nThird.\n", "outside");
    await h.page.keyboard.type(" mine");
    await waitForFile(h.vault.file("Essay.md"), (t) => t.includes("mine"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Essay.md")).toBe("First, from outside.\n\nSecond.\n\nThird. mine\n");
    expect(mdFiles(h.vault)).toEqual(["Essay.md"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("typing after an outside edit to the paragraph being edited lands in it, and both changes are kept", async () => {
  const h = await launchApp({ "Essay.md": "First.\n\nSecond line.\n\nThird.\n" });
  try {
    await h.openNote("Essay");
    await caretAtEnd(h, 1);
    await outsideWrite(h, "Essay.md", "First.\n\nSecond line, edited.\n\nThird.\n", "edited");
    // The caret was at the end; the paragraph is longer now, so it stays at
    // the offset it had, inside the outside edit's words.
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" Mine.");
    await waitForFile(h.vault.file("Essay.md"), (t) => t.includes("Mine"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Essay.md")).toBe("First.\n\nSecond line, edited. Mine.\n\nThird.\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the caret stays at its offset in a paragraph edited outside", async () => {
  const h = await launchApp({ "Essay.md": "First.\n\nAlpha beta\n" });
  try {
    await h.openNote("Essay");
    await caretAtEnd(h, 1);
    await outsideWrite(h, "Essay.md", "First.\n\nAlpha beta gamma\n", "gamma");
    await h.page.keyboard.type("!");
    await waitForFile(h.vault.file("Essay.md"), (t) => t.includes("!"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Essay.md")).toBe("First.\n\nAlpha beta! gamma\n");
  } finally {
    await h.close();
  }
});

test("when the caret's paragraph is removed outside, typing lands in the paragraph now in its place", async () => {
  const h = await launchApp({ "Essay.md": "One.\n\nTwo.\n\nThree.\n" });
  try {
    await h.openNote("Essay");
    await caretAtEnd(h, 1);
    h.vault.write("Essay.md", "One.\n\nThree.\n");
    await expect.poll(() => noteText(h.page), { timeout: 5_000 }).not.toContain("Two");
    await h.page.keyboard.type("X");
    await waitForFile(h.vault.file("Essay.md"), (t) => t.includes("X"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Essay.md")).toBe("One.\n\nXThree.\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("identical paragraphs: an outside copy of one loses no keystroke and changes nothing else", async () => {
  const h = await launchApp({ "List.md": "Same.\n\nSame.\n\nSame.\n" });
  try {
    await h.openNote("List");
    await caretAtEnd(h, 1);
    h.vault.write("List.md", "Same.\n\nSame.\n\nSame.\n\nSame.\n");
    await expect
      .poll(() => noteText(h.page), { timeout: 5_000 })
      .toBe("Same.\nSame.\nSame.\nSame.");
    await h.page.keyboard.type(" X");
    await waitForFile(h.vault.file("List.md"), (t) => t.includes("X"));
    await sleep(SETTLE_MS);
    const lines = h.vault.read("List.md").split("\n\n");
    // Which identical line keeps the caret is a guess; that the keystrokes
    // land in one of them, whole, and nowhere else, is not.
    expect(lines.filter((l) => l.startsWith("Same. X"))).toHaveLength(1);
    expect(lines.filter((l) => l.trim() === "Same.")).toHaveLength(3);
    expect(lines).toHaveLength(4);
  } finally {
    await h.close();
  }
});

test("an outside edit below the view leaves the view where it was", async () => {
  const body = Array.from({ length: 80 }, (_, i) => `Paragraph ${i + 1}.`).join("\n\n");
  const h = await launchApp({ "Long.md": `${body}\n` });
  try {
    await h.openNote("Long");
    const scroller = h.page.locator(".editor-scroll");
    await scroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight / 3;
    });
    await sleep(200);
    const before = await scroller.evaluate((el) => el.scrollTop);
    await outsideWrite(h, "Long.md", `${body}\n\nAdded at the end.\n`, "Added at the end.");
    await sleep(300);
    expect(Math.abs((await scroller.evaluate((el) => el.scrollTop)) - before)).toBeLessThan(2);
  } finally {
    await h.close();
  }
});

test("a burst of outside writes while idle shows the last, keeps the caret and makes no copy", async () => {
  const h = await launchApp({ "Essay.md": "Top.\n\nMine.\n" });
  try {
    await h.openNote("Essay");
    await caretAtEnd(h, 1);
    for (let k = 1; k <= 5; k++) {
      h.vault.write("Essay.md", `Top ${k}.\n\nMine.\n`);
      await sleep(150);
    }
    await expect.poll(() => noteText(h.page), { timeout: 5_000 }).toContain("Top 5.");
    await h.page.keyboard.type(" typed");
    await waitForFile(h.vault.file("Essay.md"), (t) => t.includes("typed"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Essay.md")).toBe("Top 5.\n\nMine. typed\n");
    expect(mdFiles(h.vault)).toEqual(["Essay.md"]);
  } finally {
    await h.close();
  }
});

test("typing through a burst of outside writes keeps every keystroke and the last outside version", async () => {
  const h = await launchApp({ "Essay.md": "Line one.\n\nLine two.\n" });
  try {
    await h.openNote("Essay");
    await caretAtEnd(h, 1);
    const typed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN";
    const typing = (async () => {
      for (const ch of typed) {
        await h.page.keyboard.type(ch);
        await sleep(100);
      }
    })();
    for (let k = 1; k <= 5; k++) {
      await sleep(700);
      h.vault.write("Essay.md", `Line one.\n\nLine two.\n\nOutside ${k}.\n`);
    }
    await typing;
    await sleep(SETTLE_MS * 3);

    expect(h.vault.read("Essay.md"), "the outside version keeps the name").toBe(
      "Line one.\n\nLine two.\n\nOutside 5.\n",
    );
    // However many copies the collisions made, every keystroke is in exactly
    // one file, in order, and no copy holds an outside line.
    const copies = mdFiles(h.vault).filter((f) => f.includes("conflicted copy"));
    expect(copies.length).toBeGreaterThan(0);
    const mine = copies.map((f) => h.vault.read(f));
    for (const text of mine) expect(text).not.toContain("Outside");
    const typedIn = mine.map((t) => t.match(/Line two\.([A-Za-z]*)/)?.[1] ?? "").join("");
    expect([...typedIn].sort().join("")).toBe([...typed].sort().join(""));
    await expect(title(h.page)).toContainText("conflicted copy");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("an outside write while the app's save is in flight, typing on, keeps both", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" mine");
    // Inside the save's window (see external-edit.spec.ts), then typing on
    // through the moment the conflict is found.
    await sleep(600);
    h.vault.write("Alpha.md", "Alpha body.\nTheirs, from outside.\n");
    await h.page.keyboard.type(" more", { delay: 120 });
    const copyName = `Alpha (conflicted copy ${TODAY})`;
    await expect(title(h.page)).toHaveText(copyName, { timeout: 5_000 });
    await waitForFile(h.vault.file(`${copyName}.md`), (t) => t.includes("more"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha body.\nTheirs, from outside.\n");
    expect(h.vault.read(`${copyName}.md`)).toBe("Alpha body. mine more\n");
  } finally {
    await h.close();
  }
});

test("the conflict notice names the file being edited and where the outside version is", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" mine", { delay: 60 });
    h.vault.write("Alpha.md", "Alpha body.\nTheirs.\n");
    const copyName = `Alpha (conflicted copy ${TODAY})`;
    await expect(title(h.page)).toHaveText(copyName, { timeout: 5_000 });
    await expect(h.page.locator("[data-toast-kind]")).toHaveText(
      `"Alpha" changed outside Boojy Notes. You're editing your version in "${copyName}"; the outside version is in "Alpha".`,
    );
  } finally {
    await h.close();
  }
});

test("another note deleted outside leaves the caret where it was", async () => {
  const h = await launchApp({ "Essay.md": "First.\n\nSecond.\n", "Other.md": "Other.\n" });
  try {
    await h.openNote("Essay");
    await caretAtEnd(h, 1);
    fs.unlinkSync(h.vault.file("Other.md"));
    await expect(h.page.locator('[role="treeitem"]').filter({ hasText: "Other" })).toHaveCount(0, {
      timeout: 5_000,
    });
    await h.page.keyboard.type(" typed");
    await waitForFile(h.vault.file("Essay.md"), (t) => t.includes("typed"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Essay.md")).toBe("First.\n\nSecond. typed\n");
  } finally {
    await h.close();
  }
});

/** The texts Version History shows for the open note, newest first. */
async function versionTexts(h: AppHandle): Promise<string[]> {
  await h.page.locator("button[aria-label='Note actions']").click();
  await h.page.getByRole("menuitem", { name: /Version History/ }).click();
  const list = h.page.getByRole("listbox", { name: "Versions" });
  await expect(list).toBeFocused();
  const count = (await list.getByRole("option").count()) - 1; // less "Now"
  const texts: string[] = [];
  for (let i = 0; i < count; i++) {
    await h.page.keyboard.press("ArrowDown");
    texts.push(await h.page.locator("[data-past-version]").innerText());
  }
  await h.page.keyboard.press("Escape");
  return texts.map((t) => t.trim());
}

test("Version History keeps the text an outside edit replaced", async () => {
  const h = await launchApp({ "Essay.md": "Before.\n" });
  try {
    await h.openNote("Essay");
    await caretAtEnd(h, 0);
    await h.page.keyboard.type(" mine");
    await waitForFile(h.vault.file("Essay.md"), (t) => t.includes("mine"));
    await sleep(SETTLE_MS);
    await outsideWrite(h, "Essay.md", "Replaced outside.\n", "Replaced outside.");
    expect(await versionTexts(h)).toContain("Before. mine");
  } finally {
    await h.close();
  }
});

test("after a conflict, Version History keeps the original's earlier text, and the copy holds the user's", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n" });
  try {
    await h.openNote("Alpha");
    await caretAtEnd(h, 0);
    await h.page.keyboard.type(" saved");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("saved"));
    await sleep(SETTLE_MS);
    await h.page.keyboard.type(" mine", { delay: 60 });
    h.vault.write("Alpha.md", "Theirs.\n");
    const copyName = `Alpha (conflicted copy ${TODAY})`;
    await expect(title(h.page)).toHaveText(copyName, { timeout: 5_000 });
    await sleep(SETTLE_MS);
    expect(h.vault.read(`${copyName}.md`)).toBe("Alpha body. saved mine\n");

    await h.page
      .locator('[role="treeitem"]')
      .filter({ hasText: "Alpha" })
      .filter({ hasNotText: "conflicted" })
      .click();
    await expect(title(h.page)).toHaveText("Alpha");
    expect(await noteText(h.page)).toBe("Theirs.");
    expect(await versionTexts(h)).toContain("Alpha body. saved");
  } finally {
    await h.close();
  }
});

test("an outside edit to a code block, a table and a callout shows in their fields", async () => {
  const before =
    "Intro.\n\n```js\nlet a = 1;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n> [!note] Title\n> Body one.\n";
  const after =
    "Intro.\n\n```js\nlet a = 2;\n```\n\n| A | B |\n| - | - |\n| 1 | 3 |\n\n> [!note] Title\n> Body two.\n";
  const h = await launchApp({ "Mixed.md": before });
  try {
    await h.openNote("Mixed");
    await caretAtEnd(h, 0);
    const ids = () =>
      h.page.locator("[data-block-id]").evaluateAll((els) => els.map((e) => e.dataset.blockId));
    const idsBefore = await ids();
    h.vault.write("Mixed.md", after);
    await expect(h.page.locator(".code-line").first()).toHaveText("let a = 2;", { timeout: 5_000 });
    await expect(h.page.getByRole("cell", { name: "3", exact: true })).toBeVisible();
    await expect(h.page.getByText("Body two.")).toBeVisible();
    // The blocks kept their ids: repainted in place, not remounted.
    expect(await ids()).toEqual(idsBefore);
    await h.page.keyboard.type(" typed");
    await waitForFile(h.vault.file("Mixed.md"), (t) => t.includes("typed"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Mixed.md")).toBe(after.replace("Intro.", "Intro. typed"));
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
