import { expect, type Page, test } from "@playwright/test";

// The phone's bar above the keyboard, in the web build behind `?keybar` (no
// keyboard to wait for). In a list item it shows the list's own row, whose
// ⇤ ⇥ are Tab and Shift+Tab: the nested items follow, the caret stays on its
// character, one undo each, and a button greys where Tab would move nothing.

const item = (page: Page, text: string) =>
  page.getByRole("textbox", { name: "Bullet item" }).filter({ hasText: text });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const left = async (page: Page, text: string) => (await item(page, text).boundingBox())!.x;

/** The caret's block text, and the text before the caret in it. */
const caret = (page: Page) =>
  page.evaluate(() => {
    const sel = window.getSelection()!;
    const node = sel.anchorNode!;
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement!;
    const block = el.closest('[role="textbox"]')!;
    const range = document.createRange();
    range.setStart(block, 0);
    range.setEnd(node, sel.anchorOffset);
    return { text: block.textContent, before: range.toString() };
  });

/** Alpha, then Parent with Child nested under it. */
async function nestedList(page: Page) {
  await page.goto("/?keybar");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Lists");
  await page.locator('[data-editor] [data-block-type="p"]').first().click();
  await expect(button(page, "Lists")).toBeVisible();
  await page.keyboard.type("- Alpha");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Parent");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Child");
  await page.keyboard.press("Tab");
  await expect
    .poll(async () => (await left(page, "Child")) - (await left(page, "Parent")))
    .toBeGreaterThan(0);
}

test("in a list the bar is the list's row, its ⇤ ⇥ greyed where Tab would move nothing", async ({
  page,
}) => {
  await nestedList(page);
  await item(page, "Alpha").click();
  await expect(button(page, "Indent")).toHaveAttribute("aria-disabled", "true");
  await expect(button(page, "Outdent")).toHaveAttribute("aria-disabled", "true");
  await item(page, "Child").click();
  await expect(button(page, "Indent")).toHaveAttribute("aria-disabled", "true");
  await expect(button(page, "Outdent")).not.toHaveAttribute("aria-disabled");
});

test("undo and redo stand in the same place in every row", async ({ page }) => {
  await nestedList(page);
  const at = async () => [
    (await button(page, "Undo").boundingBox())!.x,
    (await button(page, "Redo").boundingBox())!.x,
  ];
  await item(page, "Parent").click();
  await expect(button(page, "Indent")).toBeVisible();
  const list = await at();
  await button(page, "Close").click();
  await expect(button(page, "Lists")).toBeVisible();
  expect(await at()).toEqual(list);
  await button(page, "Headings").click();
  await expect(button(page, "Heading 6")).toBeVisible();
  expect(await at()).toEqual(list);
  await button(page, "Close").click();
  await button(page, "More blocks").click();
  await expect(button(page, "Divider")).toBeVisible();
  expect(await at()).toEqual(list);
});

test("More blocks puts a code block under a line of text, the caret in it", async ({ page }) => {
  await page.goto("/?keybar");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Blocks");
  await page.locator('[data-editor] [data-block-type="p"]').first().click();
  await page.keyboard.type("Some words");
  await button(page, "More blocks").click();
  await button(page, "Code block").click();

  const code = page.locator('[data-editor] [data-block-type="code"]');
  await expect(code).toHaveCount(1);
  await expect(page.locator('[data-editor] [data-block-type="p"]').first()).toHaveText(
    "Some words",
  );
  await expect.poll(() => code.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  // The choice closed the row.
  await expect(button(page, "Code block")).toBeHidden();
  await expect(button(page, "More blocks")).toBeVisible();
});

test("⇥ moves an item with its nested items, the caret staying, and Undo puts them back", async ({
  page,
}) => {
  await nestedList(page);
  const parent = await left(page, "Parent");
  const child = await left(page, "Child");

  await item(page, "Parent").click();
  await page.keyboard.press("End");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft");
  await button(page, "Indent").click();

  await expect.poll(() => left(page, "Parent")).toBeGreaterThan(parent);
  // The nested item came along (each depth draws its own marker, so not by the same pixels).
  expect(await left(page, "Child")).toBeGreaterThan(child);
  expect(await caret(page)).toEqual({ text: "Parent", before: "Par" });
  await expect(button(page, "Outdent")).not.toHaveAttribute("aria-disabled");

  await button(page, "Undo").click();
  await expect.poll(() => left(page, "Parent")).toBeCloseTo(parent);
  expect(await left(page, "Child")).toBeCloseTo(child);
});

const blockCount = (page: Page) => page.locator("[data-editor] > [data-block-id]").count();

test("a block put under a list parent leaves its children under it, and one Undo takes it back", async ({
  page,
}) => {
  await nestedList(page);
  const before = await blockCount(page);
  await item(page, "Parent").click();
  // The list's row stands over the main row: its ✕ first.
  await button(page, "Close").click();
  await button(page, "More blocks").click();
  await button(page, "Code block").click();

  const code = page.locator('[data-editor] [data-block-type="code"]');
  await expect(code).toHaveCount(1);
  // The child is still nested under its parent, and the code block comes after it.
  expect(await left(page, "Child")).toBeGreaterThan(await left(page, "Parent"));
  expect((await code.boundingBox())!.y).toBeGreaterThan(
    (await item(page, "Child").boundingBox())!.y,
  );

  await button(page, "Undo").click();
  await expect(code).toHaveCount(0);
  await expect.poll(() => blockCount(page)).toBe(before);
});

test("a divider under a line of text is one Undo", async ({ page }) => {
  await page.goto("/?keybar");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Divider");
  await page.locator('[data-editor] [data-block-type="p"]').first().click();
  await page.keyboard.type("Some words");
  await page.waitForTimeout(600);
  const before = await blockCount(page);
  await button(page, "More blocks").click();
  await button(page, "Divider").click();
  const divider = page.locator('[data-editor] [data-block-type="spacer"]');
  await expect(divider).toHaveCount(1);

  await button(page, "Undo").click();
  await expect(divider).toHaveCount(0);
  await expect.poll(() => blockCount(page)).toBe(before);
  await expect(page.locator('[data-editor] [data-block-type="p"]').first()).toHaveText(
    "Some words",
  );
});

const greyed = (page: Page, name: string) =>
  expect(button(page, name)).toHaveAttribute("aria-disabled", "true");
const live = (page: Page, name: string) =>
  expect(button(page, name)).not.toHaveAttribute("aria-disabled");

test("in a table cell the kind buttons grey and the text styles act, all but Link", async ({
  page,
}) => {
  await page.goto("/?keybar");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Cell");
  await page.locator('[data-editor] [data-block-type="p"]').first().click();
  await page.keyboard.type("||| ");
  await page.keyboard.type("cell words");
  await greyed(page, "Headings");
  await greyed(page, "Lists");
  await live(page, "Text style");
  await button(page, "More blocks").click();
  await greyed(page, "Quote");
  await live(page, "Table");
  await button(page, "Close").click();

  await button(page, "Text style").click();
  await live(page, "Bold");
  await greyed(page, "Link");
  await page.locator("[data-inline-field]").first().selectText();
  await button(page, "Bold").click();
  await expect(page.locator("[data-inline-field] strong")).toHaveText("cell words");
});

test("in a code block only undo and the inserts act", async ({ page }) => {
  await page.goto("/?keybar");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Code");
  await page.locator('[data-editor] [data-block-type="p"]').first().click();
  await page.keyboard.type("``` ");
  await page.keyboard.type("let x = 1");
  await greyed(page, "Headings");
  await greyed(page, "Lists");
  await greyed(page, "Text style");
  await live(page, "Undo");
  await live(page, "More blocks");
});

test("a held button names itself and lifting changes nothing; the caret stays", async ({
  page,
}) => {
  await page.goto("/?keybar");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Hold");
  await page.locator('[data-editor] [data-block-type="p"]').first().click();
  await page.keyboard.type("Some words");
  const chip = page.getByTestId("key-bar-chip");
  const at = () => page.evaluate(() => getSelection()!.anchorOffset);
  const before = await at();

  const box = (await button(page, "Headings").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(chip).toHaveText("HeadingsH1–H6");
  // Above the bar, within the window.
  const c = (await chip.boundingBox())!;
  expect(c.y + c.height).toBeLessThanOrEqual(box.y);
  expect(c.x).toBeGreaterThanOrEqual(0);
  await page.mouse.up();
  // The row it would open stayed shut, and the caret kept its place.
  await expect(button(page, "Heading 2")).toBeHidden();
  expect(await at()).toBe(before);
  await expect(chip).toBeHidden();

  // A tap still acts.
  await button(page, "Headings").click();
  await expect(button(page, "Heading 2")).toBeVisible();
});

test.describe("by touch", () => {
  test.use({ hasTouch: true });

  test("a second finger never turns the first finger's hold into a tap", async ({ page }) => {
    await page.goto("/?keybar");
    await page.locator("[data-title]").first().click();
    await page.keyboard.type("Fingers");
    await page.locator('[data-editor] [data-block-type="p"]').first().click();
    await page.keyboard.type("Some words ");
    await button(page, "Text style").click();
    const cdp = await page.context().newCDPSession(page);
    const centre = async (name: string, id: number) => {
      const b = (await button(page, name).boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2, id };
    };
    const touch = (
      type: "touchStart" | "touchEnd",
      touchPoints: { x: number; y: number; id: number }[],
    ) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    const bold = await centre("Bold", 0);
    const italic = await centre("Italic", 1);

    await touch("touchStart", [bold]);
    await expect(page.getByTestId("key-bar-chip")).toHaveText("Bold**");
    await touch("touchStart", [bold, italic]);
    // A touchEnd names the fingers that lift: the first, then the second.
    await touch("touchEnd", [bold]);
    await touch("touchEnd", [italic]);

    await expect(button(page, "Bold")).not.toHaveAttribute("aria-pressed");
    await expect(button(page, "Italic")).not.toHaveAttribute("aria-pressed");
    await page.keyboard.type("x");
    await expect(page.locator("[data-editor] strong, [data-editor] em")).toHaveCount(0);
  });

  test("a finger's tap acts at its lift; its hold keeps the note focused and acts on nothing", async ({
    page,
  }) => {
    await page.goto("/?keybar");
    await page.locator("[data-title]").first().click();
    await page.keyboard.type("Touch");
    await page.locator('[data-editor] [data-block-type="p"]').first().click();
    await page.keyboard.type("Some words");
    const cdp = await page.context().newCDPSession(page);
    const down = async (name: string) => {
      const b = (await button(page, name).boundingBox())!;
      const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
      return b;
    };
    const up = () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const touch = async (name: string) => {
      await down(name);
      await up();
    };
    const inNote = () => page.evaluate(() => !!document.activeElement?.closest("[data-editor]"));

    await touch("Headings");
    await expect(button(page, "Heading 2")).toBeVisible();
    const held = await down("Heading 2");
    const chip = page.getByTestId("key-bar-chip");
    await expect(chip).toHaveText("Heading 2##");
    // Clear of the fingertip, its tail pointing at the button.
    const c = (await chip.boundingBox())!;
    expect(held.y - (c.y + c.height)).toBeGreaterThanOrEqual(12);
    expect(await inNote()).toBe(true);
    // Slid on to H3, the chip goes with the finger; lifting there chooses nothing.
    const h3 = (await button(page, "Heading 3").boundingBox())!;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: h3.x + h3.width / 2, y: h3.y + h3.height / 2 }],
    });
    await expect(chip).toHaveText("Heading 3###");
    await up();
    await expect(chip).toBeHidden();
    // Lifting chose nothing: the line is still text, the row still open.
    await expect(page.locator('[data-editor] [data-block-type="p"]').first()).toHaveText(
      "Some words",
    );
    await expect(button(page, "Heading 2")).toBeVisible();
    await touch("Heading 2");
    await expect(page.locator('[data-editor] [data-block-type="h2"]')).toHaveText("Some words");
    expect(await inNote()).toBe(true);
  });
});
