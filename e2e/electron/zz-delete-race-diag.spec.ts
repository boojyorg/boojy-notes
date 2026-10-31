/**
 * TEMPORARY DIAGNOSTIC — never merge. The Windows failure on #442: a note
 * deleted outside while another is open, and the open one's file then held the
 * deleted note's text. Repeats that scenario with BOOJY_TRACE on, and attaches
 * the trace of any run that goes wrong.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { END_OF_LINE, SETTLE_MS, launchApp, sleep } from "./harness";

test.setTimeout(600_000);

test("diag: another note deleted outside, repeated with tracing", async ({}, testInfo) => {
  const bad: string[] = [];
  for (let i = 0; i < 25; i++) {
    const trace = testInfo.outputPath(`trace-${i}.log`);
    process.env.BOOJY_TRACE = trace;
    const h = await launchApp({ "Essay.md": "First.\n\nSecond.\n", "Other.md": "Other.\n" });
    let essay = "";
    try {
      await h.openNote("Essay");
      await h.page.locator("[data-block-id]").nth(1).click();
      await h.page.keyboard.press(END_OF_LINE);
      await sleep(SETTLE_MS);
      fs.unlinkSync(h.vault.file("Other.md"));
      await expect(h.page.locator('[role="treeitem"]').filter({ hasText: "Other" })).toHaveCount(
        0,
        { timeout: 5_000 },
      );
      await h.page.keyboard.type(" typed");
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        essay = fs.existsSync(h.vault.file("Essay.md")) ? h.vault.read("Essay.md") : "<gone>";
        if (essay.includes("typed")) break;
        await sleep(50);
      }
      await sleep(SETTLE_MS);
      essay = fs.existsSync(h.vault.file("Essay.md")) ? h.vault.read("Essay.md") : "<gone>";
    } finally {
      await h.close();
      delete process.env.BOOJY_TRACE;
    }
    process.stderr.write(`DELETE-DIAG ${process.platform} run ${i}: ${JSON.stringify(essay)}\n`);
    if (essay !== "First.\n\nSecond. typed\n") {
      bad.push(`run ${i}: ${JSON.stringify(essay)}`);
      if (fs.existsSync(trace))
        await testInfo.attach(`trace-${i}`, { path: trace, contentType: "text/plain" });
    }
  }
  expect(bad).toEqual([]);
});
