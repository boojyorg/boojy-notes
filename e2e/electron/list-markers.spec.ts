/**
 * Every list kind shares one marker column: a bullet's dot centres where a
 * task's box does, every kind's text starts at the same x, and a nested
 * item's marker stands under its parent's text.
 */
import { expect, test } from "@playwright/test";
import { launchApp } from "./harness";

test("bullets, tasks and numbers line up: markers centred, text at one x", async () => {
  const h = await launchApp({
    "Lists.md": `- Bullet\n  - Nested bullet\n- [ ] Task\n  - [ ] Nested task\n\n${Array.from({ length: 10 }, (_, i) => `${i + 1}. Numbered`).join("\n")}\n`,
  });
  try {
    await h.openNote("Lists");
    const rows = await h.page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("[data-block-type]")]
        .filter((b) => ["bullet", "checkbox", "numbered"].includes(b.dataset.blockType!))
        .map((b) => {
          const marker = (b.querySelector(".checkbox-hit") ?? b.firstElementChild)!;
          const m = marker.getBoundingClientRect();
          const t = b.lastElementChild!.getBoundingClientRect();
          return {
            kind: b.dataset.blockType,
            centre: m.left + m.width / 2,
            right: m.right,
            text: t.left,
          };
        }),
    );
    const [bullet, nestedBullet, task, nestedTask, numbered] = rows;
    const tenth = rows[13];
    expect(bullet.centre).toBeCloseTo(task.centre, 0);
    expect(nestedBullet.centre).toBeCloseTo(nestedTask.centre, 0);
    expect(task.text).toBeCloseTo(bullet.text, 0);
    expect(numbered.text).toBeCloseTo(bullet.text, 0);
    expect(numbered.right).toBeCloseTo(task.right, 0);
    // A two-digit number hangs left of the column; its text stays put.
    expect(tenth.text).toBeCloseTo(numbered.text, 0);
    expect(tenth.right).toBeCloseTo(numbered.right, 0);
    // ...and is drawn whole, not cut at the row's edge.
    expect(
      await h.page.evaluate(() => {
        const row = [...document.querySelectorAll<HTMLElement>("[data-block-type=numbered]")][9];
        return getComputedStyle(row).contain;
      }),
    ).not.toMatch(/paint|content|strict/);
    // One level in, the marker column starts where the parent's text does.
    expect(nestedTask.centre - 8).toBeCloseTo(task.text, 0);
  } finally {
    await h.close();
  }
});
