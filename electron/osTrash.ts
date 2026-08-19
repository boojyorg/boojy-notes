import { ipcMain, shell } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ensureUniqueFilePath,
  getIdIndex,
  sanitizeFilename,
  saveIndex,
} from "./noteFileManager.js";

interface LegacyTrashMetaEntry {
  deletedAt?: number;
  originalFolder?: string | null;
  originalTitle?: string;
}

interface UntouchedLegacyItem {
  path: string;
  reason: string;
}

export interface LegacyTrashMigrationReport {
  legacyTrashDir: string;
  migrated: Array<{ noteId: string; trashedAs: string }>;
  untouched: UntouchedLegacyItem[];
}

type TrashItem = (filePath: string) => Promise<void>;

const LEGACY_META_FILE = ".boojy-trash-meta.json";

function legacyTrashDir(notesDir: string): string {
  return path.join(notesDir, ".trash");
}

function legacyMetaPath(notesDir: string): string {
  return path.join(legacyTrashDir(notesDir), LEGACY_META_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readLegacyMetadata(notesDir: string): Record<string, LegacyTrashMetaEntry> | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(legacyMetaPath(notesDir), "utf-8"));
    if (!isRecord(parsed)) return null;
    return parsed as Record<string, LegacyTrashMetaEntry>;
  } catch {
    return null;
  }
}

function writeLegacyMetadata(notesDir: string, metadata: Record<string, LegacyTrashMetaEntry>) {
  const target = legacyMetaPath(notesDir);
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(metadata, null, 2));
  fs.renameSync(temporary, target);
}

/**
 * Move pre-system-trash notes into the OS Trash without risking their only copy.
 *
 * Each recognized Markdown file is copied to a temporary, readable filename
 * first. The temporary copy goes to the OS Trash; only after that succeeds is
 * the legacy source removed. Unknown, ambiguous, or failed items stay exactly
 * where they are and are returned for user-visible reporting.
 */
export async function migrateLegacyTrash(
  notesDir: string,
  trashItem: TrashItem = (filePath) => shell.trashItem(filePath),
): Promise<LegacyTrashMigrationReport> {
  const directory = legacyTrashDir(notesDir);
  const report: LegacyTrashMigrationReport = {
    legacyTrashDir: directory,
    migrated: [],
    untouched: [],
  };

  if (!fs.existsSync(directory)) return report;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    report.untouched.push({ path: directory, reason: `Could not inspect: ${String(error)}` });
    return report;
  }

  const metadata = readLegacyMetadata(notesDir);
  if (!metadata) {
    const hasMetadataFile = entries.some((entry) => entry.name === LEGACY_META_FILE);
    for (const entry of entries) {
      if (entry.name === LEGACY_META_FILE) continue;
      report.untouched.push({
        path: path.join(directory, entry.name),
        reason: "Legacy trash metadata is missing or unreadable",
      });
    }
    if (hasMetadataFile && report.untouched.length === 0) {
      report.untouched.push({
        path: legacyMetaPath(notesDir),
        reason: "Legacy trash metadata is unreadable",
      });
    }
    return report;
  }

  let stagingDirectory: string | null = null;
  const seenNoteIds = new Set<string>();
  const stagedNameCounts = new Map<string, number>();
  try {
    stagingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-legacy-trash-"));

    for (const entry of entries) {
      if (entry.name === LEGACY_META_FILE) continue;

      const sourcePath = path.join(directory, entry.name);
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") {
        report.untouched.push({
          path: sourcePath,
          reason: "Not a recognized legacy Markdown note",
        });
        continue;
      }

      const noteId = path.basename(entry.name, path.extname(entry.name));
      seenNoteIds.add(noteId);
      const info = metadata[noteId];
      const originalTitle = info?.originalTitle;
      if (typeof originalTitle !== "string" || originalTitle.trim().length === 0) {
        report.untouched.push({
          path: sourcePath,
          reason: "No trustworthy original title in legacy metadata",
        });
        continue;
      }

      const readableBase = sanitizeFilename(originalTitle);
      const collisionKey = readableBase.toLowerCase();
      const collisionNumber = (stagedNameCounts.get(collisionKey) ?? 0) + 1;
      stagedNameCounts.set(collisionKey, collisionNumber);
      const readableName = `${readableBase}${collisionNumber > 1 ? `-${collisionNumber}` : ""}.md`;
      const stagingPath = ensureUniqueFilePath(path.join(stagingDirectory, readableName));

      try {
        fs.copyFileSync(sourcePath, stagingPath, fs.constants.COPYFILE_EXCL);
        await trashItem(stagingPath);
      } catch (error) {
        try {
          if (fs.existsSync(stagingPath)) fs.unlinkSync(stagingPath);
        } catch {
          // The temporary copy is not the source of truth; sourcePath remains untouched.
        }
        report.untouched.push({
          path: sourcePath,
          reason: `Could not move a safe copy to the OS Trash: ${String(error)}`,
        });
        continue;
      }

      try {
        fs.unlinkSync(sourcePath);
        delete metadata[noteId];
        report.migrated.push({ noteId, trashedAs: path.basename(stagingPath) });
      } catch (error) {
        report.untouched.push({
          path: sourcePath,
          reason: `A copy reached the OS Trash, but the legacy source could not be removed: ${String(error)}`,
        });
      }
    }

    for (const noteId of Object.keys(metadata)) {
      if (seenNoteIds.has(noteId)) continue;
      report.untouched.push({
        path: legacyMetaPath(notesDir),
        reason: `Metadata for ${noteId} has no corresponding Markdown file`,
      });
    }
  } catch (error) {
    report.untouched.push({
      path: directory,
      reason: `Legacy migration could not continue safely: ${String(error)}`,
    });
  } finally {
    if (stagingDirectory) {
      try {
        fs.rmSync(stagingDirectory, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup of a temporary directory containing no source files.
      }
    }
  }

  // With no completed migration there is nothing to finalize. In particular,
  // preserve the legacy metadata byte-for-byte when every source was left in place.
  if (report.migrated.length === 0) return report;

  try {
    const remainingEntries = fs
      .readdirSync(directory)
      .filter((name) => name !== LEGACY_META_FILE && name !== `${LEGACY_META_FILE}.tmp`);
    if (Object.keys(metadata).length === 0 && remainingEntries.length === 0) {
      try {
        fs.unlinkSync(legacyMetaPath(notesDir));
      } catch {
        // An absent metadata file is already the desired final state.
      }
      fs.rmdirSync(directory);
    } else {
      writeLegacyMetadata(notesDir, metadata);
    }
  } catch (error) {
    report.untouched.push({
      path: legacyMetaPath(notesDir),
      reason: `Could not finalize legacy metadata: ${String(error)}`,
    });
  }

  return report;
}

/** Move one indexed Markdown note to the platform Trash/Recycle Bin. */
export async function trashManagedNote(
  notesDir: string,
  noteId: string,
  suppressWatcher: (filePath: string) => void,
  trashItem: TrashItem = (filePath) => shell.trashItem(filePath),
): Promise<{ trashed: boolean }> {
  const idIndex = getIdIndex();
  const relativePath = idIndex[noteId];
  if (!relativePath) return { trashed: false };

  const resolvedNotesDir = path.resolve(notesDir);
  const filePath = path.resolve(notesDir, relativePath);
  if (filePath !== resolvedNotesDir && !filePath.startsWith(`${resolvedNotesDir}${path.sep}`)) {
    return { trashed: false };
  }
  if (!fs.existsSync(filePath) || path.extname(filePath).toLowerCase() !== ".md") {
    return { trashed: false };
  }

  suppressWatcher(filePath);
  await trashItem(filePath);

  delete idIndex[noteId];
  try {
    saveIndex(notesDir);
  } catch (error) {
    // The file is already safely in the OS Trash. A later vault scan will
    // clean this stale in-memory/index entry, so do not report the trash move as failed.
    console.error("Failed to persist the note index after OS trash", error);
  }

  return { trashed: true };
}

export function registerOSTrashIPC(
  getNotesDir: () => string,
  suppressWatcher: (filePath: string) => void,
) {
  ipcMain.handle("trash-note", (_event, noteId: string) =>
    trashManagedNote(getNotesDir(), noteId, suppressWatcher),
  );
}
