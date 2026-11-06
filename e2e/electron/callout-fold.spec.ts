/**
 * Folding a callout is how the note is viewed, never an edit (Obsidian's `-`
 * and `+`): `[!type]-` opens folded, `[!type]+` open, a callout with neither
 * never folds. The chevron is a named button saying its state; a folded body
 * is out of reach (inert) and the caret never stays in it; the arrows step
 * over it; Find opens it to show a match; the block menu folds it by keys.
 * The file's sign rules again whenever the open note changes.
 */
import { expect, test, type Page } from "@playwright/test";
import { type AppHandle, SETTLE_MS, isMac, launchApp, sleep } from "./harness";

const NOTE = "Fold.md";
const FILE = [
  "Intro.",
  "> [!warning]- Folded until you click\n> This text is hidden at first. Hidden twice: hidden.",
  "Below.",
  "> [!tip]+ Starts open\n> Open body.",
  "> [!note] No sign\n> Plain body.",
  "End.",
  "",
].join("\n\n");
const OTHER = "Other.md";

const BACK = isMac ? "Meta+BracketLeft" : "Alt+ArrowLeft";
const FIND = isMac ? "Meta+f" : "Control+f";

let h: AppHandle;

test.beforeEach(async () => {
  h = await launchApp({ [NOTE]: FILE, [OTHER]: "Elsewhere.\n" });
  await h.openNote("Fold");
});

test.afterEach(async () => {
  await h?.close();
});

const callout = (page: Page, n: number) => page.locator("[data-editor] .callout-block").nth(n);
const chevron = (page: Page, n: number) => callout(page, n).locator("button.callout-fold-btn");
const shown = (page: Page, n: number) =>
  callout(page, n)
    .locator(".callout-fold")
    .evaluate((el) => el.getBoundingClientRect().height > 1);
const para = (page: Page, text: RegExp) =>
  page.locator("[data-editor] > [data-block-id]", { hasText: text });

/** The text of the top-level block holding the caret. */
const caretBlock = (page: Page) =>
  page.evaluate(() => {
    const n = window.getSelection()?.anchorNode;
    const el = n?.nodeType === 1 ? (n as Element) : n?.parentElement;
    return el?.closest("[data-editor] > [data-block-id]")?.textContent ?? null;
  });

async function unchanged() {
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe(FILE);
}

test("a callout opens as its sign says; the chevron folds and unfolds it, writing nothing", async () => {
  await expect(chevron(h.page, 0)).toHaveAttribute("aria-expanded", "false");
  await expect(chevron(h.page, 0)).toHaveAccessibleName("Expand callout");
  await expect(callout(h.page, 0).locator(".callout-fold")).toHaveAttribute("inert", "");
  await expect.poll(() => shown(h.page, 0)).toBe(false);
  await expect(chevron(h.page, 1)).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => shown(h.page, 1)).toBe(true);
  await expect(chevron(h.page, 2)).toHaveCount(0);

  await chevron(h.page, 0).click();
  await expect(chevron(h.page, 0)).toHaveAttribute("aria-expanded", "true");
  await expect(chevron(h.page, 0)).toHaveAccessibleName("Collapse callout");
  await expect.poll(() => shown(h.page, 0)).toBe(true);
  await chevron(h.page, 1).click();
  await expect.poll(() => shown(h.page, 1)).toBe(false);
  await unchanged();
  expect(h.pageErrors).toEqual([]);
});

test("the file's sign rules again when the note is left and come back to, or gone back to", async () => {
  await chevron(h.page, 0).click();
  await expect(chevron(h.page, 0)).toHaveAttribute("aria-expanded", "true");
  await h.openNote("Other");
  await h.openNote("Fold");
  await expect(chevron(h.page, 0)).toHaveAttribute("aria-expanded", "false");

  await chevron(h.page, 0).click();
  await expect(chevron(h.page, 0)).toHaveAttribute("aria-expanded", "true");
  await h.openNote("Other");
  await para(h.page, /^Elsewhere\.$/).click();
  await h.page.keyboard.press(BACK);
  await expect(chevron(h.page, 0)).toHaveAttribute("aria-expanded", "false");
  await unchanged();
});

test("the arrows step over a folded body: up lands in its title, down goes on past it", async () => {
  await para(h.page, /^Below\.$/).click();
  await h.page.keyboard.press("ArrowUp");
  const title = callout(h.page, 0).locator(".callout-title");
  await expect(title).toBeFocused();
  await h.page.keyboard.press("ArrowDown");
  await expect.poll(() => caretBlock(h.page)).toBe("Below.");
  // Open, ↓ from the title goes into its body.
  await chevron(h.page, 1).click();
  await chevron(h.page, 1).click();
  await callout(h.page, 1).locator(".callout-title").click();
  await h.page.keyboard.press("ArrowDown");
  await expect(callout(h.page, 1).locator(".callout-body")).toBeFocused();
});

test("folding with the caret in the body takes the caret to the title; a key typed at once lands there", async () => {
  const body = callout(h.page, 1).locator(".callout-body");
  await body.click();
  await expect(body).toBeFocused();
  await chevron(h.page, 1).click();
  const title = callout(h.page, 1).locator(".callout-title");
  await expect(title).toBeFocused();
  await h.page.keyboard.type("!");
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe(FILE.replace("Starts open", "Starts open!"));
  await expect(body).toHaveText("Open body.");
});

test("Find opens a folded callout to show a match, and steps between matches inside it", async () => {
  await para(h.page, /^Intro\.$/).click();
  await h.page.keyboard.press(FIND);
  await h.page.getByPlaceholder("Find in note...").fill("hidden");
  await expect(h.page.getByText("1 of 3")).toBeVisible();
  await expect(chevron(h.page, 0)).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => shown(h.page, 0)).toBe(true);
  // The active match is on screen once the callout has opened.
  const onScreen = () =>
    h.page.evaluate(() => {
      const r = CSS.highlights.get("find-active")?.values().next().value as Range | undefined;
      if (!r) return false;
      const b = r.getBoundingClientRect();
      return b.height > 0 && b.top >= 0 && b.bottom <= window.innerHeight;
    });
  await expect.poll(onScreen).toBe(true);
  await h.page.getByPlaceholder("Find in note...").press("Enter");
  await expect(h.page.getByText("2 of 3")).toBeVisible();
  await expect(chevron(h.page, 0)).toHaveAttribute("aria-expanded", "true");
  await expect.poll(onScreen).toBe(true);
  await unchanged();
});

test("the block menu folds and unfolds a callout by keys", async () => {
  // The grip's menu on the folded callout.
  const box = (await callout(h.page, 0).boundingBox())!;
  await h.page.mouse.move(box.x + 40, box.y + 12);
  const id = await h.page
    .locator("[data-editor] > [data-block-id]")
    .filter({ has: h.page.locator(".callout-block") })
    .first()
    .getAttribute("data-block-id");
  const grip = h.page.locator(`[data-testid="block-drag-handle"][data-target-block="${id}"]`);
  await grip.click();
  const menu = h.page.getByRole("menu", { name: "Block options" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Unfold" }).click();
  await expect(chevron(h.page, 0)).toHaveAttribute("aria-expanded", "true");
  // Picked whole, Shift+F10: the same menu, now offering Fold.
  await h.page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Fold" }).click();
  await expect(chevron(h.page, 0)).toHaveAttribute("aria-expanded", "false");
  await unchanged();
});

// A step to a match in a folded callout scrolls once the callout has opened;
// a newer step before then wins, and the old one never scrolls back.
test("stepping on before a folded callout has opened keeps the newer match in view", async () => {
  const filler = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}.`).join("\n\n");
  const far = `Intro.\n\n> [!warning]- Far\n> zebra inside.\n\n${filler}\n\nzebra end.\n`;
  const g = await launchApp({ "Far.md": far });
  try {
    await g.openNote("Far");
    await g.page.locator("[data-editor] > [data-block-id]", { hasText: /^Intro\.$/ }).click();
    await g.page.keyboard.press(FIND);
    const input = g.page.getByPlaceholder("Find in note...");
    await input.fill("zebra");
    await expect(g.page.getByText("1 of 2")).toBeVisible();
    // At once, before the callout's slide has ended: the next match.
    await input.press("Enter");
    await expect(g.page.getByText("2 of 2")).toBeVisible();
    const activeOnScreen = () =>
      g.page.evaluate(() => {
        const r = CSS.highlights.get("find-active")?.values().next().value as Range | undefined;
        if (!r) return "none";
        const b = r.getBoundingClientRect();
        const text = r.startContainer.parentElement?.closest("[data-block-id]")?.textContent;
        return `${text} ${b.top >= 0 && b.bottom <= window.innerHeight ? "on" : "off"}`;
      });
    await expect.poll(activeOnScreen).toBe("zebra end. on");
    // Past the slide's end: still there, never scrolled back to the first.
    await sleep(1200);
    expect(await activeOnScreen()).toBe("zebra end. on");
  } finally {
    await g.close();
  }
});

// The chevron is reached directly by keys: Tab from the title lands on it,
// Enter and Space fold and unfold, and it says its state.
test("the chevron is a Tab stop after the title; Enter and Space fold and unfold it", async () => {
  const title = callout(h.page, 1).locator(".callout-title");
  await title.click();
  await h.page.keyboard.press("Tab");
  await expect(chevron(h.page, 1)).toBeFocused();
  await expect(chevron(h.page, 1)).toHaveAttribute("aria-expanded", "true");
  await h.page.keyboard.press("Enter");
  await expect(chevron(h.page, 1)).toHaveAttribute("aria-expanded", "false");
  await expect(chevron(h.page, 1)).toBeFocused();
  await h.page.keyboard.press("Space");
  await expect(chevron(h.page, 1)).toHaveAttribute("aria-expanded", "true");
  // Shift+Tab goes back to the title.
  await h.page.keyboard.press("Shift+Tab");
  await expect(title).toBeFocused();
  await unchanged();
});

// Foldable, in the type menu, is an edit: ticked it writes `-` and folds the
// callout now; unticked it writes no sign. One undo step each way. A `+`
// already in the file reads as ticked and is never turned into `-`.
const UNDO = isMac ? "Meta+z" : "Control+z";
async function foldableRow(page: Page, n: number) {
  await callout(page, n).getByRole("button", { name: "Change callout type" }).click();
  const menu = page.getByRole("menu", { name: "Callout type" });
  await expect(menu).toBeVisible();
  return menu.getByRole("menuitemcheckbox", { name: "Foldable" });
}

test("Foldable writes `-` and folds the callout, the caret leaving its body; ⌘Z takes it back", async () => {
  await callout(h.page, 2).locator(".callout-body").click();
  const row = await foldableRow(h.page, 2);
  await expect(row).toHaveAttribute("aria-checked", "false");
  await row.click();
  await expect(h.page.getByRole("menu", { name: "Callout type" })).toHaveCount(0);
  await expect(chevron(h.page, 2)).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => shown(h.page, 2)).toBe(false);
  await expect(callout(h.page, 2).locator(".callout-title")).toBeFocused();
  await expect
    .poll(() => h.vault.read(NOTE))
    .toBe(FILE.replace("[!note] No sign", "[!note]- No sign"));

  await h.page.keyboard.press(UNDO);
  await expect.poll(() => h.vault.read(NOTE)).toBe(FILE);
  await expect(chevron(h.page, 2)).toHaveCount(0);
  await expect.poll(() => shown(h.page, 2)).toBe(true);
  expect(h.pageErrors).toEqual([]);
});

test("unticking Foldable removes the sign and opens the callout; `+` reads as ticked", async () => {
  const folded = await foldableRow(h.page, 0);
  await expect(folded).toHaveAttribute("aria-checked", "true");
  await folded.click();
  await expect(chevron(h.page, 0)).toHaveCount(0);
  await expect.poll(() => shown(h.page, 0)).toBe(true);

  const open = await foldableRow(h.page, 1);
  await expect(open).toHaveAttribute("aria-checked", "true");
  await open.click();
  await expect
    .poll(() => h.vault.read(NOTE))
    .toBe(
      FILE.replace("[!warning]- Folded", "[!warning] Folded").replace(
        "[!tip]+ Starts",
        "[!tip] Starts",
      ),
    );
});
