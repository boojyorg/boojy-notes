import { type CDPSession, expect, type Page, test } from "@playwright/test";

// The phone's hold (useHoldToGrab), in the web build behind `?hold`: a finger
// kept still on a block grabs it; moved, it drags the block; let go, it opens
// the block's menu under it. A scroll and a double-tap stay the browser's.
// Touches go through CDP, so the page sees real touch events.

test.use({ hasTouch: true });

const HOLD = 500;

type TouchType = "touchStart" | "touchMove" | "touchEnd";

const menu = (page: Page) => page.getByRole("menu", { name: "Block options" });
const paragraphs = (page: Page) => page.locator('[data-editor] [data-block-type="p"]');
/** The blocks wearing the selection band, by text. */
const washed = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-editor] > [data-block-id]"))
      .filter((el) => getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)")
      .map((el) => el.innerText.trim()),
  );

async function threeParagraphs(page: Page, url = "/?hold") {
  await page.goto(url);
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Hold");
  await paragraphs(page).first().click();
  await page.keyboard.type("One");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Two");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Three");
  await expect(paragraphs(page)).toHaveText(["One", "Two", "Three"]);
}

function finger(cdp: CDPSession) {
  const at = (type: TouchType, x: number, y: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: [{ x, y }] });
  return {
    down: (x: number, y: number) => at("touchStart", x, y),
    move: (x: number, y: number) => at("touchMove", x, y),
    up: () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }),
  };
}

async function centre(page: Page, index: number) {
  const b = (await paragraphs(page).nth(index).boundingBox())!;
  return { x: b.x + 20, y: b.y + b.height / 2 };
}

test("a still finger, let go, selects the block and opens its menu under it", async ({ page }) => {
  await threeParagraphs(page);
  const f = finger(await page.context().newCDPSession(page));
  const p = await centre(page, 1);

  await f.down(p.x, p.y);
  await page.waitForTimeout(HOLD);
  await f.up();

  await expect.poll(() => washed(page)).toEqual(["Two"]);
  await expect(menu(page)).toBeVisible();
  const block = (await paragraphs(page).nth(1).boundingBox())!;
  const box = (await menu(page).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(block.y + block.height);
});

test("a held finger that moves drags the block, one commit on the drop", async ({ page }) => {
  await threeParagraphs(page);
  const f = finger(await page.context().newCDPSession(page));
  const from = await centre(page, 0);
  const last = (await paragraphs(page).nth(2).boundingBox())!;
  const to = last.y + last.height - 2;

  await f.down(from.x, from.y);
  await page.waitForTimeout(HOLD);
  for (let i = 1; i <= 8; i++) await f.move(from.x, from.y + ((to - from.y) * i) / 8);
  await f.up();

  await expect(paragraphs(page)).toHaveText(["Two", "Three", "One"]);
  await expect(menu(page)).toHaveCount(0);
  await expect.poll(() => washed(page)).toEqual([]);

  await page.keyboard.press("Meta+z");
  await expect(paragraphs(page)).toHaveText(["One", "Two", "Three"]);
});

test("a double-tap just past a short word selects the word", async ({ page }) => {
  // The browser selects only a word under the finger: a tap on the space
  // after `Hi`, or beyond the line's end after `ok`, selected nothing.
  await page.goto("/?hold");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Words");
  await paragraphs(page).first().click();
  await page.keyboard.type("Hi there ok");
  const f = finger(await page.context().newCDPSession(page));
  const past = (from: number, to: number, nudge: number) =>
    paragraphs(page)
      .first()
      .evaluate(
        (p, [from, to, nudge]) => {
          const range = document.createRange();
          range.setStart(p.firstChild as Text, from);
          range.setEnd(p.firstChild as Text, to);
          const r = range.getBoundingClientRect();
          return { x: r.right + nudge, y: r.top + r.height / 2 };
        },
        [from, to, nudge],
      );
  const doubleTap = async ({ x, y }: { x: number; y: number }) => {
    await f.down(x, y);
    await f.up();
    await page.waitForTimeout(80);
    await f.down(x, y);
    await f.up();
  };
  const selected = () => page.evaluate(() => document.getSelection()?.toString());

  await doubleTap(await past(0, 2, 1)); // on the space after `Hi`, nearer `Hi`
  await expect.poll(selected).toBe("Hi");
  await page.waitForTimeout(400);
  await doubleTap(await past(9, 11, 6)); // beyond the line's end, after `ok`
  await expect.poll(selected).toBe("ok");
  await expect(menu(page)).toHaveCount(0);
});

test("a double-tap just past a bold short word selects that word, not the next", async ({
  page,
}) => {
  // `**Hi**` is a text node of its own: the point lands in the one after it.
  await page.goto("/?hold");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Bold");
  await paragraphs(page).first().click();
  await page.keyboard.type("**Hi** there");
  await expect(paragraphs(page).first().locator("strong")).toHaveText("Hi");
  const f = finger(await page.context().newCDPSession(page));
  const r = (await paragraphs(page).first().locator("strong").boundingBox())!;
  const x = r.x + r.width + 1;
  const y = r.y + r.height / 2;
  await f.down(x, y);
  await f.up();
  await page.waitForTimeout(80);
  await f.down(x, y);
  await f.up();
  await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toBe("Hi");
});

test("a held finger that moves never ends in the menu, even where the block can't move", async ({
  page,
}) => {
  // A note of one block has nowhere to put it: the drag never starts, and
  // the lift was taken for a still finger's.
  await page.goto("/?hold");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Hold");
  await paragraphs(page).first().click();
  await page.keyboard.type("Only");
  const f = finger(await page.context().newCDPSession(page));
  const from = await centre(page, 0);

  await f.down(from.x, from.y);
  await page.waitForTimeout(HOLD);
  for (let i = 1; i <= 8; i++) await f.move(from.x, from.y + 25 * i);
  await f.up();

  await page.waitForTimeout(300);
  await expect(menu(page)).toHaveCount(0);
  await expect(paragraphs(page)).toHaveText(["Only"]);
});

test("a finger that moves before the hold is a scroll, never a hold", async ({ page }) => {
  await threeParagraphs(page);
  const f = finger(await page.context().newCDPSession(page));
  const p = await centre(page, 1);

  await f.down(p.x, p.y);
  await f.move(p.x, p.y + 30);
  await page.waitForTimeout(HOLD);
  await f.up();

  await expect(menu(page)).toHaveCount(0);
  await expect.poll(() => washed(page)).toEqual([]);
});

test("the second press of a double-tap is the text's, never a hold", async ({ page }) => {
  await threeParagraphs(page);
  const f = finger(await page.context().newCDPSession(page));
  const p = await centre(page, 1);

  await f.down(p.x, p.y);
  await f.up();
  await f.down(p.x, p.y);
  await page.waitForTimeout(HOLD);
  await f.up();

  await expect(menu(page)).toHaveCount(0);
  await expect.poll(() => washed(page)).toEqual([]);
});

test("a held block drags from the first move, and a hold through the open menu grabs", async ({
  page,
}) => {
  await threeParagraphs(page);
  const f = finger(await page.context().newCDPSession(page));
  const two = await centre(page, 1);

  await f.down(two.x, two.y);
  await page.waitForTimeout(HOLD);
  await f.up();
  await expect(menu(page)).toBeVisible();

  // Already selected: no second wait.
  const first = (await paragraphs(page).nth(0).boundingBox())!;
  await f.down(two.x, two.y);
  for (let i = 1; i <= 6; i++) await f.move(two.x, two.y + ((first.y + 2 - two.y) * i) / 6);
  await f.up();
  await expect(paragraphs(page)).toHaveText(["Two", "One", "Three"]);
});

test("Turn into shows its kinds in the same menu, and Back returns", async ({ page }) => {
  await threeParagraphs(page);
  const f = finger(await page.context().newCDPSession(page));
  const p = await centre(page, 1);

  await f.down(p.x, p.y);
  await page.waitForTimeout(HOLD);
  await f.up();

  await menu(page).getByRole("menuitem", { name: "Turn into" }).tap();
  await expect(page.getByRole("menu", { name: "Turn into" })).toHaveCount(0);
  await expect(menu(page).getByRole("menuitemradio", { name: "Text" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await menu(page).getByRole("menuitem", { name: "Turn into" }).tap();
  await expect(menu(page).getByRole("menuitem", { name: "Copy" })).toBeVisible();

  await menu(page).getByRole("menuitem", { name: "Turn into" }).tap();
  await menu(page).getByRole("menuitemradio", { name: "Heading 1" }).tap();
  await expect(page.locator('[data-editor] [data-block-type="h1"]')).toHaveText("Two");
});

test("a held list item drags with its nested items", async ({ page }) => {
  await page.goto("/?hold");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Nested");
  await paragraphs(page).first().click();
  await page.keyboard.type("- Parent");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Child");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("After");
  const items = page.locator('[data-editor] [data-block-type="bullet"]');
  await expect(items).toHaveCount(2);

  const f = finger(await page.context().newCDPSession(page));
  const parent = (await items.first().boundingBox())!;
  const after = (await paragraphs(page).last().boundingBox())!;
  const from = { x: parent.x + parent.width / 2, y: parent.y + parent.height / 2 };
  const to = after.y + after.height - 2;
  await f.down(from.x, from.y);
  await page.waitForTimeout(HOLD);
  for (let i = 1; i <= 8; i++) await f.move(from.x, from.y + ((to - from.y) * i) / 8);
  await f.up();

  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("[data-editor] > [data-block-id]"))
          .map((el) => el.innerText.trim())
          .filter(Boolean),
      ),
    )
    .toEqual(["After", "Parent", "Child"]);
});

test("a second finger mid-drag leaves the drag to the first", async ({ page }) => {
  await threeParagraphs(page);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: TouchType, touchPoints: { x: number; y: number; id: number }[]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  const from = await centre(page, 0);
  const last = (await paragraphs(page).nth(2).boundingBox())!;
  const to = last.y + last.height - 2;
  const at = (i: number) => ({ x: from.x, y: from.y + ((to - from.y) * i) / 8, id: 0 });
  // Where Android hands the app an edge swipe made while a finger is down.
  const other = { x: 2, y: from.y, id: 1 };

  await touch("touchStart", [at(0)]);
  await page.waitForTimeout(HOLD);
  for (let i = 1; i <= 3; i++) await touch("touchMove", [at(i)]);
  await touch("touchStart", [at(3), other]);
  await touch("touchMove", [at(4), { ...other, x: 60 }]);
  // A touchEnd names the fingers that lift.
  await touch("touchEnd", [{ ...other, x: 60 }]);
  for (let i = 5; i <= 8; i++) await touch("touchMove", [at(i)]);
  await touch("touchEnd", []);

  await expect(paragraphs(page)).toHaveText(["Two", "Three", "One"]);
  await expect(page.locator(".block-drop-marker:visible")).toHaveCount(0);
});

test("a drag the editor is rebuilt under goes home: no copy or marker is left", async ({
  page,
}) => {
  await threeParagraphs(page);
  const f = finger(await page.context().newCDPSession(page));
  const from = await centre(page, 0);
  const before = await page.evaluate(() => document.body.children.length);

  await f.down(from.x, from.y);
  await page.waitForTimeout(HOLD);
  for (let i = 1; i <= 4; i++) await f.move(from.x, from.y + 15 * i);
  await page.keyboard.press("Meta+/");
  await f.up();
  await page.keyboard.press("Meta+/");

  await expect(paragraphs(page)).toHaveText(["One", "Two", "Three"]);
  await expect.poll(() => page.evaluate(() => document.body.children.length)).toBe(before);
  await expect(page.locator(".block-drop-marker:visible")).toHaveCount(0);
});

test("the window losing focus ends the touch: a waiting hold never fires, a drag goes home", async ({
  page,
}) => {
  await threeParagraphs(page);
  const f = finger(await page.context().newCDPSession(page));
  const from = await centre(page, 0);
  const blur = () => page.evaluate(() => window.dispatchEvent(new Event("blur")));

  await f.down(from.x, from.y);
  await blur();
  await page.waitForTimeout(HOLD);
  await f.up();
  await expect(menu(page)).toHaveCount(0);
  await expect.poll(() => washed(page)).toEqual([]);

  await f.down(from.x, from.y);
  await page.waitForTimeout(HOLD);
  for (let i = 1; i <= 4; i++) await f.move(from.x, from.y + 15 * i);
  await blur();
  for (let i = 5; i <= 8; i++) await f.move(from.x, from.y + 15 * i);
  await f.up();
  await expect(paragraphs(page)).toHaveText(["One", "Two", "Three"]);
  await expect(page.locator(".block-drop-marker:visible")).toHaveCount(0);
});

test("a hold whose lift is lost never refuses the next finger's scroll", async ({ page }) => {
  await threeParagraphs(page);
  const f = finger(await page.context().newCDPSession(page));
  const held = await centre(page, 0);
  const next = await centre(page, 2);
  await page.evaluate(() => {
    const w = window as unknown as { refused: boolean[] };
    w.refused = [];
    window.addEventListener("touchmove", (e) => w.refused.push(e.defaultPrevented));
    // The lift is heard nowhere, as when its target left the page.
    window.addEventListener("touchend", (e) => e.stopImmediatePropagation(), {
      capture: true,
      once: true,
    });
  });

  await f.down(held.x, held.y);
  await page.waitForTimeout(HOLD);
  await f.up();
  await expect(menu(page)).toHaveCount(0);

  await f.down(next.x, next.y);
  for (let i = 1; i <= 4; i++) await f.move(next.x, next.y - 15 * i);
  await f.up();
  const refused = await page.evaluate(() => (window as unknown as { refused: boolean[] }).refused);
  expect(refused.length).toBeGreaterThan(0);
  expect(refused).not.toContain(true);
});

test("a hold on selected text is the text's; a hold elsewhere still grabs its block", async ({
  page,
}) => {
  await threeParagraphs(page);
  const f = finger(await page.context().newCDPSession(page));
  const select = () =>
    page.evaluate(() => {
      const p = document.querySelectorAll('[data-editor] [data-block-type="p"]')[1];
      const r = document.createRange();
      r.selectNodeContents(p.firstChild!);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    });
  const hold = async (x: number, y: number) => {
    await f.down(x, y);
    await page.waitForTimeout(HOLD);
    await f.up();
  };

  await select();
  const word = (await page.evaluate(() =>
    getSelection()!.getRangeAt(0).getBoundingClientRect().toJSON(),
  )) as DOMRect;
  await hold(word.x + word.width / 2, word.y + word.height / 2);
  await expect(menu(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe("Two");

  // Below the words: the selection toolbar stands over the line above.
  const three = await centre(page, 2);
  await hold(three.x, three.y);
  await expect(menu(page)).toBeVisible();
  await expect.poll(() => washed(page)).toEqual(["Three"]);
});

test("a hold on a code block's selected text is the text's", async ({ page }) => {
  await page.goto("/?hold");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Code");
  await paragraphs(page).first().click();
  await page.keyboard.type("``` ");
  const code = page.locator("[data-editor] textarea");
  await expect(code).toBeFocused();
  await page.keyboard.type("let a = 1");
  await code.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 3));

  const f = finger(await page.context().newCDPSession(page));
  const b = (await code.boundingBox())!;
  await f.down(b.x + 12, b.y + b.height / 2);
  await page.waitForTimeout(HOLD);
  await f.up();

  await expect(menu(page)).toHaveCount(0);
  await expect
    .poll(() => code.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]))
    .toEqual([0, 3]);
});

/** Selects the second paragraph's word, "Two"; answers its rect. */
async function selectTwo(page: Page) {
  return (await page.evaluate(() => {
    const p = document.querySelectorAll('[data-editor] [data-block-type="p"]')[1];
    const r = document.createRange();
    r.selectNodeContents(p.firstChild!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
    return r.getBoundingClientRect().toJSON();
  })) as DOMRect;
}

test("selected words held and moved stay put: no text drag, no block drag", async ({ page }) => {
  await threeParagraphs(page);
  const f = finger(await page.context().newCDPSession(page));
  const word = await selectTwo(page);
  const three = (await paragraphs(page).nth(2).boundingBox())!;
  const from = { x: word.x + word.width / 2, y: word.y + word.height / 2 };

  await f.down(from.x, from.y);
  await page.waitForTimeout(HOLD);
  for (let i = 1; i <= 8; i++)
    await f.move(from.x + 20 * (i / 8), from.y + (three.y + three.height / 2 - from.y) * (i / 8));
  await f.up();

  await expect(paragraphs(page)).toHaveText(["One", "Two", "Three"]);
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe("Two");
  await expect(page.locator(".block-drop-marker:visible")).toHaveCount(0);
  await expect(menu(page)).toHaveCount(0);
});

// The browser's own text drag cannot be driven headless (no drag starts, on
// the desktop either), so the refusal is read where it acts: the dragstart
// the browser fires from selected words. The Pixel shows the rest.
const dragStartRefused = async (page: Page) => {
  await selectTwo(page);
  return page.evaluate(() => {
    const p = document.querySelectorAll('[data-editor] [data-block-type="p"]')[1];
    const e = new DragEvent("dragstart", { bubbles: true, cancelable: true });
    p.dispatchEvent(e);
    return e.defaultPrevented;
  });
};

test("on the phone the browser's text drag is refused", async ({ page }) => {
  await threeParagraphs(page);
  expect(await dragStartRefused(page)).toBe(true);
});

test("on the desktop selected words still drag as text", async ({ page }) => {
  await threeParagraphs(page, "/");
  expect(await dragStartRefused(page)).toBe(false);
});

// Android's long-press focuses the note; the hold takes the focus back, the
// keyboard being down. The editor's caret rescue, a frame after the focus,
// put the caret in the first block and scrolled the note to its top.
test("a focus the hold takes back places no caret and never scrolls the note", async ({ page }) => {
  await page.goto("/?hold");
  await page.locator("[data-title]").first().click();
  await page.keyboard.type("Long");
  await paragraphs(page).first().click();
  await page.keyboard.type("# Top");
  await page.keyboard.press("Enter");
  for (let i = 1; i <= 40; i++) {
    await page.keyboard.type(`Line ${i}`);
    await page.keyboard.press("Enter");
  }
  const scroller = page.locator(".editor-scroll");
  // The keyboard down: nothing focused, no caret in the note (once the last
  // Enter's caret has landed).
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    getSelection()?.removeAllRanges();
  });
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const before = await scroller.evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(200);

  await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>("[data-editor]")!;
    editor.focus({ preventScroll: true });
    editor.blur();
    // Android's WebView drops the selection with the focus.
    getSelection()?.removeAllRanges();
  });
  await page.waitForTimeout(200);

  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(before);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

test("a hold is felt once, as it is recognised, and the drag after adds nothing", async ({
  page,
}) => {
  // The phone's API carries the system's long-press tap (src/phone/haptics.ts).
  await page.addInitScript(() => {
    const w = window as unknown as { felt: number; boojyPhoneAPI: unknown };
    w.felt = 0;
    w.boojyPhoneAPI = { holdFelt: () => w.felt++ };
  });
  await threeParagraphs(page);
  const f = finger(await page.context().newCDPSession(page));
  const felt = () => page.evaluate(() => (window as unknown as { felt: number }).felt);
  const from = await centre(page, 0);

  await f.down(from.x, from.y);
  await page.waitForTimeout(HOLD / 2);
  expect(await felt()).toBe(0);
  await page.waitForTimeout(HOLD);
  expect(await felt()).toBe(1);
  for (let i = 1; i <= 4; i++) await f.move(from.x, from.y + 15 * i);
  await f.up();
  expect(await felt()).toBe(1);
});
