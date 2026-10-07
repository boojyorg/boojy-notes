import fs from "node:fs";
import path from "node:path";
import { isSkippedName } from "./vaultFs.js";

/** A save's temp file for a note (`tempPathFor` in atomicWrite.ts): `.~Name.md.tmp`. */
const NOTE_TEMP = /^\.~(.+\.md)\.tmp$/;

/**
 * A temp file younger than this may be a save still in flight, another copy
 * of the app writing to the same vault: it is left alone until a later open.
 */
const IN_FLIGHT_MS = 60_000;

/** `2026-10-07`, in local time, as the conflicted copy writes its date. */
const day = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** A free name beside `dir` for a recovered note: `Name (recovered 2026-10-07).md`, then ` 2`… */
function recoveredPath(dir: string, noteName: string, now: Date): string {
  const base = `${noteName.replace(/\.md$/, "")} (recovered ${day(now)})`;
  let candidate = path.join(dir, `${base}.md`);
  for (let n = 2; fs.existsSync(candidate); n++) candidate = path.join(dir, `${base} ${n}.md`);
  return candidate;
}

/**
 * A save writes its text to a hidden temp file and renames it over the note
 * (`writeFileAtomic`). A crash between the two leaves the temp file; the next
 * save under that name removes it, but after a rename nothing ever does. So
 * when a vault opens, each one left beside a note is looked at:
 *
 * - empty, or no newer than the note beside it: that note superseded it, and
 *   it goes;
 * - holding exactly the note's text: nothing to keep, and it goes;
 * - otherwise (newer than its note, or with no note at all) it may hold the
 *   last save, so it is kept, as a note of its own beside it,
 *   `Name (recovered 2026-10-07).md`, the keep-both rule the app has for a
 *   conflict. It may be incomplete (the crash may have come mid-write), so
 *   the reader decides what to keep. Nothing is deleted that is not
 *   superseded.
 *
 * Only a note's temp file is touched, and only one at least a minute old;
 * dot-directories and the attachment store are not walked.
 */
export function recoverLeftoverTemps(
  notesDir: string,
  now = new Date(),
): { removed: string[]; recovered: string[] } {
  const removed: string[] = [];
  const recovered: string[] = [];
  const visit = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!isSkippedName(entry.name)) visit(full);
        continue;
      }
      const match = entry.isFile() ? entry.name.match(NOTE_TEMP) : null;
      if (!match) continue;
      try {
        const temp = fs.statSync(full);
        if (now.getTime() - temp.mtimeMs < IN_FLIGHT_MS) continue;
        const notePath = path.join(dir, match[1]);
        const note = fs.existsSync(notePath) ? fs.statSync(notePath) : null;
        const superseded =
          temp.size === 0 ||
          (note !== null &&
            (temp.mtimeMs <= note.mtimeMs ||
              fs.readFileSync(full).equals(fs.readFileSync(notePath))));
        if (superseded) {
          fs.rmSync(full, { force: true });
          removed.push(full);
        } else {
          const target = recoveredPath(dir, match[1], now);
          fs.renameSync(full, target);
          recovered.push(target);
        }
      } catch (error) {
        console.warn("A leftover temp file could not be looked at", full, String(error));
      }
    }
  };
  visit(notesDir);
  return { removed, recovered };
}
