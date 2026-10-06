/**
 * A file that is not a note, shown in the note's place: a PDF drawn page by
 * page (PDF.js), a picture, or a card for a kind the app can't show. Needs
 * the real app: the bytes come through the main process (`read-vault-file`),
 * PDF.js runs in its worker, and the keys, the field and Back are the
 * window's.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { expect, type Page, test } from "@playwright/test";
import { expandAllFolders, launchApp, MOD } from "./harness";
import { makePdf } from "./pdfFixture";

const SLIDES = makePdf([
  ["Lecture 3: Kinematics", "COMP329 Robotics"],
  ["Forward kinematics", "Joint angles in, pose out"],
  ["Joint space", "One value per joint"],
  ["The Jacobian", "Joint speeds to tip speed"],
  ["Summary", "Next week: trajectories"],
]);
// A 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const seed = {
  "Uni/COMP329.md": "Overview.\n",
  "Notes.md": "See [[Lecture 3.pdf#page=4]] for the Jacobian.\n",
};
const prepare = (vault: { file: (rel: string) => string }) => {
  fs.writeFileSync(vault.file("Uni/Lecture 3.pdf"), SLIDES);
  fs.writeFileSync(vault.file("Uni/whiteboard.png"), PNG);
  fs.writeFileSync(vault.file("Uni/Week 3.pptx"), "not really slides");
};

const pageField = (page: Page) => page.getByTestId("page-field");
const openFileRow = async (page: Page, name: string) => {
  await expandAllFolders(page);
  await page.locator(`[data-file-path$="${name}"]`).click();
};
/** Whether PDF.js has drawn page `n` (its canvas has pixels). */
const drawn = (page: Page, n: number) =>
  page
    .locator(`[data-testid='pdf-pages'] [data-pdf-page="${n}"] canvas`)
    .evaluate((c: HTMLCanvasElement) => c.width > 0);

test("a PDF clicked in the sidebar opens in the note's place, its row held, its pages drawn", async () => {
  const h = await launchApp(seed, { prepare });
  try {
    await expandAllFolders(h.page);
    await h.openNote("COMP329");
    await openFileRow(h.page, "Lecture 3.pdf");
    await expect(h.page.getByTestId("pdf-pages")).toBeVisible();
    await expect.poll(() => drawn(h.page, 1)).toBe(true);
    await expect(pageField(h.page)).toHaveValue("1");
    await expect(h.page.getByTestId("file-controls")).toContainText("of 5");
    // No note is open: the name field is gone, the path names the file.
    await expect(h.page.getByRole("textbox", { name: "Note title" })).toHaveCount(0);
    await expect(h.page.locator("[data-file-title]")).toHaveText("Lecture 3.pdf");
    await expect(h.page.locator('[data-file-path$="Lecture 3.pdf"]')).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("→ and Space step a page, the field follows, and a typed page is gone to", async () => {
  const h = await launchApp(seed, { prepare });
  try {
    await openFileRow(h.page, "Lecture 3.pdf");
    await expect.poll(() => drawn(h.page, 1)).toBe(true);
    await h.page.keyboard.press("ArrowRight");
    await expect(pageField(h.page)).toHaveValue("2");
    await h.page.keyboard.press("Space");
    await expect(pageField(h.page)).toHaveValue("3");
    await h.page.keyboard.press("ArrowLeft");
    await expect(pageField(h.page)).toHaveValue("2");

    await pageField(h.page).click();
    await h.page.keyboard.type("5");
    await h.page.keyboard.press("Enter");
    await expect(pageField(h.page)).toHaveValue("5");
    await expect.poll(() => drawn(h.page, 5)).toBe(true);
    // The pages took the keys back: ← steps again.
    await h.page.keyboard.press("ArrowLeft");
    await expect(pageField(h.page)).toHaveValue("4");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Back from a note returns to the PDF at the page it was left on", async () => {
  const h = await launchApp(seed, { prepare });
  try {
    await openFileRow(h.page, "Lecture 3.pdf");
    await expect.poll(() => drawn(h.page, 1)).toBe(true);
    await h.page.keyboard.press("ArrowRight");
    await h.page.keyboard.press("ArrowRight");
    await expect(pageField(h.page)).toHaveValue("3");

    await h.openNote("COMP329");
    await expect(h.page.getByTestId("pdf-pages")).toHaveCount(0);
    await h.page.keyboard.press(`${MOD}+BracketLeft`);
    await expect(h.page.getByTestId("pdf-pages")).toBeVisible();
    await expect(pageField(h.page)).toHaveValue("3");
    await h.page.keyboard.press(`${MOD}+BracketRight`);
    await expect(h.page.getByRole("textbox", { name: "Note title" })).toHaveText("COMP329");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a [[file.pdf#page=4]] link opens the PDF at page 4, and is not drawn broken", async () => {
  const h = await launchApp(seed, { prepare });
  try {
    await h.openNote("Notes");
    await expect(h.page.locator("[data-block-id] .wikilink")).toHaveCount(1);
    await expect(h.page.locator("[data-block-id] .wikilink-broken")).toHaveCount(0);
    await h.page.locator("[data-block-id] .wikilink").click();
    await expect(h.page.getByTestId("pdf-pages")).toBeVisible();
    await expect(pageField(h.page)).toHaveValue("4");
    await expect.poll(() => drawn(h.page, 4)).toBe(true);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Copy Link to This Page puts the page's link on the clipboard", async () => {
  const h = await launchApp(seed, { prepare });
  try {
    await openFileRow(h.page, "Lecture 3.pdf");
    await expect.poll(() => drawn(h.page, 1)).toBe(true);
    await h.page.keyboard.press("ArrowRight");
    await expect(pageField(h.page)).toHaveValue("2");
    await h.page.getByRole("button", { name: "File actions" }).click();
    await h.page.getByRole("menuitem", { name: "Copy Link to This Page" }).click();
    await expect
      .poll(() => h.app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe("[[Lecture 3.pdf#page=2]]");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a slide's words select and copy as text", async () => {
  const h = await launchApp(seed, { prepare });
  try {
    await openFileRow(h.page, "Lecture 3.pdf");
    const words = h.page.locator("[data-pdf-page='1'] .pdf-text span", { hasText: "Kinematics" });
    await expect(words.first()).toBeAttached();
    const text = await h.page.evaluate(() => {
      const layer = document.querySelector("[data-pdf-page='1'] .pdf-text");
      const range = document.createRange();
      range.selectNodeContents(layer as Node);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return sel?.toString() ?? "";
    });
    expect(text).toContain("Lecture 3: Kinematics");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the zoom menu steps and stays open, fits, and the file remembers it", async () => {
  const h = await launchApp(seed, { prepare });
  try {
    await openFileRow(h.page, "Lecture 3.pdf");
    await expect.poll(() => drawn(h.page, 1)).toBe(true);
    await h.page.getByTestId("zoom-button").click();
    const menu = h.page.getByTestId("zoom-menu");
    await expect(menu.getByRole("menuitemradio", { name: "Fit Width" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const before = await h.page.getByTestId("zoom-figure").textContent();
    await menu.getByRole("menuitem", { name: "Zoom in" }).click();
    await expect(menu).toBeVisible();
    await expect(h.page.getByTestId("zoom-figure")).not.toHaveText(before ?? "");
    await menu.getByRole("menuitemradio", { name: "Actual Size" }).click();
    await expect(menu).toHaveCount(0);
    await expect(h.page.getByTestId("zoom-button")).toHaveText(/100%/);

    // Another file and back: the zoom it was left at.
    await openFileRow(h.page, "whiteboard.png");
    await expect(h.page.getByTestId("zoom-button")).toHaveText(/Fit/);
    await openFileRow(h.page, "Lecture 3.pdf");
    await expect(h.page.getByTestId("zoom-button")).toHaveText(/100%/);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a picture switches between fitted and its real size; a .pptx gets the card", async () => {
  const h = await launchApp(seed, { prepare });
  try {
    await openFileRow(h.page, "whiteboard.png");
    const picture = h.page.getByTestId("picture-view").getByRole("button");
    await expect(picture).toHaveAccessibleName("Show at real size");
    await picture.click();
    await expect(h.page.getByTestId("zoom-button")).toHaveText(/100%/);
    await expect(picture).toHaveAccessibleName("Fit to the window");

    await openFileRow(h.page, "Week 3.pptx");
    await expect(h.page.getByTestId("file-card")).toContainText("can’t show this kind of file");
    await expect(h.page.getByTestId("file-controls")).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the page column opens from its toggle, rings the page in view, and a click goes there", async () => {
  const h = await launchApp(seed, { prepare });
  try {
    await openFileRow(h.page, "Lecture 3.pdf");
    await expect.poll(() => drawn(h.page, 1)).toBe(true);
    const toggle = h.page.getByTestId("page-column-toggle");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const column = h.page.getByTestId("page-column");
    await expect(column.getByRole("button", { name: "Page 1" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await column.getByRole("button", { name: "Page 4" }).click();
    await expect(pageField(h.page)).toHaveValue("4");
    await expect(column.getByRole("button", { name: "Page 4" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the viewer, its page column and its zoom menu have no serious accessibility faults", async () => {
  const h = await launchApp(seed, { prepare });
  try {
    await openFileRow(h.page, "Lecture 3.pdf");
    await expect.poll(() => drawn(h.page, 1)).toBe(true);
    await h.page.getByTestId("page-column-toggle").click();
    await h.page.getByTestId("zoom-button").click();
    await expect(h.page.getByTestId("zoom-menu")).toBeVisible();
    // axe-core injected into the window itself: the Playwright helper opens a
    // second page, which an Electron window refuses.
    const axeSource = fs.readFileSync(
      createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
      "utf8",
    );
    await h.page.evaluate(axeSource);
    const results = await h.page.evaluate(() =>
      (
        window as unknown as {
          axe: {
            run: (
              c: object,
              o: object,
            ) => Promise<{
              violations: { id: string; impact: string; nodes: { target: string[] }[] }[];
            }>;
          };
        }
      ).axe.run(
        // The PDF's own text layer is the file's words, not the app's.
        { exclude: [[".pdf-text"]] },
        { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } },
      ),
    );
    const serious = results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(" ")) }));
    expect(serious).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the zoom figure is a field: a typed size applies on Enter and closes the menu, Escape cancels", async () => {
  const h = await launchApp(seed, { prepare });
  try {
    await openFileRow(h.page, "Lecture 3.pdf");
    await expect.poll(() => drawn(h.page, 1)).toBe(true);
    const menu = h.page.getByTestId("zoom-menu");
    await h.page.getByTestId("zoom-button").click();
    await h.page.getByTestId("zoom-figure").click();
    const field = h.page.getByTestId("zoom-input");
    await expect(field).toBeFocused();
    // The field's keys are its own: a typed minus is not Zoom Out, Escape keeps the menu.
    await h.page.keyboard.type("90");
    await h.page.keyboard.press("Escape");
    await expect(menu).toBeVisible();
    await expect(h.page.getByTestId("zoom-figure")).not.toHaveText("90%");

    await h.page.getByTestId("zoom-figure").click();
    await h.page.keyboard.type("140");
    await h.page.keyboard.press("Enter");
    await expect(menu).toHaveCount(0);
    await expect(h.page.getByTestId("zoom-button")).toHaveText(/140%/);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the path holds still as a PDF opens from a note: no frame drawn short or gliding", async () => {
  const h = await launchApp(seed, { prepare });
  try {
    await expandAllFolders(h.page);
    await h.openNote("COMP329");
    await expandAllFolders(h.page);
    await h.page.evaluate(() => {
      const w = window as unknown as { frames: number[] };
      w.frames = [];
      const snap = () => {
        const name = document.querySelector("[data-file-title]");
        if (name) w.frames.push(Math.round(name.getBoundingClientRect().left));
        if (w.frames.length < 30) requestAnimationFrame(snap);
      };
      requestAnimationFrame(snap);
    });
    await h.page.locator('[data-file-path$="Lecture 3.pdf"]').click();
    await expect
      .poll(() => h.page.evaluate(() => (window as unknown as { frames: number[] }).frames.length))
      .toBe(30);
    const frames = await h.page.evaluate(() => (window as unknown as { frames: number[] }).frames);
    expect(new Set(frames).size).toBe(1);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

/** Select page `n`'s words, as a drag across them would. */
const selectPageText = (page: Page, n: number) =>
  page.evaluate((n) => {
    const layer = document.querySelector(
      `[data-testid='pdf-pages'] [data-pdf-page="${n}"] .pdf-text`,
    );
    const range = document.createRange();
    range.selectNodeContents(layer as Node);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, n);
const clipboard = (h: Awaited<ReturnType<typeof launchApp>>) =>
  h.app.evaluate(({ clipboard }) => clipboard.readText());

test("right-click on selected words: Copy, and Copy as Quote ends with the page's link", async () => {
  const h = await launchApp(seed, { prepare });
  try {
    await openFileRow(h.page, "Lecture 3.pdf");
    await h.page.keyboard.press("ArrowRight");
    await expect.poll(() => drawn(h.page, 2)).toBe(true);
    await expect(h.page.locator("[data-pdf-page='2'] .pdf-text span").first()).toBeAttached();
    await selectPageText(h.page, 2);
    await h.page.locator("[data-pdf-page='2'] .pdf-text span").first().click({ button: "right" });
    const menu = h.page.getByTestId("pdf-menu");
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Copy",
      "Copy as Quote",
      "Copy Link to This Page",
    ]);
    await menu.getByRole("menuitem", { name: "Copy as Quote" }).click();
    await expect
      .poll(() => clipboard(h))
      .toBe("> Forward kinematics\n> Joint angles in, pose out\n> — [[Lecture 3.pdf#page=2]]");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Link Page in Note puts the page's link where the note's cursor was, by ··· and by ⌥⌘L", async () => {
  const h = await launchApp(
    { ...seed, "Uni/COMP329.md": "Overview.\n\nSlides here\n" },
    { prepare },
  );
  try {
    await expandAllFolders(h.page);
    await h.openNote("COMP329");
    // The cursor at the end of "Slides here", then over to the PDF.
    await h.page.locator("[data-block-id]", { hasText: "Slides here" }).click();
    await h.page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowRight" : "End");
    await openFileRow(h.page, "Lecture 3.pdf");
    await expect.poll(() => drawn(h.page, 1)).toBe(true);
    await h.page.keyboard.press("ArrowRight");
    await h.page.keyboard.press("ArrowRight");
    await expect(pageField(h.page)).toHaveValue("3");
    await h.page.getByRole("button", { name: "File actions" }).click();
    await h.page.getByRole("menuitem", { name: "Link Page in “COMP329”" }).click();
    await expect(h.page.getByRole("textbox", { name: "Note title" })).toHaveText("COMP329");
    await expect
      .poll(() => h.vault.read("Uni/COMP329.md"))
      .toBe("Overview.\n\nSlides here [[Lecture 3.pdf#page=3]]\n");

    // Again, from the keyboard: the cursor stayed after the link.
    await openFileRow(h.page, "Lecture 3.pdf");
    await expect(pageField(h.page)).toHaveValue("3");
    await expect.poll(() => drawn(h.page, 3)).toBe(true);
    await h.page.keyboard.press("ArrowRight");
    await expect(pageField(h.page)).toHaveValue("4");
    await h.page.keyboard.press(`${MOD}+Alt+KeyL`);
    await expect
      .poll(() => h.vault.read("Uni/COMP329.md"))
      .toBe("Overview.\n\nSlides here [[Lecture 3.pdf#page=3]] [[Lecture 3.pdf#page=4]]\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
