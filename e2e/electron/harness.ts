/**
 * Real-Electron test harness.
 *
 * Launches the built desktop app (`dist/` + `dist-electron/`, so run `vite build`
 * first) against a throwaway vault and userData directory, and exposes the small
 * set of helpers the core-journey specs need. The point of this layer is to
 * prove behaviour that jsdom cannot see: the text-commit and write debounces,
 * IPC, the file watcher, the filesystem, and restarts.
 *
 * Assertions favour observable product truth: what the editor shows, what the
 * Markdown on disk says, which files exist. There is no test-only bridge into
 * React state; if an invariant cannot be proven from the outside, say so in the
 * spec rather than adding one.
 *
 * The app runs with its window hidden on a desktop (`BOOJY_TEST_HIDDEN=1`,
 * read by the main process), so a routine run never steals focus. Playwright
 * drives the renderer over CDP, which needs no OS focus, and the main process
 * turns off background throttling so debounces run at full speed. To watch a
 * run, set `BOOJY_TEST_HEADED=1` and the window is shown instead. Nothing in
 * the suite needs real OS focus, the system clipboard or native menus; a spec
 * that did would need its own project with a visible window, and would say so.
 *
 * On CI the window is always shown. There is no desktop to protect (xvfb is the
 * display), and a hidden window on the Linux runner produces no compositor
 * frames, so nothing on a requestAnimationFrame runs on its own: Playwright's
 * click and locator waits poll on exactly that, and every action stalled until
 * a stray frame arrived. Measured 2026-09-14 on the same 133 tests: hidden,
 * the suite took 672 s with tests that run in 1 s here taking 5–16 s; shown,
 * 267 s, each test within a beat of its local time. Keep it shown there.
 *
 * On a Linux CI runner each worker also gets an X display of its own
 * (`ownDisplay`). On one shared display, the window a worker launched came up
 * over the other worker's and took the display's single focus and pointer: the
 * other app saw a window blur, which cancels any drag in progress, and a real
 * mouseout, which ends any hover. That was most of the suite's flakes (drags
 * that never dropped, chips and hover controls that never showed; 2026-09-24,
 * 30 runs), and none of them reproduced on a Mac, where windows are separate.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  _electron,
  expect,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const isMac = process.platform === "darwin";

/** The platform's primary modifier, for shortcuts the app handles itself. */
export const MOD = isMac ? "Meta" : "Control";
/** Moves the caret to the end of the current line. */
export const END_OF_LINE = isMac ? "Meta+ArrowRight" : "End";
export const START_OF_LINE = isMac ? "Meta+ArrowLeft" : "Home";
/** Extend the selection one word left: Option on a Mac, Control elsewhere. */
export const SELECT_WORD_LEFT = isMac ? "Shift+Alt+ArrowLeft" : "Shift+Control+ArrowLeft";

/**
 * Longest quiet period after which every in-app debounce has fired: the 300ms
 * text commit, the 500ms write debounce, and the ~350ms watcher-echo window.
 */
export const SETTLE_MS = 1300;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Vault {
  dir: string;
  file(rel: string): string;
  read(rel: string): string;
  write(rel: string, content: string): void;
  exists(rel: string): boolean;
  /** File modification time in ms, the "most recently modified" truth. */
  mtimeMs(rel: string): number;
  /** Set a file's modification time, to seed a vault with a history. */
  setMtime(rel: string, ms: number): void;
  /** Every file under the vault, as vault-relative paths, sorted. */
  list(): string[];
}

function makeVault(dir: string): Vault {
  const walk = (d: string, prefix = ""): string[] =>
    fs
      .readdirSync(d, { withFileTypes: true })
      .flatMap((e) =>
        e.isDirectory()
          ? walk(path.join(d, e.name), `${prefix}${e.name}/`)
          : [`${prefix}${e.name}`],
      );
  return {
    dir,
    file: (rel) => path.join(dir, rel),
    read: (rel) => fs.readFileSync(path.join(dir, rel), "utf8"),
    write: (rel, content) => {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), content);
    },
    exists: (rel) => fs.existsSync(path.join(dir, rel)),
    mtimeMs: (rel) => fs.statSync(path.join(dir, rel)).mtimeMs,
    setMtime: (rel, ms) => fs.utimesSync(path.join(dir, rel), ms / 1000, ms / 1000),
    list: () => walk(dir).sort(),
  };
}

export interface AppHandle {
  app: ElectronApplication;
  page: Page;
  vault: Vault;
  userData: string;
  /** The Documents directory the app was given (`firstRun`), where its default folder goes. */
  documents: string;
  /** Console errors and uncaught page errors seen since launch. */
  pageErrors: string[];
  /** Click a note row in the sidebar by its visible title. */
  openNote(title: string): Promise<void>;
  /**
   * Quit the way the user does (Cmd+Q): the main process holds the window
   * close until the renderer has flushed pending edits, then exits.
   */
  quit(): Promise<void>;
  /** Quit and relaunch against the same vault and userData, like the user restarting. */
  restart(): Promise<void>;
  /** Quit (if still running) and delete the temp dirs. */
  close(): Promise<void>;
}

let display: Promise<string> | undefined;

/**
 * This worker's own Xvfb display, started on first use and stopped when the
 * worker exits; `undefined` off a Linux CI runner, where the app uses whatever
 * display it inherits. `-displayfd` lets Xvfb pick a free display number and
 * report it, so two workers (or a worker restarted after a failure) never race
 * for the same one. Tests in a worker run one at a time, so its display only
 * ever holds one window.
 */
function ownDisplay(): Promise<string> | undefined {
  if (process.platform !== "linux" || !process.env.CI) return undefined;
  display ??= new Promise((resolve, reject) => {
    const xvfb = spawn(
      "Xvfb",
      ["-displayfd", "3", "-screen", "0", "1280x1024x24", "-nolisten", "tcp"],
      { stdio: ["ignore", "ignore", "inherit", "pipe"] },
    );
    let out = "";
    xvfb.stdio[3]!.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      if (out.includes("\n")) resolve(`:${out.trim()}`);
    });
    xvfb.on("error", reject);
    xvfb.on("exit", (code) => reject(new Error(`Xvfb exited with ${code} before it was ready`)));
    process.on("exit", () => xvfb.kill());
  });
  return display;
}

async function launchElectron(userData: string, documents?: string) {
  const displayEnv = await ownDisplay();
  const app = await _electron.launch({
    args: [
      path.join(here, "main-wrapper.mjs"),
      // Chromium's sandbox is unavailable on some CI containers.
      ...(process.env.CI ? ["--no-sandbox"] : []),
    ],
    cwd: repoRoot,
    env: {
      ...process.env,
      ...(displayEnv ? { DISPLAY: displayEnv } : {}),
      BOOJY_TEST_USERDATA: userData,
      ...(documents ? { BOOJY_TEST_DOCUMENTS: documents } : {}),
      BOOJY_TEST_HIDDEN: process.env.BOOJY_TEST_HEADED === "1" || process.env.CI ? "0" : "1",
    },
  });
  const page = await app.firstWindow();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("Electron Security Warning"))
      pageErrors.push(`console.error: ${m.text()}`);
  });
  try {
    await page.waitForLoadState("domcontentloaded");
    // The sidebar renders once the vault has been read.
    await page.getByRole("button", { name: "New note", exact: true }).waitFor();
  } catch (err) {
    // Don't leave a hidden app process behind when the launch itself failed.
    await app.close().catch(() => {});
    throw err;
  }
  return { app, page, pageErrors };
}

/**
 * Launch the app against a fresh vault seeded with `files` (vault-relative path →
 * Markdown). Each call gets its own userData, so no theme, sort mode or
 * last-open note leaks between tests.
 */
export async function launchApp(
  files: Record<string, string> = {},
  {
    prepare,
    vaultDir: vaultRel = "vault",
    createVault = true,
    firstRun = false,
    defaultFolderExists = false,
  }: {
    prepare?: (vault: Vault) => void;
    /** Where the vault sits under the temp root; a dot-segment makes a hidden parent. */
    vaultDir?: string;
    /** `false` points the config at a vault that does not exist, as an unmounted volume does. */
    createVault?: boolean;
    /**
     * No config at all, as a fresh install has: the app names its default
     * folder under a temp Documents (`handle.documents`) and shows setup.
     * `vault` then points at that default folder; `files` seed it only with
     * `defaultFolderExists`, which is an existing user who never chose.
     */
    firstRun?: boolean;
    defaultFolderExists?: boolean;
  } = {},
): Promise<AppHandle> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-e2e-"));
  const documents = path.join(root, "Documents");
  const vaultDir = firstRun ? path.join(documents, "Boojy", "Notes") : path.join(root, vaultRel);
  const userData = path.join(root, "userData");
  if (firstRun) {
    fs.mkdirSync(documents, { recursive: true });
    if (defaultFolderExists) fs.mkdirSync(vaultDir, { recursive: true });
    else if (Object.keys(files).length > 0)
      throw new Error("firstRun takes files only with defaultFolderExists");
  } else if (createVault) fs.mkdirSync(vaultDir, { recursive: true });
  else if (Object.keys(files).length > 0) throw new Error("createVault: false takes no files");
  fs.mkdirSync(userData, { recursive: true });
  const vault = makeVault(vaultDir);
  for (const [rel, content] of Object.entries(files)) vault.write(rel, content);
  prepare?.(vault);
  if (!firstRun)
    fs.writeFileSync(path.join(userData, "config.json"), JSON.stringify({ notesDir: vaultDir }));
  // Keep the test offline: no update check against GitHub.
  fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ autoUpdate: false }));

  const handle = { vault, userData, documents } as AppHandle;
  const attach = (launched: Awaited<ReturnType<typeof launchElectron>>) => {
    handle.app = launched.app;
    handle.page = launched.page;
    handle.pageErrors = launched.pageErrors;
  };
  attach(await launchElectron(userData, firstRun ? documents : undefined));

  handle.openNote = async (title) => {
    // Rows are buttons whose accessible name also carries the ··· menu label,
    // so match on visible text rather than the role name.
    await handle.page.locator('[role="treeitem"]').filter({ hasText: title }).first().click();
    await handle.page.getByRole("textbox", { name: "Note title" }).waitFor();
  };
  let running = true;
  handle.quit = async () => {
    if (!running) return;
    running = false;
    const exited = handle.app.waitForEvent("close");
    await handle.app.evaluate(({ app }) => app.quit());
    await exited;
  };
  handle.restart = async () => {
    await handle.quit();
    attach(await launchElectron(userData, firstRun ? documents : undefined));
    running = true;
  };
  handle.close = async () => {
    try {
      await handle.quit();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
  return handle;
}

/**
 * Poll a file until `predicate` accepts its content. Throws with the last
 * content seen on timeout, which is more useful than a bare timeout when a
 * write went missing.
 */
/**
 * Click an application-menu item by its id (electron/appMenu.ts), the path a
 * pointer takes. A real keypress reaching a menu accelerator cannot be sent to
 * a hidden window, so this is how a spec uses the menu bar.
 */
export function menuClick(h: AppHandle, id: string) {
  return h.app.evaluate(({ Menu }, id) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(id);
    if (!item) throw new Error(`no menu item ${id}`);
    item.click();
  }, id);
}

/** Whether an application-menu item is enabled; null when there is no such item. */
export function menuEnabled(h: AppHandle, id: string) {
  return h.app.evaluate(
    ({ Menu }, id) => Menu.getApplicationMenu()?.getMenuItemById(id)?.enabled ?? null,
    id,
  );
}

export async function waitForFile(
  file: string,
  predicate: (content: string) => boolean,
  { timeout = 4000, label = "file to settle" } = {},
): Promise<string> {
  const deadline = Date.now() + timeout;
  let last: string | undefined;
  while (Date.now() < deadline) {
    last = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
    if (last !== undefined && predicate(last)) return last;
    await sleep(50);
  }
  throw new Error(
    `Timed out waiting for ${label} (${path.basename(file)}); last content: ${JSON.stringify(last)}`,
  );
}

/**
 * The editor's blocks as the user reads them, one line per block. The
 * zero-width space the editor parks the caret on after a link has no glyph
 * and never reaches Markdown, so it is not part of what the user reads.
 */
/** The app ground's colour (`BG.darkest`): Light `rgb(252, 252, 252)`, Dark `rgb(28, 28, 28)`. */
export async function appGround(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="app-ground"]');
    return el ? getComputedStyle(el).backgroundColor : "";
  });
}

export async function editorText(page: Page): Promise<string> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-block-id]"))
      // An empty block holds a <br> for the caret, whose innerText is "\n".
      .map((b) => (b as HTMLElement).innerText.replace(/\n$/, "").replace(/\u200B/g, ""))
      .join("\n"),
  );
}

const trimTrailingNewlines = (s: string) => s.replace(/\n+$/, "");

/**
 * `editorText` with trailing empty blocks ignored. A file that ends in a newline
 * parses to a trailing empty block, which is real on screen but is not part of
 * what a test usually means by "the note says X".
 */
export async function noteText(page: Page): Promise<string> {
  return trimTrailingNewlines(await editorText(page));
}

/**
 * The core cross-layer invariant, for notes made only of plain paragraphs:
 * once everything has settled, what the user sees and what the Markdown file
 * says must be the same note. Plain paragraphs are used deliberately, because
 * their on-screen text and their Markdown are identical, so the comparison
 * needs no converter of its own. Formatted blocks need a different oracle.
 */
export async function expectNoteMatchesDisk(page: Page, vault: Vault, rel: string) {
  await sleep(SETTLE_MS);
  const seen = trimTrailingNewlines(await editorText(page));
  const persisted = trimTrailingNewlines(vault.read(rel));
  expect(seen, `editor text vs ${rel} on disk`).toBe(persisted);
}

/** A crashed or interrupted atomic write leaves `.<name>.tmp` behind. */
export function expectNoTempFiles(vault: Vault) {
  const stray = vault.list().filter((f) => /(^|\/)\..*\.tmp$/.test(f));
  expect(stray, "leftover temp files in the vault").toEqual([]);
}

/**
 * Titles of the root notes, top to bottom, as the user reads them. One tree
 * holds folders (each wrapped in a block) and then the root notes as direct
 * children, so `:scope >` picks the root notes alone.
 */
export async function rootNoteOrder(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const tree = document.querySelector('[role="tree"]');
    return Array.from(tree?.querySelectorAll(":scope > [data-note-id]") ?? []).map((row) =>
      (row as HTMLElement).innerText.trim(),
    );
  });
}

/**
 * Rename a sidebar row the way the user does: a note by double-click, a
 * folder from its ··· menu (folders have no double-click rename since
 * 2026-09-16: the first click toggled the folder under the field); then
 * type and Enter.
 */
export async function renameRow(page: Page, title: string, newName: string) {
  const row = page.locator('[role="treeitem"]').filter({ hasText: title }).first();
  if ((await row.getAttribute("data-folder-path")) !== null) {
    await row.hover();
    await row.locator("[title='Folder actions']").click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
  } else {
    await row.dblclick();
  }
  const input = page.locator("input:focus");
  await input.waitFor();
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.type(newName);
  await page.keyboard.press("Enter");
}

/**
 * Move a note into a folder the way the user does: press on its row, carry it
 * over the folder row (the pill lifts once the press has moved 5px), release. Drag never
 * opens the note, so the editor is untouched afterwards.
 */
export async function moveNoteToFolder(page: Page, title: string, folder: string | null) {
  const row = page.locator("[data-note-id]").filter({ hasText: title }).first();
  const target =
    folder === null
      ? page.locator("[data-drop-root]").first()
      : page.locator(`[data-folder-path="${folder}"]`).first();
  const from = await settledRowBox(page, row, "data-note-id");
  const to = await target.boundingBox();
  if (!from || !to) throw new Error(`moveNoteToFolder: row or folder "${folder}" not visible`);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await sleep(100);
  await page.mouse.up();
}

/**
 * The row's box once the row is really under its own centre: expanding a
 * folder slides the rows below into place over ~300ms, and a press during the
 * slide lands on whichever row is passing under the pointer at that instant.
 */
async function settledRowBox(page: Page, row: Locator, attr: string) {
  const expected = await row.getAttribute(attr);
  for (let i = 0; i < 30; i++) {
    const box = await row.boundingBox();
    if (box) {
      const under = await page.evaluate(
        ([x, y, a]) => document.elementFromPoint(x, y)?.closest(`[${a}]`)?.getAttribute(a) ?? null,
        [box.x + box.width / 2, box.y + box.height / 2, attr] as const,
      );
      if (under === expected) {
        await sleep(100);
        const again = await row.boundingBox();
        if (again && again.y === box.y) return again;
      }
    }
    await sleep(100);
  }
  return row.boundingBox();
}

/**
 * Drag a folder row onto another folder row (`target` a folder path) or onto
 * the root drop target (`target` null, the vault header). Folders are
 * directories, so the drop is one directory move on disk.
 */
export async function moveFolderTo(page: Page, folder: string, target: string | null) {
  const row = page.locator(`[data-folder-path="${folder}"]`).first();
  const dest =
    target === null
      ? page.locator("[data-drop-root]").first()
      : page.locator(`[data-folder-path="${target}"]`).first();
  const from = await settledRowBox(page, row, "data-folder-path");
  const to = await dest.boundingBox();
  if (!from || !to) throw new Error(`moveFolderTo: "${folder}" or its target is not visible`);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await sleep(100);
  await page.mouse.up();
}

/**
 * Expand every collapsed folder row so each note row is on screen, and wait
 * for the rows to stop moving: expansion slides the rows below into place
 * over ~300ms, and a drag started meanwhile picks up whichever row is under
 * the pointer at that instant.
 */
export async function expandAllFolders(page: Page) {
  const collapsed = page.locator('[data-folder-path][aria-expanded="false"]');
  for (let i = 0; (await collapsed.count()) > 0; i++) {
    if (i >= 20) {
      const left = await collapsed.evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-folder-path")),
      );
      throw new Error(
        `expandAllFolders: still collapsed after ${i} clicks: ${JSON.stringify(left)}`,
      );
    }
    await collapsed.first().click();
  }
  await sleep(350);
  const rowTops = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("[data-note-id], [data-folder-path]")].map((el) =>
        Math.round(el.getBoundingClientRect().top),
      ),
    );
  let before = await rowTops();
  for (let i = 0; i < 20; i++) {
    await sleep(100);
    const after = await rowTops();
    if (after.length === before.length && after.every((t, k) => t === before[k])) return;
    before = after;
  }
}

/** Titles of every note row on screen, in tree order, as the user reads them. */
export async function sidebarNoteTitles(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-note-id]")).map((row) =>
      (row as HTMLElement).innerText.trim(),
    ),
  );
}

/** What the editor's title field shows for the open note. */
export async function editorTitle(page: Page): Promise<string> {
  return page.getByRole("textbox", { name: "Note title" }).innerText();
}

/**
 * The title/filename invariant: for every persisted note, the title the
 * sidebar shows is the basename of its Markdown file. Compares the two sets
 * as sorted lists, so a note shown under one name while the file carries
 * another fails with both names in the diff. Folders are expanded first so
 * every row is rendered; a draft never has a file and never has a row here.
 */
export async function expectTitlesMatchFiles(page: Page, vault: Vault) {
  await expandAllFolders(page);
  const files = vault
    .list()
    .filter((f) => f.endsWith(".md") && !path.basename(f).startsWith("."))
    .map((f) => path.basename(f, ".md"))
    .sort();
  await expect
    .poll(async () => (await sidebarNoteTitles(page)).sort(), {
      message: "sidebar titles vs Markdown basenames on disk",
    })
    .toEqual(files);
}

/**
 * Drag files over (x, y) in the renderer and release them there, as a drag
 * from Finder arrives: a DragEvent carrying a DataTransfer of Files, which
 * runs the app's own handlers (the OS drag session in front of them is
 * Chromium's). Answers whether the drag was accepted and where the drop
 * marker stood while it was held.
 */
export function dropFiles(
  page: Page,
  files: { name: string; bytes: Buffer }[],
  x: number,
  y: number,
) {
  return page.evaluate(
    ({ files, x, y }) => {
      const data = new DataTransfer();
      for (const { name, b64 } of files) {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        data.items.add(new File([bytes], name, { type: "image/png" }));
      }
      const target = document.elementFromPoint(x, y);
      if (!target) throw new Error(`nothing at ${x},${y}`);
      const fire = (type: string) =>
        target.dispatchEvent(
          new DragEvent(type, {
            dataTransfer: data,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          }),
        );
      fire("dragenter");
      const accepted = !fire("dragover");
      const marker = document.querySelector(".block-drop-marker");
      const markerTop = marker ? marker.getBoundingClientRect().top : null;
      fire("drop");
      return { accepted, markerTop, markerGone: !document.querySelector(".block-drop-marker") };
    },
    { files: files.map((f) => ({ name: f.name, b64: f.bytes.toString("base64") })), x, y },
  );
}
