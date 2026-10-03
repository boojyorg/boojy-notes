/**
 * Copy (the ··· menus, File → Copy Note, ⇧⌘C): the whole note as its
 * Markdown, the file's own spelling, on the OS clipboard, with HTML beside it
 * for apps that take formatting. The clipboard is the machine's, so it is
 * saved before and put back after.
 */
import { expect, test } from "@playwright/test";
import { type AppHandle, launchApp, menuClick, MOD } from "./harness";

const NOTE = "# Plan\n\nSome **bold** words.\n\n- one\n- two\n";
let h: AppHandle;
let saved = "";

test.describe.configure({ mode: "default" });
test.beforeEach(async () => {
  h = await launchApp({ "Plan.md": NOTE });
  saved = await h.app.evaluate(({ clipboard }) => clipboard.readText());
  await h.app.evaluate(({ clipboard }) => clipboard.writeText("before"));
  await h.openNote("Plan");
});
test.afterEach(async () => {
  await h?.app.evaluate(({ clipboard }, t) => clipboard.writeText(t), saved);
  await h?.close();
});

/** The clipboard's text and HTML (Electron's clipboard is the W3C one). */
const clip = () =>
  h.app.evaluate(async ({ clipboard }) => {
    const [item] = await clipboard.read();
    const read = async (type: string) =>
      item?.types.includes(type) ? await ((await item.getType(type)) as Blob).text() : "";
    return { text: await read("text/plain"), html: await read("text/html") };
  });

test("the header's ··· → Copy puts the note's Markdown on the clipboard, and says so", async () => {
  await h.page.locator("button[aria-label='Note actions']").click();
  await h.page.getByRole("menuitem", { name: /^Copy/ }).click();
  await expect.poll(async () => (await clip()).text).toBe(NOTE);
  expect((await clip()).html).toContain("<strong>bold</strong>");
  await expect(h.page.getByText("Copied to clipboard")).toBeVisible();
});

test("File → Copy Note copies the open note too", async () => {
  await menuClick(h, "copyText");
  await expect.poll(async () => (await clip()).text).toContain("# Plan");
});

test("⇧⌘C copies the open note, ⇧⌘D duplicates it", async () => {
  await h.page.locator("[data-editor] [data-block-id]").first().click();
  await h.page.keyboard.press(`${MOD}+Shift+c`);
  await expect.poll(async () => (await clip()).text).toBe(NOTE);
  await h.page.keyboard.press(`${MOD}+Shift+d`);
  // The copy opens under the original's name, selected whole; the file takes
  // the clash rule's name, and the field adopts it once left.
  await expect(h.page.getByText("Duplicated Plan")).toBeVisible();
  await expect(h.page.locator("[data-title]")).toBeFocused();
  expect(await h.page.evaluate(() => getSelection()?.toString())).toBe("Plan");
  await expect.poll(() => h.vault.exists("Plan-2.md")).toBe(true);
  await h.page.locator("[data-editor] [data-block-id]").first().click();
  await expect(h.page.locator("[data-title]")).toHaveText("Plan-2");
});
