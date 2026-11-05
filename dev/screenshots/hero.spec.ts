/**
 * The README and website screenshots: `pnpm screenshots`.
 *
 * Builds nothing itself (the script runs `vite build` first). Launches the real
 * desktop app hidden, through the Electron suite's harness, against a sample
 * vault made fresh in a temp folder, so no real note can appear. Writes
 * `assets/screenshots/notes-{dark,light}.png`. Re-run after a release that
 * changes the look.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import { launchApp, settled, type AppHandle } from "../../e2e/electron/harness";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/screenshots");

/**
 * The window, captured at the display's scale (2× on Retina). GitHub shows the
 * image about 880px wide, so the interface size, not the window, sets how big
 * the text reads there: 110% lays the window out as ~1000px of interface.
 */
const WINDOW = { width: 1100, height: 640 };
/** The interface size the shots use, in percent, as Settings → Interface size sets it. */
const UI_SCALE = 110;

const LISBON = `## Before we go

- [x] Book the train to **Sintra**
- [ ] Pick up the adapter
- [ ] Print the tickets, see [[Packing list]]

## Places to eat

| Where           | Area          | Price |
| --------------- | ------------- | ----- |
| Time Out Market | Cais do Sodré | €€    |
| A fish place    | Alfama        | €€    |
| The tiny bakery | Graça         | €     |

> Take the 28 tram early, *before* the queues.

Budget is about \`€120\` a day. #travel #food
`;

const NOTES: Record<string, string> = {
  "Travel/Lisbon trip.md": LISBON,
  "Travel/Packing list.md": "- [ ] Passport\n- [ ] Adapter\n- [ ] Rain jacket\n",
  "Work/Weekly plan.md": "## Monday\n\nShip the README.\n",
  "Work/Meeting notes.md": "Notes from Tuesday.\n",
  "Reading/Books.md": "- *The Left Hand of Darkness*\n",
  "Ideas.md": "A garden for the balcony.\n",
  "Recipes.md": "## Pastéis de nata\n\nTry the bakery's first.\n",
};

/** Newest first in the sidebar's Most recent sort: Lisbon trip on top. */
const ORDER = [
  "Travel/Lisbon trip.md",
  "Ideas.md",
  "Travel/Packing list.md",
  "Recipes.md",
  "Work/Weekly plan.md",
  "Reading/Books.md",
  "Work/Meeting notes.md",
];

async function setLook(h: AppHandle, themeMode: "night" | "day") {
  await h.page.evaluate(
    ({ themeMode, scale }) => {
      localStorage.setItem("boojy-theme", JSON.stringify({ themeMode }));
      localStorage.setItem("boojy-ui-scale", String(scale));
    },
    { themeMode, scale: UI_SCALE },
  );
  await h.page.reload();
  await h.page.getByRole("button", { name: "New note", exact: true }).waitFor();
}

async function openLisbon(h: AppHandle) {
  const travel = h.page.locator('[role="treeitem"]').filter({ hasText: "Travel" }).first();
  if ((await travel.getAttribute("aria-expanded")) !== "true") await travel.click();
  await h.openNote("Lisbon trip");
  // Nothing focused, no caret, no hover: the note at rest.
  await h.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await h.page.mouse.move(WINDOW.width - 2, WINDOW.height - 2);
  // The note fits, but the column's bottom padding still scrolls: no thumb in a picture.
  await h.page.addStyleTag({ content: ".editor-scroll::-webkit-scrollbar { display: none; }" });
  await settled(h.page);
  await h.page.evaluate(() => document.fonts.ready);
  await h.page.waitForTimeout(400);
}

test("screenshots", async () => {
  test.setTimeout(90_000);
  fs.mkdirSync(out, { recursive: true });
  const h = await launchApp(NOTES, {
    // The storage location's name, shown at the top of the tree.
    vaultDir: "My notes",
    prepare: (vault) => {
      const now = Date.now();
      for (const [i, rel] of ORDER.entries()) vault.setMtime(rel, now - i * 3_600_000);
    },
  });
  try {
    await h.app.evaluate(({ BrowserWindow }, { width, height }) => {
      BrowserWindow.getAllWindows()[0].setContentSize(width, height);
    }, WINDOW);
    for (const [mode, name] of [
      ["night", "notes-dark"],
      ["day", "notes-light"],
    ] as const) {
      await setLook(h, mode);
      await openLisbon(h);
      await h.page.screenshot({ path: path.join(out, `${name}.png`) });
    }
  } finally {
    await h.close();
  }
});
