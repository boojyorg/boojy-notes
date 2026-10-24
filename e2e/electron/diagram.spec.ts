/**
 * A ```` ```mermaid ```` code block is a diagram: drawn on the code block's
 * ground, its code joined above it while open. `</>` in the shared
 * toolbar opens and closes it (lit while open); a new one starts open; it
 * stays open until closed, and Shift+Enter closes it. The file holds the
 * fence as written: a diagram is only a code block drawn.
 */
import { expect, test } from "@playwright/test";
import {
  type AppHandle,
  END_OF_LINE,
  MOD,
  SETTLE_MS,
  launchApp,
  sleep,
  waitForFile,
} from "./harness";

const NOTE = "Diagram.md";
const FLOW = "flowchart TD\n  A[Draft] --> B[Review]\n  B --> C[Publish]";

let h: AppHandle;

test.afterEach(async () => {
  await h?.close();
});

const block = (page: AppHandle["page"]) => page.locator(".diagram-block");
const code = (page: AppHandle["page"]) => page.locator(".diagram-block textarea.code-textarea");
const codeOpen = (page: AppHandle["page"]) => page.locator(".diagram-code[data-open]");
const drawing = (page: AppHandle["page"]) => page.locator(".diagram-render svg");

test("a diagram from the file is drawn at rest, its code closed, and the file is unchanged", async () => {
  h = await launchApp({ [NOTE]: `Intro.\n\n\`\`\`mermaid\n${FLOW}\n\`\`\`\n` });
  await h.openNote("Diagram");
  await expect(drawing(h.page)).toBeVisible();
  await expect(drawing(h.page)).toContainText("Review");
  await expect(codeOpen(h.page)).toHaveCount(0);
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe(`Intro.\n\n\`\`\`mermaid\n${FLOW}\n\`\`\`\n`);
  expect(h.pageErrors).toEqual([]);
});

test("``` mermaid and a space opens an empty diagram's code; typing draws it; Shift+Enter finishes", async () => {
  h = await launchApp({ [NOTE]: "Intro.\n" });
  await h.openNote("Diagram");
  await h.page.locator("[data-block-type='p']", { hasText: "Intro." }).click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.press("Enter");
  await h.page.keyboard.type("```mermaid ");
  await expect(code(h.page)).toBeFocused();
  await expect(codeOpen(h.page)).toHaveCount(1);
  await expect(block(h.page).getByText("Your diagram appears here")).toBeVisible();
  await h.page.keyboard.type("flowchart LR\nA --> B");
  await expect(drawing(h.page)).toBeVisible();
  await h.page.keyboard.press("Shift+Enter");
  await expect(codeOpen(h.page)).toHaveCount(0);
  await expect(drawing(h.page)).toBeVisible();
  await waitForFile(h.vault.file(NOTE), (t) => t.includes("A --> B"));
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toContain("```mermaid\nflowchart LR\nA --> B\n```");
  expect(h.pageErrors).toEqual([]);
});

test("</> opens the code lit and it stays open when the caret leaves; a second press closes it", async () => {
  h = await launchApp({ [NOTE]: `\`\`\`mermaid\n${FLOW}\n\`\`\`\n` });
  await h.openNote("Diagram");
  await expect(drawing(h.page)).toBeVisible();
  const button = h.page.getByRole("button", { name: "Show code" });
  await block(h.page).hover();
  await button.click();
  await expect(codeOpen(h.page)).toHaveCount(1);
  await expect(code(h.page)).toBeFocused();
  const lit = h.page.getByRole("button", { name: "Hide code" });
  await expect(lit).toHaveAttribute("aria-pressed", "true");
  // Open until closed: the caret leaving does not fold it.
  await h.page.keyboard.press("Escape");
  await expect(codeOpen(h.page)).toHaveCount(1);
  await block(h.page).hover();
  await lit.click();
  await expect(codeOpen(h.page)).toHaveCount(0);
  await drawing(h.page).click();
  await expect(codeOpen(h.page)).toHaveCount(1);
  await expect(code(h.page)).toBeFocused();
  expect(h.pageErrors).toEqual([]);
});

test("broken syntax keeps the last drawing with a reason, and the file holds what was typed", async () => {
  h = await launchApp({ [NOTE]: `\`\`\`mermaid\n${FLOW}\n\`\`\`\n` });
  await h.openNote("Diagram");
  await drawing(h.page).click();
  // Enter keeps the line's indent, as in any code block.
  await h.page.keyboard.type("\nC -->");
  await expect(block(h.page).getByRole("status")).toContainText("last version that worked");
  await expect(drawing(h.page)).toContainText("Publish");
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe(`\`\`\`mermaid\n${FLOW}\n  C -->\n\`\`\`\n`);
  expect(h.pageErrors).toEqual([]);
});

test("/diagram makes an empty diagram with its code open", async () => {
  h = await launchApp({ [NOTE]: "Intro.\n" });
  await h.openNote("Diagram");
  await h.page.locator("[data-block-type='p']", { hasText: "Intro." }).click();
  await h.page.keyboard.press(END_OF_LINE);
  await h.page.keyboard.press("Enter");
  await h.page.keyboard.type("/diagram");
  const menu = h.page.getByRole("listbox", { name: "Slash commands" });
  await expect(menu.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await h.page.keyboard.press("Enter");
  await expect(code(h.page)).toBeFocused();
  await expect(codeOpen(h.page)).toHaveCount(1);
  await h.page.keyboard.type('pie\n  "a" : 1');
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toContain('```mermaid\npie\n  "a" : 1\n```');
  expect(h.pageErrors).toEqual([]);
});

test("the grip sits at the diagram's top, not by its folded code", async () => {
  h = await launchApp({ [NOTE]: `Intro.\n\n\`\`\`mermaid\n${FLOW}\n\`\`\`\n` });
  await h.openNote("Diagram");
  await expect(drawing(h.page)).toBeVisible();
  await drawing(h.page).hover();
  const grip = h.page.locator(".block-drag-handle");
  await expect(grip).toBeVisible();
  const [g, b] = await Promise.all([grip.boundingBox(), block(h.page).boundingBox()]);
  expect(g && b).toBeTruthy();
  // Within the block's top band, never down by its bottom edge.
  expect((g?.y ?? 0) - (b?.y ?? 0)).toBeLessThan(40);
  expect(h.pageErrors).toEqual([]);
});

test("a code block switched to Mermaid keeps its code where it was and draws underneath", async () => {
  h = await launchApp({ [NOTE]: "Intro.\n\n```\nflowchart LR\n  A --> B\n```\n" });
  await h.openNote("Diagram");
  const field = h.page.locator("textarea.code-textarea");
  const before = await field.boundingBox();
  await h.page.locator(".code-block").hover();
  await h.page.getByRole("button", { name: "Code language" }).click();
  await h.page.getByRole("menuitemradio", { name: "Mermaid" }).click();
  await expect(drawing(h.page)).toBeVisible();
  await expect(codeOpen(h.page)).toHaveCount(1);
  const after = await field.boundingBox();
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(2);
  const below = await drawing(h.page).boundingBox();
  expect(below?.y ?? 0).toBeGreaterThan(after?.y ?? 0);
  // The toolbar: the language, then </> and View full size, copy last.
  const labels = await h.page
    .locator(".diagram-block .code-tools button")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(labels).toEqual(["Code language", "Hide code", "View full size", "Copy code"]);
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("Intro.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n");
  expect(h.pageErrors).toEqual([]);
});

test("changing a block's language keeps its code: the next keystroke adds to it", async () => {
  h = await launchApp({ [NOTE]: "Intro.\n\n```\nflowchart LR\n  A --> B\n```\n" });
  await h.openNote("Diagram");
  const field = h.page.locator("textarea.code-textarea");
  for (const [to, fence] of [
    ["Mermaid", "```mermaid"],
    ["Plain", "```"],
  ]) {
    await h.page.locator(".code-block").hover();
    await h.page.getByRole("button", { name: "Code language" }).click();
    await h.page.getByRole("menuitemradio", { name: to }).click();
    await expect(field).toHaveValue(/A --> B/);
    // The caret at the code's end, as a click there would put it.
    await field.evaluate((t: HTMLTextAreaElement) => {
      t.focus();
      t.setSelectionRange(t.value.length, t.value.length);
    });
    await h.page.keyboard.type("X");
    await sleep(SETTLE_MS);
    expect(h.vault.read(NOTE)).toContain(`${fence}\nflowchart LR\n  A --> BX`);
    await h.page.keyboard.press("Backspace");
    await sleep(SETTLE_MS);
  }
  expect(h.pageErrors).toEqual([]);
});

test("Enter over the whole source redraws: the old drawing never outlives its code", async () => {
  h = await launchApp({ [NOTE]: `\`\`\`mermaid\n${FLOW}\n\`\`\`\n` });
  await h.openNote("Diagram");
  await drawing(h.page).click();
  await h.page.keyboard.press(`${MOD}+a`);
  await h.page.keyboard.press("Enter");
  await expect(drawing(h.page)).toHaveCount(0);
  await expect(block(h.page).getByText("Your diagram appears here")).toBeVisible();
  expect(h.pageErrors).toEqual([]);
});

test("Shift+Enter onto a formula hands the keys to the note: Enter opens the formula", async () => {
  h = await launchApp({ [NOTE]: `\`\`\`mermaid\n${FLOW}\n\`\`\`\n\n$$\nx\n$$\n` });
  await h.openNote("Diagram");
  await drawing(h.page).click();
  await expect(code(h.page)).toBeFocused();
  await h.page.keyboard.press("Shift+Enter");
  await expect(h.page.locator("[data-block-type='math']")).toHaveAttribute("data-selected", "true");
  await expect(code(h.page)).not.toBeFocused();
  await h.page.keyboard.press("Enter");
  await expect(h.page.getByRole("textbox", { name: "Formula source" })).toBeFocused();
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe(`\`\`\`mermaid\n${FLOW}\n\`\`\`\n\n$$\nx\n$$\n`);
  expect(h.pageErrors).toEqual([]);
});

test("a diagram switched away, rewritten and switched back draws its new code", async () => {
  h = await launchApp({ [NOTE]: `\`\`\`mermaid\n${FLOW}\n\`\`\`\n` });
  await h.openNote("Diagram");
  await drawing(h.page).click();
  await h.page.keyboard.type("\nC --> D[Archive]");
  await expect(drawing(h.page)).toContainText("Archive");
  const field = h.page.locator("textarea.code-textarea");
  const pick = async (to: string) => {
    await h.page.locator(".code-block").hover();
    await h.page.getByRole("button", { name: "Code language" }).click();
    await h.page.getByRole("menuitemradio", { name: to }).click();
  };
  await pick("Plain");
  await field.focus();
  await h.page.keyboard.press(`${MOD}+a`);
  await h.page.keyboard.type("flowchart LR\n  X[Fresh] --> Y[Start]");
  await sleep(SETTLE_MS);
  await pick("Mermaid");
  await expect(drawing(h.page)).toContainText("Fresh");
  await expect(drawing(h.page)).not.toContainText("Archive");
  expect(h.pageErrors).toEqual([]);
});

test("a wide diagram shrinks to fit, no further than 65%, then scrolls to the block's edges", async () => {
  const steps = Array.from({ length: 12 }, (_, i) => `S${i}[Step number ${i}]`).join(" --> ");
  h = await launchApp({ [NOTE]: `\`\`\`mermaid\nflowchart LR\n  ${steps}\n\`\`\`\n` });
  await h.openNote("Diagram");
  await expect(drawing(h.page)).toBeVisible();
  const m = await h.page.evaluate(() => {
    const block = document.querySelector(".diagram-block") as HTMLElement;
    const view = block.querySelector(".diagram-view") as HTMLElement;
    const svg = view.querySelector("svg") as SVGSVGElement;
    const b = block.getBoundingClientRect();
    const v = view.getBoundingClientRect();
    view.scrollLeft = view.scrollWidth;
    const s = svg.getBoundingClientRect();
    return {
      natural: svg.viewBox.baseVal.width,
      drawn: svg.clientWidth,
      scrolls: view.scrollWidth > view.clientWidth,
      leftGap: v.left - b.left,
      rightGap: b.right - v.right,
      bottomGap: b.bottom - v.bottom,
      roomAfter: v.right - (v.width - view.clientWidth) - s.right,
    };
  });
  expect(m.drawn).toBeCloseTo(m.natural * 0.65, -1);
  expect(m.scrolls).toBe(true);
  // The scroller reaches the border on three sides…
  expect(m.leftGap).toBeLessThan(2);
  expect(m.rightGap).toBeLessThan(2);
  expect(m.bottomGap).toBeLessThan(2);
  // …and, scrolled to the end, the drawing keeps the block's padding after it.
  expect(m.roomAfter).toBeGreaterThan(12);
  expect(h.pageErrors).toEqual([]);
});

test("a diagram narrower than the column is drawn at its own size, never enlarged", async () => {
  h = await launchApp({ [NOTE]: `\`\`\`mermaid\n${FLOW}\n\`\`\`\n` });
  await h.openNote("Diagram");
  await expect(drawing(h.page)).toBeVisible();
  const m = await drawing(h.page).evaluate((svg: SVGSVGElement) => ({
    natural: svg.viewBox.baseVal.width,
    drawn: svg.clientWidth,
    height: svg.clientHeight,
    naturalHeight: svg.viewBox.baseVal.height,
  }));
  expect(m.drawn).toBeCloseTo(m.natural, 0);
  expect(m.height).toBeCloseTo(m.naturalHeight, 0);
});

test("View full size opens the drawing larger in the dark room; Escape or a press outside closes it", async () => {
  h = await launchApp({ [NOTE]: `\`\`\`mermaid\n${FLOW}\n\`\`\`\n\n\`\`\`mermaid\n\`\`\`\n` });
  await h.openNote("Diagram");
  await expect(drawing(h.page)).toBeVisible();
  // An empty diagram has nothing to view.
  await block(h.page).nth(1).hover();
  await expect(block(h.page).nth(1).getByRole("button", { name: "View full size" })).toHaveCount(0);

  await block(h.page).first().hover();
  await block(h.page).first().getByRole("button", { name: "View full size" }).click();
  const view = h.page.getByRole("dialog", { name: "Diagram" });
  await expect(view).toBeVisible();
  await expect(view.locator(".diagram-lightbox-panel > svg")).toContainText("Review");
  const inline = await drawing(h.page).evaluate((s) => s.getBoundingClientRect().height);
  const large = await view
    .locator(".diagram-lightbox-panel > svg")
    .evaluate((s) => s.getBoundingClientRect().height);
  expect(large).toBeGreaterThan(inline * 1.2);
  // Its code stays closed: viewing isn't editing.
  await expect(block(h.page).first().locator(".diagram-code[data-open]")).toHaveCount(0);

  await view.locator(".diagram-lightbox-panel").click();
  await expect(view).toBeVisible();
  await h.page.keyboard.press("Escape");
  await expect(view).toHaveCount(0);

  await block(h.page).first().hover();
  await block(h.page).first().getByRole("button", { name: "View full size" }).click();
  await expect(view).toBeVisible();
  await h.page.mouse.click(8, 300);
  await expect(view).toHaveCount(0);
  await expect(block(h.page).first().locator(".diagram-code[data-open]")).toHaveCount(0);
  expect(h.pageErrors).toEqual([]);
});

test("a wide diagram cleared and brought back by undo is fitted again", async () => {
  const steps = Array.from({ length: 12 }, (_, i) => `S${i}[Step number ${i}]`).join(" --> ");
  h = await launchApp({ [NOTE]: `\`\`\`mermaid\nflowchart LR\n  ${steps}\n\`\`\`\n` });
  await h.openNote("Diagram");
  await expect(drawing(h.page)).toBeVisible();
  const fitted = () =>
    drawing(h.page).evaluate((svg: SVGSVGElement) => svg.clientWidth / svg.viewBox.baseVal.width);
  expect(await fitted()).toBeCloseTo(0.65, 1);
  await drawing(h.page).click();
  await expect(code(h.page)).toBeFocused();
  await h.page.keyboard.press(`${MOD}+a`);
  await h.page.keyboard.press("Backspace");
  await expect(block(h.page).getByText("Your diagram appears here")).toBeVisible();
  await h.page.keyboard.press(`${MOD}+z`);
  await expect(drawing(h.page)).toBeVisible();
  expect(await fitted()).toBeCloseTo(0.65, 1);
  expect(h.pageErrors).toEqual([]);
});

test("the full-size view keeps its events: ⌘D and a right-click reach nothing behind it", async () => {
  const file = `Intro.\n\n\`\`\`mermaid\n${FLOW}\n\`\`\`\n`;
  h = await launchApp({ [NOTE]: file });
  await h.openNote("Diagram");
  await expect(drawing(h.page)).toBeVisible();
  await h.page.locator("[data-block-type='p']", { hasText: "Intro." }).click();
  await block(h.page).hover();
  await block(h.page).getByRole("button", { name: "View full size" }).click();
  const view = h.page.getByRole("dialog", { name: "Diagram" });
  await expect(view).toBeVisible();
  // It takes focus a frame after it opens (useFocusTrap); a key before that is
  // still the paragraph's, which no person could press in time.
  await expect(view).toBeFocused();
  await h.page.keyboard.press(`${MOD}+d`);
  await view.locator(".diagram-lightbox-panel").click({ button: "right" });
  await expect(h.page.getByRole("menu", { name: "Code block options" })).toHaveCount(0);
  await expect(view).toBeVisible();
  await h.page.keyboard.press("Escape");
  await expect(view).toHaveCount(0);
  await expect(h.page.locator("[data-block-type='p']", { hasText: "Intro." })).toHaveCount(1);
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe(file);
  expect(h.pageErrors).toEqual([]);
});
