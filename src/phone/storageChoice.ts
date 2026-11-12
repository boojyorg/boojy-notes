import type { FileOps } from "./files";
import type { PickedFolder } from "./folderFiles";

/** Where this install keeps its notes: the app's private storage, or a folder the user picked. */
export type StorageChoice = "app" | "folder";

const CHOICE = "state/storage.json";
const decoder = new TextDecoder();

/**
 * What `state/storage.json` holds: the choice, the folder chosen, and a move
 * from the app's storage into a folder that is under way. `moving` is the
 * folder being copied into (the notes are still the app's); `clearing` says
 * the folder is now where they are and the app's own copies are being removed.
 */
export interface StorageRecord {
  kind: StorageChoice;
  /**
   * The folder chosen, so each storage location knows its own among
   * Android's grants. Missing in a record from before it was kept: the
   * grant no other location holds is then this one's (`install.ts`).
   */
  folder?: PickedFolder;
  moving?: PickedFolder;
  clearing?: true;
}

/** The record as written; null before a choice was made, or when the file is damaged. */
export async function readStorage(priv: FileOps): Promise<StorageRecord | null> {
  const bytes = await priv.read(CHOICE);
  if (!bytes) return null;
  try {
    const { kind, folder, moving, clearing } = JSON.parse(decoder.decode(bytes)) ?? {};
    if (kind !== "app" && kind !== "folder") return null;
    const picked = (f: PickedFolder | undefined) =>
      typeof f?.tree === "string" && typeof f?.root === "string"
        ? { tree: f.tree, root: f.root }
        : null;
    const record: StorageRecord = { kind };
    const kept = kind === "folder" ? picked(folder) : null;
    if (kept) record.folder = kept;
    const to = kind === "app" ? picked(moving) : null;
    if (to) record.moving = to;
    if (kind === "folder" && clearing === true) record.clearing = true;
    return record;
  } catch {
    return null;
  }
}

/** The choice made at first launch; null before one was made. */
export const readChoice = async (priv: FileOps): Promise<StorageChoice | null> =>
  (await readStorage(priv))?.kind ?? null;

export const writeChoice = (
  priv: FileOps,
  kind: StorageChoice,
  under: Pick<StorageRecord, "folder" | "moving" | "clearing"> = {},
) => priv.write(CHOICE, new TextEncoder().encode(JSON.stringify({ kind, ...under })));

/**
 * An install that has been used: a note or folder in the private vault, or
 * anything the app keeps in `state/` (note ids, a Dropbox connection).
 */
export async function hasBeenUsed(priv: FileOps): Promise<boolean> {
  if ((await priv.list("vault")).length > 0) return true;
  return (await priv.list("state")).some(
    (e) => e.name !== CHOICE.split("/")[1] && !e.name.startsWith(".~"),
  );
}

/**
 * What a start does about storage.
 *
 * - A folder was chosen: its notes, or `lost` when Android no longer reaches
 *   it. Lost is never app storage: every note would seem gone, and new ones
 *   would be written somewhere else. Nor is the folder made again.
 * - App storage was chosen, or the install was in use before there was a
 *   choice: the private vault, never asked.
 * - A fresh install is asked, where there are folders to pick (`canAsk`: on Android).
 */
export function startFor({
  choice,
  folder,
  used,
  canAsk,
}: {
  choice: StorageChoice | null;
  /** The granted folder, when it can be reached. */
  folder: PickedFolder | null;
  used: boolean;
  canAsk: boolean;
}): "app" | "folder" | "lost" | "ask" {
  if (choice === "folder") return folder ? "folder" : "lost";
  if (choice === "app" || used || !canAsk) return "app";
  return "ask";
}
