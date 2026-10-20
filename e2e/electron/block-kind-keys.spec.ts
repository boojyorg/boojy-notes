import { expect, test } from "@playwright/test";
import { launchApp, menuClick, menuEnabled, MOD, waitForFile, type AppHandle } from "./harness";

/**
 * Cmd + a number applies a block kind (Ctrl elsewhere): 0 Text, 1–6 the
 * headings, 7 numbered, 8 bullet, 9 to-do. It applies, never toggles: the
 * kind a line already is changes nothing. Cmd+0 is Text, so Actual Size is
 * Shift+Cmd+0. A real keypress cannot reach a menu accelerator from here
 * (app-menu.spec.ts), so the items' accelerators are read and the items
 * clicked, which is the path the key takes.
 */

const accelerator = (h: AppHandle, id: string) =>
  h.app.evaluate(
    ({ Menu }, id) => Menu.getApplicationMenu()?.getMenuItemById(id)?.accelerator ?? null,
    id,
  );

test("the Format menu shows a number for every kind, and Actual Size takes Shift", async () => {
  const h = await launchApp({ "Note.md": "One.\n" });
  try {
    const keys: Record<string, string> = {
      body: "CmdOrCtrl+0",
      h1: "CmdOrCtrl+1",
      h2: "CmdOrCtrl+2",
      h3: "CmdOrCtrl+3",
      h4: "CmdOrCtrl+4",
      h5: "CmdOrCtrl+5",
      h6: "CmdOrCtrl+6",
      numbered: "CmdOrCtrl+7",
      bullet: "CmdOrCtrl+8",
      todo: "CmdOrCtrl+9",
      actualSize: "Shift+CmdOrCtrl+0",
    };
    for (const [id, key] of Object.entries(keys)) expect(await accelerator(h, id), id).toBe(key);
  } finally {
    await h.close();
  }
});

test("each kind applies to the caret's line, and the kind it already is changes nothing", async () => {
  const h = await launchApp({ "Note.md": "- Intro\n" });
  const file = h.vault.file("Note.md");
  try {
    await h.openNote("Note");
    await h.page.locator("[data-block-id]", { hasText: "Intro" }).click();

    await menuClick(h, "h1");
    await waitForFile(file, (t) => t === "# Intro\n", { label: "the bullet became Heading 1" });
    // Again: still Heading 1, and no second history step, so one Undo is the bullet.
    await menuClick(h, "h1");
    await menuClick(h, "undo");
    await waitForFile(file, (t) => t === "- Intro\n", { label: "one Undo gives the bullet back" });
    await expect.poll(() => menuEnabled(h, "undo")).toBe(false);

    const steps: [string, string][] = [
      ["h5", "##### Intro\n"],
      ["body", "Intro\n"],
      ["numbered", "1. Intro\n"],
      ["todo", "- [ ] Intro\n"],
      ["bullet", "- Intro\n"],
    ];
    for (const [id, text] of steps) {
      await menuClick(h, id);
      await waitForFile(file, (t) => t === text, { label: `${id} applied` });
    }
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("with the block menu open, a number key turns the block", async () => {
  const h = await launchApp({ "Note.md": "Intro\n" });
  const file = h.vault.file("Note.md");
  try {
    await h.openNote("Note");
    await h.page.locator("[data-block-id]", { hasText: "Intro" }).click();
    await h.page.keyboard.press("Escape"); // selects the block
    await h.page.keyboard.press("Shift+F10");
    await expect(h.page.getByRole("menu", { name: "Block options" })).toBeVisible();
    await h.page.keyboard.press(`${MOD}+2`);
    await waitForFile(file, (t) => t === "## Intro\n", { label: "the block became Heading 2" });
    await expect(h.page.getByRole("menu", { name: "Block options" })).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
