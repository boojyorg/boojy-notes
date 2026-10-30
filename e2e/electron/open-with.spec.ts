/**
 * A note opened from outside the app (electron/openRequests.ts): Finder's
 * Open With or a double-click (macOS `open-file`), a path given to the launch
 * (Windows and Linux), or to a second launch while the app runs
 * (`second-instance`). Each waits until the notes are read, opens as a click
 * on its row does, and switches storage location first when another holds it.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { type AppHandle, launchApp } from "./harness";

const title = (h: AppHandle) => h.page.getByRole("textbox", { name: "Note title" });
const openRow = (h: AppHandle) => h.page.getByRole("treeitem", { selected: true });
const toast = (h: AppHandle) => h.page.locator("[data-toast-kind]");

/** Finder's Open With, as macOS sends it to the running app. */
const openFile = (h: AppHandle, file: string) =>
  h.app.evaluate(({ app }, p) => {
    app.emit("open-file", { preventDefault() {} }, p);
  }, file);

/** A second launch with a path, as Windows and Linux hand it to the running app. */
const secondLaunch = (h: AppHandle, args: string[], cwd: string) =>
  h.app.evaluate(
    ({ app }, { args, cwd }) => {
      app.emit("second-instance", {}, ["boojy-notes", ...args], cwd);
    },
    { args, cwd },
  );

test("a path given to the launch opens that note, its folder opened in the sidebar", async () => {
  const h = await launchApp(
    { "Inbox.md": "Inbox.\n", "Ideas/Plan.md": "Plan.\n" },
    { openAtLaunch: ["vault/Ideas/Plan.md"] },
  );
  try {
    await expect(title(h)).toHaveText("Plan");
    await expect(openRow(h)).toHaveText(/Plan/);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Open With and a second launch open notes in the running app; the open note again changes nothing", async () => {
  const h = await launchApp({ "Inbox.md": "Inbox.\n", "Ideas/Plan.md": "Plan.\n" });
  try {
    await h.openNote("Inbox");
    await openFile(h, h.vault.file("Ideas/Plan.md"));
    await expect(title(h)).toHaveText("Plan");
    await expect(openRow(h)).toHaveText(/Plan/);

    // Relative to the directory the second launch ran in.
    await secondLaunch(h, ["Inbox.md"], h.vault.dir);
    await expect(title(h)).toHaveText("Inbox");

    // The note already open, asked for again (twice): still one editor on it.
    await openFile(h, h.vault.file("Inbox.md"));
    await openFile(h, h.vault.file("Inbox.md"));
    await expect(title(h)).toHaveText("Inbox");
    await expect(h.page.locator(".editor-scroll")).toHaveCount(1);
    await expect(toast(h)).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a note made a moment ago, before the watcher has met it, opens", async () => {
  const h = await launchApp({ "Inbox.md": "Inbox.\n" });
  try {
    await h.openNote("Inbox");
    // Written and asked for at once: inside the watcher's settling time.
    h.vault.write("Fresh.md", "Just made.\n");
    await openFile(h, h.vault.file("Fresh.md"));
    await expect(title(h)).toHaveText("Fresh");
    await expect(h.page.getByRole("treeitem").filter({ hasText: "Fresh" })).toHaveCount(1);
    await expect(toast(h)).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a note in another storage location switches to it, saving the open note's typing first", async () => {
  const h = await launchApp(
    { "Inbox.md": "Inbox.\n" },
    { otherVaults: { University: { "Week 1.md": "Lecture.\n" } } },
  );
  try {
    await h.openNote("Inbox");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press("End");
    await h.page.keyboard.type(" typed");
    // At once, inside the save's debounce: the switch must write it first.
    await openFile(h, path.join(h.root, "University", "Week 1.md"));
    await expect(title(h)).toHaveText("Week 1");
    await expect(h.page.getByTestId("vault-label")).toHaveText("University");
    expect(h.vault.read("Inbox.md")).toBe("Inbox. typed\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a file that is gone says so and opens nothing; one outside every location opens on its own", async () => {
  const h = await launchApp({ "Inbox.md": "Inbox.\n" });
  try {
    await h.openNote("Inbox");
    await openFile(h, h.vault.file("Gone.md"));
    await expect(toast(h)).toHaveText(`Couldn't open "Gone.md": it isn't there any more.`);
    await expect(title(h)).toHaveText("Inbox");

    // The rest of its life is outside-notes.spec.ts.
    const loose = path.join(h.root, "Loose.md");
    fs.writeFileSync(loose, "Loose.\n");
    await openFile(h, loose);
    await expect(title(h)).toHaveText("Loose");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
