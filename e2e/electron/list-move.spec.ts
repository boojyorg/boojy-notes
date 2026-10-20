import { expect, test } from "@playwright/test";
import { END_OF_LINE, launchApp, MOD, SETTLE_MS, sleep, waitForFile } from "./harness";

/**
 * Cmd+Shift+Up/Down moves a list item with the items nested under it, past
 * its neighbour's whole group, so no item changes parent; a nested item moves
 * among its siblings only. Before this the key moved one line: the item's
 * children were left under the item that took its place.
 */

const LIST = "Intro\n\n- Apple\n  - a1\n  - a2\n- Banana\n  - b1\n";

test("Cmd+Shift+Arrow carries a list item's nested items and keeps every parent", async () => {
  const h = await launchApp({ "List.md": LIST });
  const file = h.vault.file("List.md");
  const item = (text: string) => h.page.locator("[data-block-id]").filter({ hasText: text });
  try {
    await h.openNote("List");

    // Typed and moved at once: the words still waiting to be committed go
    // with the item, and the file shows the new order.
    await item("Apple").click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" pie");
    await h.page.keyboard.press(`${MOD}+Shift+ArrowDown`);
    await waitForFile(
      file,
      (t) => t === "Intro\n\n- Banana\n  - b1\n- Apple pie\n  - a1\n  - a2\n",
      {
        label: "Apple and its items moved below Banana and its item",
      },
    );

    // The caret stayed on its character: the next letter lands after "pie".
    await h.page.keyboard.type("!");
    await waitForFile(file, (t) => t.includes("- Apple pie!\n  - a1\n"), {
      label: "typing carries on where the caret was",
    });

    // Undo takes the typing back, then the whole move in one step.
    await h.page.keyboard.press(`${MOD}+z`);
    await h.page.keyboard.press(`${MOD}+z`);
    await waitForFile(
      file,
      (t) => t === "Intro\n\n- Apple pie\n  - a1\n  - a2\n- Banana\n  - b1\n",
      {
        label: "one undo puts the group back",
      },
    );

    // A nested item stays under its parent: up from the first child is
    // refused, down swaps it with its sibling.
    await item("a1").click();
    await h.page.keyboard.press(`${MOD}+Shift+ArrowUp`);
    await sleep(SETTLE_MS);
    expect(h.vault.read("List.md")).toBe(
      "Intro\n\n- Apple pie\n  - a1\n  - a2\n- Banana\n  - b1\n",
    );
    await h.page.keyboard.press(`${MOD}+Shift+ArrowDown`);
    await waitForFile(
      file,
      (t) => t === "Intro\n\n- Apple pie\n  - a2\n  - a1\n- Banana\n  - b1\n",
      {
        label: "a1 swapped with a2 under Apple",
      },
    );

    // A paragraph passes a whole group, never landing inside it.
    await item("Intro").click();
    await h.page.keyboard.press(`${MOD}+Shift+ArrowDown`);
    const lines = (
      await waitForFile(file, (t) => !t.startsWith("Intro"), {
        label: "Intro moved down",
      })
    )
      .split("\n")
      .filter(Boolean);
    expect(lines).toEqual(["- Apple pie", "  - a2", "  - a1", "Intro", "- Banana", "  - b1"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("Cmd+Shift+Arrow moves one selected block with its items, and a longer selection not at all", async () => {
  const h = await launchApp({ "List.md": LIST });
  const file = h.vault.file("List.md");
  const item = (text: string) => h.page.locator("[data-block-id]").filter({ hasText: text });
  try {
    await h.openNote("List");
    await item("Banana").click();
    await h.page.keyboard.press("Escape"); // selects Banana, b1 with it
    await h.page.keyboard.press(`${MOD}+Shift+ArrowUp`);
    await waitForFile(file, (t) => t === "Intro\n\n- Banana\n  - b1\n- Apple\n  - a1\n  - a2\n", {
      label: "the selected Banana group moved above Apple",
    });

    // Grown to two items, the run would leave a block behind: nothing moves.
    await h.page.keyboard.press("Shift+ArrowDown");
    await h.page.keyboard.press(`${MOD}+Shift+ArrowDown`);
    await sleep(SETTLE_MS);
    expect(h.vault.read("List.md")).toBe("Intro\n\n- Banana\n  - b1\n- Apple\n  - a1\n  - a2\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
