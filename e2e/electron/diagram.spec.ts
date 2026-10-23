/**
 * A ```` ```mermaid ```` code block is a diagram: drawn on the code block's
 * ground, its code joined above it while open. `</>` in the shared
 * toolbar opens and closes it (lit while open); a new one starts open; it
 * stays open until closed, and Shift+Enter closes it. The file holds the
 * fence as written: a diagram is only a code block drawn.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, END_OF_LINE, SETTLE_MS, launchApp, sleep, waitForFile } from "./harness";

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
  // The toolbar: the language, then </>, copy last.
  const labels = await h.page
    .locator(".diagram-block .code-tools button")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(labels).toEqual(["Code language", "Hide code", "Copy code"]);
  await sleep(SETTLE_MS);
  expect(h.vault.read(NOTE)).toBe("Intro.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n");
  expect(h.pageErrors).toEqual([]);
});
