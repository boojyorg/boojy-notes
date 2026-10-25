import { expect, test } from "@playwright/test";
import {
  launchApp,
  menuClick,
  menuEnabled,
  MOD,
  START_OF_LINE,
  waitForFile,
  type AppHandle,
} from "./harness";

/**
 * ⌘Enter ticks a to-do (Ctrl+Enter elsewhere), Notion's key: the to-dos the
 * selection runs through go one way together, ticked while any is unticked,
 * and nothing else changes. With no to-do it is Enter. Format → Check Off
 * shows the key and runs the same command; a real keypress cannot reach a
 * menu accelerator from a hidden window, so the item is clicked.
 */

const menuChecked = (h: AppHandle, id: string) =>
  h.app.evaluate(
    ({ Menu }, id) => Menu.getApplicationMenu()?.getMenuItemById(id)?.checked ?? null,
    id,
  );

const line = (h: AppHandle, text: string) => h.page.locator("[data-block-id]", { hasText: text });

test("⌘Enter ticks the caret's to-do and back, the caret held, one Undo a step", async () => {
  const h = await launchApp({ "List.md": "- [ ] Buy milk\n- [ ] Post letter\n" });
  const file = h.vault.file("List.md");
  try {
    await h.openNote("List");
    await line(h, "Buy milk").click();
    await h.page.keyboard.press(START_OF_LINE);
    await h.page.keyboard.press("ArrowRight");
    await h.page.keyboard.press("ArrowRight");

    await h.page.keyboard.press(`${MOD}+Enter`);
    await waitForFile(file, (t) => t === "- [x] Buy milk\n- [ ] Post letter\n", {
      label: "ticked",
    });
    await h.page.keyboard.press(`${MOD}+Enter`);
    await waitForFile(file, (t) => t === "- [ ] Buy milk\n- [ ] Post letter\n", {
      label: "unticked",
    });
    // The caret never moved: a letter lands where it was.
    await h.page.keyboard.type("X");
    await waitForFile(file, (t) => t === "- [ ] BuXy milk\n- [ ] Post letter\n", {
      label: "typed at the caret",
    });

    await menuClick(h, "undo");
    await waitForFile(file, (t) => t === "- [ ] Buy milk\n- [ ] Post letter\n", {
      label: "Undo takes the letter",
    });
    await menuClick(h, "undo");
    await waitForFile(file, (t) => t === "- [x] Buy milk\n- [ ] Post letter\n", {
      label: "Undo gives the tick back",
    });
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("over several lines the to-dos go one way together, and other lines stay", async () => {
  const h = await launchApp({ "List.md": "- [x] One\nNote\n- [ ] Two\n- [ ] Three\n" });
  const file = h.vault.file("List.md");
  try {
    await h.openNote("List");
    await line(h, "One").click();
    await line(h, "Two").click({ modifiers: ["Shift"] });

    await h.page.keyboard.press(`${MOD}+Enter`);
    await waitForFile(file, (t) => t === "- [x] One\nNote\n- [x] Two\n- [ ] Three\n", {
      label: "the run is all ticked; Three, outside it, is not",
    });
    await h.page.keyboard.press(`${MOD}+Enter`);
    await waitForFile(file, (t) => t === "- [ ] One\nNote\n- [ ] Two\n- [ ] Three\n", {
      label: "all ticked, so all unticked",
    });

    // Selected whole (Escape), the same.
    await h.page.keyboard.press("Escape");
    await h.page.keyboard.press(`${MOD}+Enter`);
    await waitForFile(file, (t) => t === "- [x] One\nNote\n- [x] Two\n- [ ] Three\n", {
      label: "a whole-block selection ticks too",
    });
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("with no to-do ⌘Enter is Enter", async () => {
  const h = await launchApp({ "Note.md": "Plain line\n" });
  const file = h.vault.file("Note.md");
  try {
    await h.openNote("Note");
    await line(h, "Plain line").click();
    await h.page.keyboard.press(START_OF_LINE);
    for (let i = 0; i < 5; i++) await h.page.keyboard.press("ArrowRight");
    await h.page.keyboard.press(`${MOD}+Enter`);
    await waitForFile(file, (t) => t.startsWith("Plain\n\n line\n"), { label: "split as Enter" });
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Format → Check Off shows ⌘Enter, is ticked on a done to-do, and runs the same", async () => {
  const h = await launchApp({ "List.md": "- [x] Done\nPlain\n" });
  const file = h.vault.file("List.md");
  try {
    const accelerator = await h.app.evaluate(
      ({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById("toggleTodo")?.accelerator,
    );
    expect(accelerator).toBe("CmdOrCtrl+Enter");
    await h.openNote("List");

    await line(h, "Plain").click();
    await expect.poll(() => menuEnabled(h, "toggleTodo")).toBe(false);

    await line(h, "Done").click();
    await expect.poll(() => menuEnabled(h, "toggleTodo")).toBe(true);
    await expect.poll(() => menuChecked(h, "toggleTodo")).toBe(true);
    await menuClick(h, "toggleTodo");
    await waitForFile(file, (t) => t === "- [ ] Done\nPlain\n", { label: "unticked by the menu" });
    await expect.poll(() => menuChecked(h, "toggleTodo")).toBe(false);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
