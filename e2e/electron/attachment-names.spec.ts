/**
 * An image loads whatever its filename holds.
 *
 * Reproduces a bug reported on 2026-09-23: an image whose name held a space
 * (`Screenshot 2026-09-23 at 10.12.33.png`, macOS's own naming) drew "Image
 * not found", while a pasted one (`paste-<timestamp>.png`) loaded. The
 * renderer loaded `boojy-att://<name>` with the name raw, so Chromium read it
 * as the URL's host, refused the space and never asked the protocol handler;
 * a `%` did reach it and threw in `decodeURIComponent`. Needs the real app:
 * the failure is Chromium's URL parser in front of the main process's
 * protocol, which no other layer has.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { launchApp, waitForFile } from "./harness";

// A 1x1 PNG, so a block that loads has a real picture.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG = Buffer.from(PNG_B64, "base64");

const SCREENSHOT = "Screenshot 2026-09-23 at 10.12.33.png";
const NAMES = [SCREENSHOT, "100% done.png", "Café menu.png", "plain.png"];

type Page = import("@playwright/test").Page;

/** Each image block's picture: whether it loaded, by the name it asked for. */
const imageStates = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-block-type="image"]')].map((root) => {
      const img = root.querySelector("img");
      return img ? (img.complete && img.naturalWidth > 0 ? "loaded" : "pending") : "not found";
    }),
  );

test("images with spaces, a percent sign or an accent in their names load", async () => {
  const h = await launchApp(
    { "Pics.md": `One\n${NAMES.map((n) => `![[${n}]]`).join("\n")}\nTwo\n` },
    {
      prepare: (vault) => {
        fs.mkdirSync(vault.file("attachments"), { recursive: true });
        for (const name of NAMES) fs.writeFileSync(vault.file(`attachments/${name}`), PNG);
      },
    },
  );
  try {
    await h.openNote("Pics");
    await expect(h.page.locator('[data-block-type="image"]')).toHaveCount(NAMES.length);
    // Before: the first three drew "Image not found"; only plain.png loaded.
    await expect.poll(() => imageStates(h.page)).toEqual(NAMES.map(() => "loaded"));
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the attachment protocol serves nothing outside the vault", async () => {
  const h = await launchApp(
    { "Pics.md": "One\n" },
    {
      prepare: (vault) => {
        fs.writeFileSync(vault.file("../outside.png"), PNG);
        fs.mkdirSync(vault.file("attachments"), { recursive: true });
        fs.writeFileSync(vault.file("attachments/inside.png"), PNG);
      },
    },
  );
  try {
    await h.openNote("Pics");
    const load = (url: string) =>
      h.page.evaluate(
        (src) =>
          new Promise<string>((resolve) => {
            const img = new Image();
            img.onload = () => resolve("loaded");
            img.onerror = () => resolve("refused");
            img.src = src;
          }),
        url,
      );
    expect(await load("boojy-att://vault/inside.png")).toBe("loaded");
    // An encoded `../` survives URL normalisation and is decoded by the
    // handler, so it is the containment check that refuses it.
    expect(await load("boojy-att://vault/..%2Foutside.png")).toBe("refused");
    expect(await load("boojy-att://vault/..%2F..%2Foutside.png")).toBe("refused");
    expect(await load("boojy-att://vault/%E0%A4%A.png")).toBe("refused");
  } finally {
    await h.close();
  }
});

test("an image file pasted with a space in its name is saved under that name and shown", async () => {
  const h = await launchApp({ "Pics.md": "One\nTwo\n" });
  try {
    await h.openNote("Pics");
    const one = h.page.locator('[data-block-type="p"]', { hasText: "One" });
    await one.click();
    await h.page.keyboard.press("End");

    // A file on the clipboard, as Finder's Copy of a screenshot puts one there.
    await h.page.evaluate(
      ({ b64, name }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const data = new DataTransfer();
        data.items.add(new File([bytes], name, { type: "image/png" }));
        const target = document.getSelection()?.anchorNode?.parentElement ?? document.body;
        target.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
        );
      },
      { b64: PNG_B64, name: SCREENSHOT },
    );

    await waitForFile(h.vault.file("Pics.md"), (t) => t.includes(`![[${SCREENSHOT}`), {
      label: "the pasted image's embed to be written",
    });
    expect(fs.readFileSync(h.vault.file(`attachments/${SCREENSHOT}`))).toEqual(PNG);
    // Before: the file and the embed were right and the block drew "Image not found".
    await expect.poll(() => imageStates(h.page)).toEqual(["loaded"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
