import { expect, test } from "@playwright/test";
import { launchApp, SETTLE_MS, sleep, waitForFile } from "./harness";

/**
 * Adding properties. `/properties` makes the section at the top of a note that
 * has none and opens Add property; a name of one's own takes a type, and the
 * type of a value left empty is remembered on this device, through a restart.
 * A picker closed with nothing chosen leaves no section behind.
 */

const BODY = "First line.\n\nSecond line.\n";
const row = (key: string) => `.props-row[data-key="${key}"]`;

/** `/prop` typed on a new line under the first, chosen from the slash menu. */
async function slashProperties(h: Awaited<ReturnType<typeof launchApp>>) {
  await h.page.locator("[data-block-type='p']").first().click();
  await h.page.keyboard.press("Meta+ArrowRight");
  await h.page.keyboard.press("Enter");
  await h.page.keyboard.type("/prop");
  await expect(h.page.getByRole("option", { name: /Properties/ })).toBeVisible();
  await h.page.keyboard.press("Enter");
  await expect(h.page.getByTestId("property-picker")).toBeVisible();
}

test("/properties adds the section and a property of one's own; an empty one keeps its type", async () => {
  const h = await launchApp({ "Film.md": BODY });
  const file = h.vault.file("Film.md");
  try {
    await h.openNote("Film");
    await slashProperties(h);
    await h.page.keyboard.type("mood");
    await h.page.keyboard.press("Enter");
    await h.page.keyboard.press("ArrowDown");
    await h.page.keyboard.press("ArrowDown");
    await h.page.keyboard.press("Enter");
    await expect(h.page.locator(`${row("mood")} .props-input`)).toBeFocused();
    await h.page.keyboard.press("Escape");
    await waitForFile(
      file,
      (t) => t.startsWith("---\nmood:\n---\n") && t.includes("Second line."),
      {
        label: "the section at the top, mood empty",
      },
    );

    await h.restart();
    await h.openNote("Film");
    await expect(h.page.locator(`${row("mood")} .props-icon`)).toHaveAttribute(
      "aria-label",
      /mood: Number/,
    );

    await h.page.locator(`${row("mood")} .props-val`).click();
    await h.page.keyboard.type("4a");
    await h.page.keyboard.press("Enter");
    await waitForFile(file, (t) => t.startsWith("---\nmood: 4\n---\n"), {
      label: "the number written",
    });
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Add property in a section that has some adds after them; Escape adds nothing", async () => {
  const NOTE = `---\ntitle: A # kept\n---\n${BODY}`;
  const h = await launchApp({ "Film.md": NOTE, "Plain.md": BODY });
  const file = h.vault.file("Film.md");
  try {
    await h.openNote("Film");
    await h.page.locator(".props").hover();
    await h.page.getByRole("button", { name: "Add property" }).click();
    await h.page.keyboard.type("seen");
    await h.page.keyboard.press("Enter");
    await h.page.getByRole("option", { name: "Checkbox" }).click();
    await waitForFile(file, (t) => t === `---\ntitle: A # kept\nseen: false\n---\n${BODY}`, {
      label: "the box added last, unticked",
    });

    await h.openNote("Plain");
    await slashProperties(h);
    await h.page.keyboard.press("Escape");
    await expect(h.page.locator(".props")).toHaveCount(0);
    // The caret is back on the line the command was typed on: typing goes on there.
    await h.page.keyboard.type("Typed after.");
    await waitForFile(h.vault.file("Plain.md"), (t) => t.includes("Typed after."), {
      label: "the keys typed after Escape reach the note",
    });
    await sleep(SETTLE_MS);
    expect(h.vault.read("Plain.md")).not.toContain("---");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
