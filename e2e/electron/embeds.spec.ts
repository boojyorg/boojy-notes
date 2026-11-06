/**
 * An embed draws what its target names with the editor's own renderer,
 * read-only (EmbedBlock): real headings, code, quotes; the whole section.
 * It is fenced inside the editor's editable surface: typing, paste and
 * Backspace into it change nothing. Its text copies. A link inside reads as
 * in its own note. Its source's name, on hover, opens it. A long note shows
 * whole; a note that embeds itself is said once, never drawn forever.
 */
import { expect, test, type Page } from "@playwright/test";
import { SETTLE_MS, editorTitle, launchApp, sleep, type AppHandle } from "./harness";

const MOD = process.platform === "darwin" ? "Meta" : "Control";

const GUIDE = [
  "# Guide",
  "## Quotes",
  "Start a line with `>` to quote someone, see [[#Next]].",
  "```\n> Simplicity is the ultimate sophistication.\n```",
  "> Simplicity is the ultimate sophistication.",
  "## Next",
  "After quotes.",
  "",
].join("\n\n");

const HOST = [
  "Intro.",
  "![[Guide#Quotes]]",
  "![[#^first-block]]",
  "This paragraph has an ID. ^first-block",
  "After.",
  "",
].join("\n\n");

const FILES = { "Guide.md": GUIDE, "Host.md": HOST };

const embeds = (page: Page) => page.locator("[data-editor] > [data-block-id] [data-embed]");

async function unchanged(h: AppHandle, files: Record<string, string>) {
  await sleep(SETTLE_MS);
  for (const [name, text] of Object.entries(files)) expect(h.vault.read(name)).toBe(text);
}

test("a heading embed draws its section as the note does, and a block embed its paragraph", async () => {
  const h = await launchApp(FILES);
  try {
    await h.openNote("Host");
    const quotes = embeds(h.page).first();
    await expect(quotes.locator('[data-block-type="h2"]')).toHaveText("Quotes");
    await expect(quotes.locator('[data-block-type="code"]')).toHaveCount(1);
    await expect(quotes.locator('[data-block-type="blockquote"]')).toHaveCount(1);
    // The whole section, and nothing past it.
    await expect(quotes).not.toContainText("After quotes.");
    const block = embeds(h.page).nth(1);
    await expect(block).toContainText("This paragraph has an ID.");
    await expect(h.page.locator("[data-embed-missing]")).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

/** The chip the app shows (aria-hidden, so never found by role). */
const chip = (page: Page, text: string) => page.locator("[role=tooltip]").filter({ hasText: text });

test("keys in an embed's text change nothing, and its arrow says where to edit", async () => {
  const h = await launchApp(FILES);
  try {
    await h.openNote("Host");
    const quotes = embeds(h.page).first();
    // The embedded blocks' own text (the picked embed's link label aside).
    const content = () => quotes.locator("[data-block-type]").allInnerTexts();
    const before = await content();
    // A word selected inside: a text selection, never the whole embed.
    await quotes.getByText("Start a line with").dblclick({ position: { x: 8, y: 8 } });
    expect(
      await h.page.evaluate(() => {
        const s = getSelection();
        return !s?.isCollapsed && !!s?.anchorNode?.parentElement?.closest("[data-embed]");
      }),
    ).toBe(true);
    for (const k of ["x", "Enter", "Backspace", "Delete", `${MOD}+v`, `${MOD}+x`])
      await h.page.keyboard.press(k);
    await expect(chip(h.page, "Edit in Guide")).toBeVisible();
    expect(await content()).toEqual(before);
    await unchanged(h, FILES);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a click picks the embed whole: its link shows underneath, a letter is answered, Enter opens it", async () => {
  const h = await launchApp(FILES);
  try {
    await h.openNote("Host");
    const root = h.page.locator('[data-editor] > [data-block-type="embed"]').first();
    await root.locator('[data-block-type="blockquote"]').click();
    await expect(root).toHaveAttribute("data-selected", "true");
    // Its link, in the panel underneath.
    await expect(root.locator(".embed-link-field")).toHaveValue("Guide#Quotes");
    await h.page.keyboard.press("a");
    await expect(chip(h.page, "Edit in Guide")).toBeVisible();
    await unchanged(h, FILES);
    await h.page.keyboard.press("Enter");
    await expect.poll(() => editorTitle(h.page)).toBe("Guide");
  } finally {
    await h.close();
  }
});

test("the link underneath redraws the embed as typed, says a bad one, and saves in one step", async () => {
  const UNDO = process.platform === "darwin" ? "Meta+z" : "Control+z";
  const END = process.platform === "darwin" ? "Meta+ArrowRight" : "End";
  const h = await launchApp(FILES);
  try {
    await h.openNote("Host");
    const root = h.page.locator('[data-editor] > [data-block-type="embed"]').first();
    await root.locator('[data-block-type="blockquote"]').click();
    const panel = root.locator(".embed-edit");
    const field = panel.locator(".embed-link-field");
    // A press on the panel's empty space, past the closing `]]`, puts the
    // caret in the link, at its end.
    const close = (await panel.locator(".embed-link-mark").last().boundingBox())!;
    await h.page.mouse.click(close.x + close.width + 24, close.y + close.height / 2);
    await expect(field).toBeFocused();
    // Real keys, as typed: "Quotes" becomes "Next".
    await h.page.keyboard.press(END);
    for (let i = 0; i < "Quotes".length; i++) await h.page.keyboard.press("Backspace");
    await h.page.keyboard.type("Next");
    await expect(field).toHaveValue("Guide#Next");
    // Drawn as typed; nothing saved yet.
    await expect(embeds(h.page).first()).toContainText("After quotes.");
    await sleep(SETTLE_MS);
    expect(h.vault.read("Host.md")).toBe(HOST);
    // A name that is no heading: the last good drawing stays, the reason said.
    await h.page.keyboard.type("x");
    await expect(panel.locator(".embed-link-reason")).toHaveText("No heading “Nextx” in Guide.");
    await expect(embeds(h.page).first()).toContainText("After quotes.");
    await h.page.keyboard.press("Backspace");
    await h.page.keyboard.press("Enter");
    await sleep(SETTLE_MS);
    expect(h.vault.read("Host.md")).toBe(HOST.replace("![[Guide#Quotes]]", "![[Guide#Next]]"));
    await h.page.locator("[data-editor] > [data-block-id]", { hasText: /^After\.$/ }).click();
    await h.page.keyboard.press(UNDO);
    await sleep(SETTLE_MS);
    expect(h.vault.read("Host.md")).toBe(HOST);
  } finally {
    await h.close();
  }
});

// The link field is inside a picked block, whose caret the editor hides: the
// field draws its own. Done, as on a formula's source, saves as Enter does
// and closes the panel.
test("the link shows its caret, and Done saves it and closes the panel", async () => {
  const h = await launchApp(FILES);
  try {
    await h.openNote("Host");
    const root = h.page.locator('[data-editor] > [data-block-type="embed"]').first();
    await root.locator('[data-block-type="blockquote"]').click();
    const panel = root.locator(".embed-edit");
    const field = panel.locator(".embed-link-field");
    const done = panel.getByRole("button", { name: "Done", exact: true });
    // Nothing to finish until the link is being edited.
    await expect(done).toHaveCount(0);
    await field.click();
    await expect(field).toBeFocused();
    const caret = await field.evaluate((el) => getComputedStyle(el).caretColor);
    expect(caret).not.toBe("rgba(0, 0, 0, 0)");
    expect(caret).not.toBe("transparent");
    await h.page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowRight" : "End");
    for (let i = 0; i < "Quotes".length; i++) await h.page.keyboard.press("Backspace");
    await h.page.keyboard.type("Next");
    await done.click();
    // As a formula's source: the panel goes, the embed stays picked.
    await expect(panel).toHaveCount(0);
    await expect(root).toHaveAttribute("data-selected", "true");
    await sleep(SETTLE_MS);
    expect(h.vault.read("Host.md")).toBe(HOST.replace("![[Guide#Quotes]]", "![[Guide#Next]]"));
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

// The link is the one embed's: picked with other blocks, an embed wears the
// band and nothing else. And the field is as wide as its link, so the
// closing `]]` follows the text with no gap.
test("the link shows only for an embed picked alone, and fits its text", async () => {
  const h = await launchApp(FILES);
  try {
    await h.openNote("Host");
    const roots = h.page.locator('[data-editor] > [data-block-type="embed"]');
    await roots.nth(0).locator('[data-block-type="blockquote"]').click();
    const field = roots.nth(0).locator(".embed-link-field");
    await expect(field).toHaveValue("Guide#Quotes");
    const gap = await field.evaluate((el) => {
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.font = getComputedStyle(el).font;
      return (
        el.getBoundingClientRect().width - ctx.measureText((el as HTMLInputElement).value).width
      );
    });
    expect(Math.abs(gap)).toBeLessThan(1);
    // The open panel floats over the short embed below: extend the pick from
    // the paragraph after both.
    await h.page
      .locator("[data-editor] > [data-block-id]", { hasText: /^This paragraph has an ID/ })
      .last() // the embed above draws it too
      .click({ modifiers: ["Shift"] });
    await expect(roots.nth(0)).toHaveAttribute("data-selected", "true");
    await expect(roots.nth(1)).toHaveAttribute("data-selected", "true");
    await expect(h.page.locator(".embed-edit")).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

// The panel is open or shut, apart from the pick, as a formula's source is:
// a click opens it; Enter and Escape in it shut it, the embed still picked
// (Backspace still removes it); arrowing on only picks; the block menu's
// Edit link opens it with the caret in the link, the keyboard's way in.
test("the link panel opens on a click or Edit link, and Enter or Escape shuts it", async () => {
  const h = await launchApp(FILES);
  try {
    await h.openNote("Host");
    const root = h.page.locator('[data-editor] > [data-block-type="embed"]').first();
    const panel = root.locator(".embed-edit");
    const field = panel.locator(".embed-link-field");
    await root.locator('[data-block-type="blockquote"]').click();
    await expect(panel).toHaveCount(1);
    await field.click();
    await h.page.keyboard.press("Enter");
    await expect(panel).toHaveCount(0);
    await expect(root).toHaveAttribute("data-selected", "true");
    // A press on it again opens it again; Escape shuts it.
    await root.locator('[data-block-type="blockquote"]').click();
    await expect(panel).toHaveCount(1);
    await field.click();
    await h.page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(root).toHaveAttribute("data-selected", "true");
    await unchanged(h, FILES);

    // Arrowed on, picked only.
    await h.page.locator("[data-editor] > [data-block-id]", { hasText: /^Intro\.$/ }).click();
    await h.page.keyboard.press("ArrowDown");
    await expect(root).toHaveAttribute("data-selected", "true");
    await expect(panel).toHaveCount(0);
    // Edit link, from the block menu by keys: the caret in the link, at its end.
    await h.page.keyboard.press("Shift+F10");
    await h.page
      .getByRole("menu", { name: "Block options" })
      .getByRole("menuitem", { name: "Edit link" })
      .click();
    await expect(field).toBeFocused();
    expect(await field.evaluate((el) => (el as HTMLInputElement).selectionStart)).toBe(
      "Guide#Quotes".length,
    );
    await h.page.keyboard.press("Escape");
    // Shut, still picked: Backspace removes the embed.
    await h.page.keyboard.press("Backspace");
    await sleep(SETTLE_MS);
    expect(h.vault.read("Host.md")).toBe(HOST.replace("![[Guide#Quotes]]\n\n", ""));
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Escape in the link puts it back; nothing is saved", async () => {
  const h = await launchApp(FILES);
  try {
    await h.openNote("Host");
    const root = h.page.locator('[data-editor] > [data-block-type="embed"]').first();
    await root.locator('[data-block-type="blockquote"]').click();
    const field = root.locator(".embed-link-field");
    await field.click();
    await h.page.keyboard.type("zzz");
    await h.page.keyboard.press("Escape");
    await expect(embeds(h.page).first().locator('[data-block-type="h2"]')).toHaveText("Quotes");
    await unchanged(h, FILES);
  } finally {
    await h.close();
  }
});

test("text selected in an embed copies as its text", async () => {
  const h = await launchApp(FILES);
  const saved = await h.app.evaluate(({ clipboard }) => clipboard.readText());
  try {
    await h.openNote("Host");
    await embeds(h.page).first().locator('[data-block-type="blockquote"]').click({ clickCount: 3 });
    await h.page.keyboard.press(`${MOD}+c`);
    await expect
      .poll(() => h.app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain("Simplicity is the ultimate sophistication.");
    await unchanged(h, FILES);
  } finally {
    await h.app.evaluate(({ clipboard }, t) => clipboard.writeText(t), saved);
    await h.close();
  }
});

test("the arrows stop on an embed; Backspace below picks it first, then removes it", async () => {
  const UNDO = process.platform === "darwin" ? "Meta+z" : "Control+z";
  const h = await launchApp(FILES);
  try {
    await h.openNote("Host");
    const picked = () =>
      h.page
        .locator('[data-editor] > [data-selected="true"]')
        .evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.split("\n")[0]));
    await h.page.locator("[data-editor] > [data-block-id]", { hasText: /^Intro\.$/ }).click();
    await h.page.keyboard.press("ArrowDown");
    expect(await picked()).toEqual(["Quotes"]);
    // From a block picked whole the arrows go on to text, as from a picture:
    // the second embed, right after, is passed with it.
    await h.page.keyboard.press("ArrowDown");
    expect(await picked()).toEqual([]);

    // At the start of the paragraph under the second embed: Backspace picks it.
    await h.page
      .locator('[data-editor] > [data-block-type="p"]', { hasText: /^This paragraph has an ID/ })
      .click({ position: { x: 2, y: 8 } });
    await h.page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowLeft" : "Home");
    await h.page.keyboard.press("Backspace");
    expect(await picked()).toEqual(["This paragraph has an ID. ^first-block"]);
    await unchanged(h, FILES);
    await h.page.keyboard.press("Backspace");
    await sleep(SETTLE_MS);
    expect(h.vault.read("Host.md")).toBe(HOST.replace("![[#^first-block]]\n\n", ""));
    await h.page.keyboard.press(UNDO);
    await sleep(SETTLE_MS);
    expect(h.vault.read("Host.md")).toBe(HOST);
    expect(h.vault.read("Guide.md")).toBe(GUIDE);
  } finally {
    await h.close();
  }
});

test("a link inside an embed reads as in its own note, and its arrow opens the source", async () => {
  const h = await launchApp(FILES);
  try {
    await h.openNote("Host");
    const quotes = embeds(h.page).first();
    // `[[#Next]]` in the Guide's section names the Guide's Next, not one in Host.
    await quotes.locator(".wikilink", { hasText: /^Next$/ }).click();
    await expect.poll(() => editorTitle(h.page)).toBe("Guide");
    await h.openNote("Host");
    // The arrow in the corner: its chip says where it goes, its press goes there.
    const arrow = embeds(h.page).first().locator(".embed-open");
    await expect(arrow).toHaveAttribute("aria-label", "Open Guide > Quotes");
    await expect(embeds(h.page).nth(1).locator(".embed-open")).toHaveAttribute(
      "aria-label",
      "Go to ^first-block in this note",
    );
    // Re-hovered until the chip shows, as the tooltip specs do: the note
    // reopened a moment ago may still repaint the button under the pointer.
    await expect(async () => {
      await h.page.mouse.move(5, 5);
      await arrow.hover();
      await expect(
        h.page
          // The chip is aria-hidden (the button's own name says it), so not by role.
          .locator("[role=tooltip]")
          .filter({ hasText: "Open Guide > Quotes" }),
      ).toBeVisible({
        timeout: 1_500,
      });
    }).toPass({ timeout: 10_000 });
    await arrow.click();
    await expect.poll(() => editorTitle(h.page)).toBe("Guide");
    await unchanged(h, FILES);
  } finally {
    await h.close();
  }
});

test("a long note embeds whole; a note embedding itself is said, never drawn forever", async () => {
  const long = Array.from({ length: 300 }, (_, i) => `Line ${i + 1}.`).join("\n\n");
  const files = {
    "Long.md": `${long}\n`,
    "Host.md": "Intro.\n\n![[Long]]\n\n![[Host]]\n\n![[Loop A]]\n",
    "Loop A.md": "A.\n\n![[Loop B]]\n",
    "Loop B.md": "B.\n\n![[Loop A]]\n",
  };
  const h = await launchApp(files);
  try {
    const t0 = Date.now();
    await h.openNote("Host");
    const first = embeds(h.page).first();
    await expect(first).toContainText("Line 300.");
    const ms = Date.now() - t0;
    console.log(`long embed open: ${ms} ms`);
    // Host embedding Host shows Host's own blocks once, its inner self-embed said.
    await expect(
      h.page.locator("[data-embed-missing]", { hasText: "embeds itself" }).first(),
    ).toBeVisible();
    // A → B → A: drawn A, B, then said.
    await expect(h.page.locator("[data-embed]", { hasText: "B." }).first()).toBeVisible();
    expect(h.pageErrors).toEqual([]);
    await unchanged(h, files);
  } finally {
    await h.close();
  }
});

test("a code block inside an embed is read-only: typed keys and paste change nothing", async () => {
  const h = await launchApp(FILES);
  try {
    await h.openNote("Host");
    const quotes = embeds(h.page).first();
    const code = quotes.locator('[data-block-type="code"] textarea').first();
    await expect(code).toHaveJSProperty("readOnly", true);
    const before = await code.inputValue();
    await code.click();
    await h.page.keyboard.type("xyz");
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.press("Backspace");
    await h.page.keyboard.press(`${MOD}+v`);
    expect(await code.inputValue()).toBe(before);
    await unchanged(h, FILES);
  } finally {
    await h.close();
  }
});

test("a link with a | suffix is refused and said, never saved without it", async () => {
  const h = await launchApp(FILES);
  try {
    await h.openNote("Host");
    const root = h.page.locator('[data-editor] > [data-block-type="embed"]').first();
    await root.locator('[data-block-type="blockquote"]').click();
    const field = root.locator(".embed-link-field");
    await field.click();
    await h.page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowRight" : "End");
    await h.page.keyboard.type("|label");
    await expect(root.locator(".embed-link-reason")).toHaveText(
      "Text after | can't be kept here yet. Remove it to save.",
    );
    // Enter keeps it open, nothing written; so does Done.
    await h.page.keyboard.press("Enter");
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("Guide#Quotes|label");
    await root.getByRole("button", { name: "Done", exact: true }).click();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("Guide#Quotes|label");
    await h.page.keyboard.press("Escape");
    await unchanged(h, FILES);
  } finally {
    await h.close();
  }
});
