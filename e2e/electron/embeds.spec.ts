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

test("typing, Enter, paste and Backspace inside an embed change nothing", async () => {
  const h = await launchApp(FILES);
  try {
    await h.openNote("Host");
    const quotes = embeds(h.page).first();
    const before = await quotes.innerText();
    // Near the line's start: its middle holds a link, which would follow.
    await quotes.getByText("Start a line with").click({ position: { x: 8, y: 8 } });
    expect(
      await h.page.evaluate(
        () => !!getSelection()?.anchorNode?.parentElement?.closest("[data-embed]"),
      ),
    ).toBe(true);
    await h.page.keyboard.type("xyz");
    for (const k of ["x", "y", "z"]) await h.page.keyboard.press(k);
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.press("Backspace");
    await h.page.keyboard.press("Delete");
    await h.page.keyboard.press(`${MOD}+v`);
    await h.page.keyboard.press(`${MOD}+x`);
    expect(await quotes.innerText()).toBe(before);
    await unchanged(h, FILES);
    expect(h.pageErrors).toEqual([]);
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

test("the keyboard walks past an embed, and Backspace below it never edits the copy", async () => {
  const h = await launchApp(FILES);
  try {
    await h.openNote("Host");
    const at = () =>
      h.page.evaluate(() => {
        const n = window.getSelection()?.anchorNode ?? null;
        const el = n && (n.nodeType === 1 ? (n as Element) : n.parentElement);
        if (el?.closest("[data-embed]")) return "embed";
        return (
          (el?.closest("[data-editor] > [data-block-id]") as HTMLElement | null)?.innerText ?? null
        );
      });
    await h.page.locator("[data-editor] > [data-block-id]", { hasText: /^Intro\.$/ }).click();
    await h.page.keyboard.press("ArrowDown");
    // Down from Intro passes both embeds to the paragraph after them.
    expect(await at()).toBe("This paragraph has an ID. ^first-block");
    await h.page.keyboard.press("ArrowUp");
    expect(await at()).toBe("Intro.");
    await sleep(SETTLE_MS);
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
