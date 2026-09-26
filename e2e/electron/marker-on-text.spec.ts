/**
 * A line kind's marker typed at the start of a paragraph that already has
 * text makes that line the kind, as it does on an empty line: `- ` before
 * `Full stack or frontend?` is the bullet. Before 2026-09-26 the dash stayed
 * text, drew as a bullet with no dot, and was written `\- ` to keep it so.
 * Cmd+Z straight after gives the literal marker back.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { MOD, SETTLE_MS, START_OF_LINE, launchApp, sleep, waitForFile } from "./harness";

const LINE = "Full stack or frontend?";
const NOTE = `# Job\n\n${LINE}\n`;

const second = (page: Page) => page.locator("[data-block-id]").nth(1);
const kindAndText = async (page: Page) => ({
  kind: await second(page).getAttribute("data-block-type"),
  // A numbered item draws its number as text of its own.
  text: (await second(page).innerText()).replace(/^\d+\.\s*/, "").trim(),
});

async function typeAtStart(page: Page, typed: string) {
  await second(page).click();
  await page.keyboard.press(START_OF_LINE);
  await page.keyboard.type(typed, { delay: 30 });
}

const CASES: Array<[string, string, string]> = [
  ["- ", "bullet", `- ${LINE}`],
  ["* ", "bullet", `- ${LINE}`],
  ["1. ", "numbered", `1. ${LINE}`],
  ["[] ", "checkbox", `- [ ] ${LINE}`],
  ["> ", "blockquote", `> ${LINE}`],
  ["## ", "h2", `## ${LINE}`],
];

for (const [marker, kind, line] of CASES) {
  test(`\`${marker.trim()}\` typed before a line's text makes it a ${kind}`, async () => {
    const h = await launchApp({ "Job.md": NOTE });
    try {
      await h.openNote("Job");
      await typeAtStart(h.page, marker);
      await expect.poll(() => kindAndText(h.page)).toEqual({ kind, text: LINE });
      await waitForFile(h.vault.file("Job.md"), (t) => t === `# Job\n\n${line}\n`);
      expect(h.pageErrors).toEqual([]);
    } finally {
      await h.close();
    }
  });
}

test("the caret stays at the start of the text, so typing goes on there", async () => {
  const h = await launchApp({ "Job.md": NOTE });
  try {
    await h.openNote("Job");
    await typeAtStart(h.page, "- ");
    await expect.poll(async () => (await kindAndText(h.page)).kind).toBe("bullet");
    await h.page.keyboard.type("Q: ");
    await waitForFile(h.vault.file("Job.md"), (t) => t === `# Job\n\n- Q: ${LINE}\n`);
  } finally {
    await h.close();
  }
});

test("Cmd+Z straight after gives the literal marker back", async () => {
  const h = await launchApp({ "Job.md": NOTE });
  try {
    await h.openNote("Job");
    await typeAtStart(h.page, "- ");
    await expect.poll(async () => (await kindAndText(h.page)).kind).toBe("bullet");
    await h.page.keyboard.press(`${MOD}+z`);
    await expect.poll(() => kindAndText(h.page)).toEqual({ kind: "p", text: `- ${LINE}` });
    await waitForFile(h.vault.file("Job.md"), (t) => t === `# Job\n\n\\- ${LINE}\n`);
  } finally {
    await h.close();
  }
});

test("a marker typed anywhere but the start, or into a paragraph of several lines, stays text", async () => {
  const h = await launchApp({ "Job.md": NOTE, "Two.md": "# Two\n\nFirst line\nsecond line\n" });
  try {
    await h.openNote("Job");
    await second(h.page).click();
    await h.page.keyboard.press(START_OF_LINE);
    for (let i = 0; i < 4; i++) await h.page.keyboard.press("ArrowRight");
    await h.page.keyboard.type("- ", { delay: 30 });
    await sleep(SETTLE_MS);
    expect((await kindAndText(h.page)).kind).toBe("p");

    await h.openNote("Two");
    await typeAtStart(h.page, "- ");
    await sleep(SETTLE_MS);
    expect((await kindAndText(h.page)).kind).toBe("p");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a marker on an empty line still opens the kind", async () => {
  const h = await launchApp({ "Job.md": "# Job\n\n" });
  try {
    await h.openNote("Job");
    await second(h.page).click();
    await h.page.keyboard.type("- Item", { delay: 30 });
    await waitForFile(h.vault.file("Job.md"), (t) => t === "# Job\n\n- Item\n");
  } finally {
    await h.close();
  }
});
