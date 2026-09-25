/**
 * The Markdown view (2026-09-24): the note shown as its file, editable, from
 * the ··· menu, View, ⌘/ or the lit `</>` beside the ···. Switching alone
 * never changes a byte; what is typed there reaches the file as typing does,
 * and Cmd+Z takes it back.
 */
import { expect, test } from "@playwright/test";
import { PATH_AIR } from "../../src/components/EditorChrome";
import { WINDOW_MIN_W } from "../../src/constants/layout";
import {
  MOD,
  SETTLE_MS,
  expandAllFolders,
  launchApp,
  menuClick,
  sleep,
  waitForFile,
} from "./harness";

const label = (h: Awaited<ReturnType<typeof launchApp>>, id: string) =>
  h.app.evaluate(({ Menu }, id) => Menu.getApplicationMenu()?.getMenuItemById(id)?.label, id);

// Written in spellings the app would not choose itself: star bullets, a
// padded table, frontmatter, a tilde fence. The view shows them as they are.
const FILE = [
  "---",
  "tags: [uni]",
  "---",
  "# Reading",
  "",
  "* one",
  "* two",
  "",
  "| a  | b  |",
  "|----|----|",
  "| 1  | 2  |",
  "",
  "~~~",
  "code",
  "~~~",
  "",
].join("\n");

test("the Markdown view shows the file as it is, and switching changes nothing on disk", async () => {
  const h = await launchApp({ "Alpha.md": FILE });
  try {
    await h.openNote("Alpha");
    const before = h.vault.mtimeMs("Alpha.md");
    await h.page.locator("[data-block-id]", { hasText: "one" }).click();

    await h.page.keyboard.press(`${MOD}+/`);
    const field = h.page.getByRole("textbox", { name: "Markdown" });
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(FILE);
    // The mode's one mark on screen: the lit control beside the ···.
    await expect(h.page.getByRole("button", { name: "Show formatted", exact: true })).toBeVisible();
    await expect.poll(() => label(h, "toggleSourceView")).toBe("Show Formatted");

    await h.page.getByRole("button", { name: "Show formatted", exact: true }).click();
    await expect(field).toHaveCount(0);
    await expect(h.page.getByRole("button", { name: "Show formatted", exact: true })).toHaveCount(
      0,
    );
    await expect.poll(() => label(h, "toggleSourceView")).toBe("Show Markdown");

    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe(FILE);
    expect(h.vault.mtimeMs("Alpha.md")).toBe(before);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("what is typed in the Markdown view reaches the file, and Cmd+Z takes it back", async () => {
  const h = await launchApp({ "Alpha.md": "First line.\n" });
  try {
    await h.openNote("Alpha");
    await menuClick(h, "toggleSourceView");
    const field = h.page.getByRole("textbox", { name: "Markdown" });
    await expect(field).toBeFocused();
    await field.press(`${MOD}+ArrowDown`);
    await h.page.keyboard.type("\n## Added");
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("## Added"));
    // The file is what the field holds, as typed.
    const typed = await field.inputValue();
    expect(typed).toBe("First line.\n\n## Added");
    expect(h.vault.read("Alpha.md")).toBe(typed);

    // The formatted view is built from what was typed.
    await menuClick(h, "toggleSourceView");
    await expect(h.page.locator("h2", { hasText: "Added" })).toBeVisible();

    // Back in the Markdown view, the note's own undo repaints the field.
    await h.page.keyboard.press(`${MOD}+/`);
    await expect(field).toHaveValue(typed);
    await h.page.keyboard.press(`${MOD}+z`);
    await expect(field).toHaveValue("First line.\n");
    await waitForFile(h.vault.file("Alpha.md"), (t) => !t.includes("Added"));
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the path at the top holds still across the switch, folders and all", async () => {
  // Switching once moved the band's right edge for the `</>`, and the name
  // slid while the folder crumbs dropped out for a frame; and a note tall
  // enough to scroll in one view and not the other moved it by half a bar.
  const h = await launchApp({
    "University/Archive/Reading.md": `# Reading\n\n${"A line of the note.\n\n".repeat(14)}`,
  });
  try {
    await expandAllFolders(h.page);
    await h.openNote("Reading");
    const path = h.page.getByTestId("note-path");
    const box = async () => {
      const b = await h.page.locator("[data-title]").boundingBox();
      return {
        x: Math.round(b!.x),
        y: Math.round(b!.y),
        text: (await path.textContent())?.replace(/\s+/g, " "),
      };
    };
    const before = await box();
    expect(before.text).toContain("University");
    for (let i = 0; i < 2; i++) {
      // Every frame of the switch, not only where it settles.
      const frames = await h.page.evaluate(
        async (mod) => {
          const seen = new Set<string>();
          window.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "/",
              [mod]: true,
              bubbles: true,
              cancelable: true,
            }),
          );
          for (let f = 0; f < 20; f++) {
            const t = document.querySelector("[data-title]");
            const r = t?.getBoundingClientRect();
            seen.add(
              t && r
                ? `${Math.round(r.left)},${Math.round(r.top)}|${document.querySelector("[data-testid=note-path]")?.textContent.replace(/\s+/g, " ")}`
                : "gone",
            );
            await new Promise((r) => requestAnimationFrame(r));
          }
          return [...seen];
        },
        process.platform === "darwin" ? "metaKey" : "ctrlKey",
      );
      expect(frames).toEqual([`${before.x},${before.y}|${before.text}`]);
    }
    expect(await box()).toEqual(before);
  } finally {
    await h.close();
  }
});

test("a menu the keyboard opened in one view does not follow into the other", async () => {
  const h = await launchApp({ "Alpha.md": "First line.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]", { hasText: "First line." }).click();
    await h.page.keyboard.press(`${MOD}+ArrowRight`);
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.type("/");
    const slash = h.page.getByRole("listbox", { name: "Slash commands" });
    await expect(slash).toBeVisible();
    await h.page.keyboard.press(`${MOD}+/`);
    await expect(h.page.getByRole("textbox", { name: "Markdown" })).toBeFocused();
    await expect(slash).toHaveCount(0);
    await h.page.keyboard.press(`${MOD}+/`);
    await expect(slash).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a long name never runs under the lit </>, at any width, and the name's keys cross into the view", async () => {
  const name = "A really rather long note name that keeps going well past the middle";
  const h = await launchApp({ [`University/Archive/${name}.md`]: "Body line.\n" });
  try {
    await expandAllFolders(h.page);
    await h.openNote(name);
    await h.page.keyboard.press(`${MOD}+/`);
    const toggle = h.page.getByRole("button", { name: "Show formatted", exact: true });
    await expect(toggle).toBeVisible();
    for (let width = 1200; width >= WINDOW_MIN_W; width -= 40) {
      await h.app.evaluate(({ BrowserWindow }, w) => {
        BrowserWindow.getAllWindows()[0].setSize(w, 800);
      }, width);
      await expect.poll(() => h.page.evaluate(() => window.innerWidth)).toBe(width);
      await h.page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))),
      );
      const path = await h.page.getByTestId("note-path").boundingBox();
      const lit = await toggle.boundingBox();
      expect(path!.x + path!.width, `at ${width}`).toBeLessThanOrEqual(lit!.x - PATH_AIR + 0.5);
    }

    // Enter from the name goes into the Markdown, and ArrowUp from its first line back.
    const title = h.page.getByRole("textbox", { name: "Note title" });
    await title.click();
    await h.page.keyboard.press("Enter");
    const field = h.page.getByRole("textbox", { name: "Markdown" });
    await expect(field).toBeFocused();
    await h.page.keyboard.press("ArrowUp");
    await expect(title).toBeFocused();
    await h.page.keyboard.press("ArrowDown");
    await expect(field).toBeFocused();
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the view is app-wide: the next note opens in it too", async () => {
  const h = await launchApp({ "Alpha.md": "# A\n", "Beta.md": "# B\n" });
  try {
    await h.openNote("Alpha");
    await h.page.keyboard.press(`${MOD}+/`);
    await expect(h.page.getByRole("textbox", { name: "Markdown" })).toHaveValue("# A\n");
    await h.openNote("Beta");
    await expect(h.page.getByRole("textbox", { name: "Markdown" })).toHaveValue("# B\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
