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
 * The app runs with its window hidden by default (`BOOJY_TEST_HIDDEN=1`, read
 * by the main process), so a routine run never steals focus. Playwright drives
 * the renderer over CDP, which needs no OS focus, and the main process turns
 * off background throttling so debounces run at full speed. A test that
 * genuinely needs the foreground — real OS focus, the system clipboard through
 * Cmd+V, native menus or dialogs — goes in a `*.headed.spec.ts` file and runs
 * through `pnpm test:electron:headed`, which sets `BOOJY_TEST_HEADED=1`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, expect, type ElectronApplication, type Page } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const isMac = process.platform === "darwin";

/** The platform's primary modifier, for shortcuts the app handles itself. */
export const MOD = isMac ? "Meta" : "Control";
/** Moves the caret to the end of the current line. */
export const END_OF_LINE = isMac ? "Meta+ArrowRight" : "End";

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

async function launchElectron(userData: string) {
  const app = await _electron.launch({
    args: [
      path.join(here, "main-wrapper.mjs"),
      // Chromium's sandbox is unavailable on some CI containers.
      ...(process.env.CI ? ["--no-sandbox"] : []),
    ],
    cwd: repoRoot,
    env: {
      ...process.env,
      BOOJY_TEST_USERDATA: userData,
      BOOJY_TEST_HIDDEN: process.env.BOOJY_TEST_HEADED === "1" ? "0" : "1",
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
    await page.getByText("New note", { exact: true }).waitFor();
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
  { prepare }: { prepare?: (vault: Vault) => void } = {},
): Promise<AppHandle> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-e2e-"));
  const vaultDir = path.join(root, "vault");
  const userData = path.join(root, "userData");
  fs.mkdirSync(vaultDir, { recursive: true });
  fs.mkdirSync(userData, { recursive: true });
  const vault = makeVault(vaultDir);
  for (const [rel, content] of Object.entries(files)) vault.write(rel, content);
  prepare?.(vault);
  fs.writeFileSync(path.join(userData, "config.json"), JSON.stringify({ notesDir: vaultDir }));
  // Keep the test offline: no update check against GitHub.
  fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ autoUpdate: false }));

  const handle = { vault, userData } as AppHandle;
  const attach = (launched: Awaited<ReturnType<typeof launchElectron>>) => {
    handle.app = launched.app;
    handle.page = launched.page;
    handle.pageErrors = launched.pageErrors;
  };
  attach(await launchElectron(userData));

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
    attach(await launchElectron(userData));
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

/** The editor's blocks as the user reads them, one line per block. */
export async function editorText(page: Page): Promise<string> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-block-id]"))
      // An empty block holds a <br> for the caret, whose innerText is "\n".
      .map((b) => (b as HTMLElement).innerText.replace(/\n$/, ""))
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

/** Titles of the root `Notes` list, top to bottom, as the user reads them. */
export async function rootNoteOrder(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const trees = document.querySelectorAll('[role="tree"]');
    const notes = trees[trees.length - 1];
    return Array.from(notes?.querySelectorAll('[role="treeitem"]') ?? []).map((row) =>
      (row as HTMLElement).innerText.trim(),
    );
  });
}

/** Rename a sidebar row the way the user does: double-click, type, Enter. */
export async function renameRow(page: Page, title: string, newName: string) {
  await page.locator('[role="treeitem"]').filter({ hasText: title }).first().dblclick();
  const input = page.locator("input:focus");
  await input.waitFor();
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.type(newName);
  await page.keyboard.press("Enter");
}

/**
 * Move a note into a folder the way the user does: press on its row, hold
 * until the pill lifts, carry it over the folder row, release. Drag never
 * opens the note, so the editor is untouched afterwards.
 */
export async function moveNoteToFolder(page: Page, title: string, folder: string) {
  const row = page.locator("[data-note-id]").filter({ hasText: title }).first();
  const target = page.locator(`[data-folder-path="${folder}"]`).first();
  const from = await row.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error(`moveNoteToFolder: row or folder "${folder}" not visible`);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // The hold-to-lift delay is 400ms; a move of more than 5px before it cancels.
  await sleep(600);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await sleep(100);
  await page.mouse.up();
}

/** Expand every collapsed folder row so each note row is on screen. */
export async function expandAllFolders(page: Page) {
  const collapsed = page.locator('[data-folder-path][aria-expanded="false"]');
  while ((await collapsed.count()) > 0) await collapsed.first().click();
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
