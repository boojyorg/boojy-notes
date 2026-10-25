import { expect, test } from "@playwright/test";
import { launchApp, menuClick, sleep, START_OF_LINE, waitForFile, type AppHandle } from "./harness";

/**
 * Which lines a text selection covers, for every command that acts on lines:
 * a selection that stops before a line's first character (Shift+↓ from a
 * line's start ends at the next line's start) selects nothing of that line,
 * so it is left out. One rule, `selectedLines`, for ⌘0–9, Check Off, Tab,
 * Escape and a grip drag.
 */

const line = (h: AppHandle, text: string) =>
  h.page.locator("[data-block-id]", { hasText: new RegExp(`^${text}$`) });

/** From the start of `text`'s line, Shift+↓ once: the selection ends at the next line's start. */
async function selectLineFrom(h: AppHandle, text: string) {
  await line(h, text).click();
  await h.page.keyboard.press(START_OF_LINE);
  await h.page.keyboard.press("Shift+ArrowDown");
}

test("a block kind applies to the lines selected, not the one the selection stops before", async () => {
  const h = await launchApp({ "Note.md": "One\n\nTwo\n\nThree\n" });
  try {
    await h.openNote("Note");
    await selectLineFrom(h, "One");
    await menuClick(h, "h1");
    await waitForFile(h.vault.file("Note.md"), (t) => t === "# One\n\nTwo\n\nThree\n", {
      label: "only One a heading",
    });
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Tab over a selection indents the items selected, not the next one", async () => {
  const h = await launchApp({ "List.md": "- zero\n- one\n- two\n- three\n" });
  const file = h.vault.file("List.md");
  try {
    await h.openNote("List");
    await line(h, "one").click();
    await h.page.keyboard.press(START_OF_LINE);
    await h.page.keyboard.press("Shift+ArrowDown");
    await h.page.keyboard.press("Shift+ArrowDown");
    await h.page.keyboard.press("Tab");
    await waitForFile(
      file,
      (t) => {
        const [zero, one, two, three] = t.split("\n");
        return (
          zero === "- zero" &&
          /^\s+- one$/.test(one) &&
          /^\s+- two$/.test(two) &&
          three === "- three"
        );
      },
      { label: "one and two indented, three not" },
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Escape selects the lines selected whole, not the one the selection stops before", async () => {
  const h = await launchApp({ "Note.md": "One\n\nTwo\n\nThree\n" });
  try {
    await h.openNote("Note");
    await selectLineFrom(h, "One");
    await h.page.keyboard.press("Escape");
    await h.page.keyboard.press("Backspace");
    await waitForFile(h.vault.file("Note.md"), (t) => t === "Two\n\nThree\n", {
      label: "only One removed",
    });
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a grip drag carries the lines selected, not the one the selection stops before", async () => {
  const h = await launchApp({ "Note.md": "Alpha\n\nBeta\n\nGamma\n\nDelta\n" });
  try {
    await h.openNote("Note");
    await selectLineFrom(h, "Alpha");

    const alpha = line(h, "Alpha");
    const box = await alpha.boundingBox();
    const delta = await line(h, "Delta").boundingBox();
    if (!box || !delta) throw new Error("blocks not visible");
    const id = await alpha.getAttribute("data-block-id");
    const grip = h.page.locator(`[data-testid="block-drag-handle"][data-target-block="${id}"]`);
    await h.page.mouse.move(box.x + 40, box.y + box.height / 2);
    await grip.waitFor({ timeout: 2_000 });
    const g = await grip.boundingBox();
    if (!g) throw new Error("grip not visible");
    const gx = g.x + g.width / 2;
    const gy = g.y + g.height / 2;
    await h.page.mouse.move(gx, gy);
    await h.page.mouse.down();
    await h.page.mouse.move(gx, gy + 8, { steps: 2 });
    await h.page.waitForFunction(() => document.body.classList.contains("block-dragging"), null, {
      timeout: 2_000,
    });
    await h.page.mouse.move(gx, delta.y + delta.height - 2, { steps: 6 });
    await sleep(50);
    await h.page.mouse.up();

    await waitForFile(h.vault.file("Note.md"), (t) => t === "Beta\n\nGamma\n\nDelta\n\nAlpha\n", {
      label: "Alpha alone moved under Delta",
    });
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
