import { execFileSync } from "node:child_process";
import fs from "node:fs";

/**
 * A note whose text a sync client has taken off this Mac to save space
 * (iCloud's "Remove Download", Dropbox's online-only): the file keeps its
 * name, size and dates, but holds no data, and reading it makes the File
 * Provider download it, blocking the read. So the app never reads one it did
 * not choose to: the vault load lists it by name, the watcher leaves it
 * alone, and opening it downloads it off the main thread (`download-note`).
 *
 * macOS marks such a file SF_DATALESS in its flags. Node's stat has no
 * flags, so a file that occupies no blocks yet has a size is the candidate,
 * and `/usr/bin/stat` confirms it, once for a whole batch: a small
 * compressed file also occupies no blocks and must not read as offloaded.
 */
const SF_DATALESS = 0x40000000;

/** Tests list fake offloaded paths in this file, one per line (see `markDownloaded`). */
function testList(): Set<string> | null {
  const listPath = process.env.BOOJY_TEST_OFFLOADED;
  if (!listPath) return null;
  try {
    return new Set(fs.readFileSync(listPath, "utf-8").split("\n").filter(Boolean));
  } catch {
    return new Set();
  }
}

function isCandidate(stat: fs.Stats): boolean {
  return process.platform === "darwin" && stat.blocks === 0 && stat.size > 0;
}

/** The paths among `filePaths` whose text is not on this Mac. Never reads a file. */
export function offloadedAmong(filePaths: string[]): Set<string> {
  const fake = testList();
  if (fake) return new Set(filePaths.filter((p) => fake.has(p)));
  const candidates = filePaths.filter((p) => {
    try {
      return isCandidate(fs.statSync(p));
    } catch {
      return false;
    }
  });
  const offloaded = new Set<string>();
  // Kept well under the argument limit; one spawn per chunk, not per file.
  for (let i = 0; i < candidates.length; i += 500) {
    const chunk = candidates.slice(i, i + 500);
    let out: string;
    try {
      out = execFileSync("/usr/bin/stat", ["-f", "%f", ...chunk], { encoding: "utf-8" });
    } catch (error) {
      // A file gone mid-batch fails the whole call; its lines still print.
      out = String((error as { stdout?: string }).stdout ?? "");
    }
    const flags = out.split("\n").filter(Boolean);
    if (flags.length !== chunk.length) continue;
    chunk.forEach((p, k) => {
      if (Number(flags[k]) & SF_DATALESS) offloaded.add(p);
    });
  }
  return offloaded;
}

export function isOffloaded(filePath: string): boolean {
  return offloadedAmong([filePath]).has(filePath);
}

/**
 * The file's text, downloading it first if it is offloaded. Asynchronous, so
 * the download blocks a worker thread, never the main process.
 */
export async function readDownloading(filePath: string): Promise<string> {
  const text = await fs.promises.readFile(filePath, "utf-8");
  markDownloaded(filePath);
  return text;
}

/** A read has brought the file's text to this Mac (the test list forgets it). */
function markDownloaded(filePath: string): void {
  const listPath = process.env.BOOJY_TEST_OFFLOADED;
  const fake = testList();
  if (!listPath || !fake?.delete(filePath)) return;
  fs.writeFileSync(listPath, [...fake].join("\n"));
}
