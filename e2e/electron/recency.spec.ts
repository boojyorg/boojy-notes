/**
 * "Most recent" means most recently modified. Opening a note never moves it.
 *
 * Reproduces two review findings: opening reshuffled the list under the
 * pointer (so a double-click rename renamed the row above the one clicked,
 * and renamed the wrong file), and the order changed after every restart.
 * Needs the real app: the order is built from file mtimes, the watcher and
 * the write path, none of which jsdom sees.
 */
import { expect, test } from "@playwright/test";
import {
  END_OF_LINE,
  SETTLE_MS,
  launchApp,
  renameRow,
  rootNoteOrder,
  sleep,
  waitForFile,
} from "./harness";

const HOUR = 60 * 60 * 1000;

test("order follows modification: opening never moves a note, editing here or outside does", async () => {
  const h = await launchApp(
    { "Alpha.md": "Alpha body.\n", "Beta.md": "Beta body.\n", "Gamma.md": "Gamma body.\n" },
    {
      prepare: (vault) => {
        const now = Date.now();
        vault.setMtime("Alpha.md", now - 3 * HOUR);
        vault.setMtime("Beta.md", now - 2 * HOUR);
        vault.setMtime("Gamma.md", now - 1 * HOUR);
      },
    },
  );
  try {
    await expect.poll(() => rootNoteOrder(h.page)).toEqual(["Gamma", "Beta", "Alpha"]);

    // Reading around must not touch the order.
    for (const title of ["Alpha", "Beta", "Gamma", "Alpha", "Beta"]) {
      await h.openNote(title);
      await sleep(150);
      expect(await rootNoteOrder(h.page), `after opening ${title}`).toEqual([
        "Gamma",
        "Beta",
        "Alpha",
      ]);
    }

    // An edit made here rises to the top.
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" edited");
    await waitForFile(h.vault.file("Beta.md"), (t) => t.includes(" edited"));
    await expect.poll(() => rootNoteOrder(h.page)).toEqual(["Beta", "Gamma", "Alpha"]);

    // The order survives a restart on file mtimes alone.
    await h.restart();
    await expect.poll(() => rootNoteOrder(h.page)).toEqual(["Beta", "Gamma", "Alpha"]);

    // An edit made in another app rises to the top too.
    h.vault.write("Alpha.md", "Alpha body, changed outside.\n");
    await expect
      .poll(() => rootNoteOrder(h.page), { timeout: 5_000 })
      .toEqual(["Alpha", "Beta", "Gamma"]);
    await sleep(SETTLE_MS);

    // Double-click rename on a row that is not first renames that row and its
    // file, not whichever row was under the pointer after the first click.
    await renameRow(h.page, "Beta", "Beta renamed");
    await waitForFile(h.vault.file("Beta renamed.md"), (t) => t.includes("Beta body. edited"), {
      label: "renamed file to appear",
    });
    // The old file is unlinked only after the new one is safely on disk (the
    // crash-safe order), so its removal lands a few milliseconds later.
    await expect.poll(() => h.vault.exists("Beta.md"), { timeout: 3_000 }).toBe(false);
    expect(h.vault.read("Alpha.md")).toBe("Alpha body, changed outside.\n");
    expect(h.vault.read("Gamma.md")).toBe("Gamma body.\n");
    expect(
      h.vault
        .list()
        .filter((f) => f.endsWith(".md"))
        .sort(),
    ).toEqual(["Alpha.md", "Beta renamed.md", "Gamma.md"]);
    await expect.poll(() => rootNoteOrder(h.page)).toContain("Beta renamed");
  } finally {
    await h.close();
  }
});
