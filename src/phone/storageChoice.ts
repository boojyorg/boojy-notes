import type { FileOps } from "./files";
import type { PickedFolder } from "./folderFiles";

/** Where this install keeps its notes: the app's private storage, or a folder the user picked. */
export type StorageChoice = "app" | "folder";

const CHOICE = "state/storage.json";
const decoder = new TextDecoder();

/** The choice made at first launch; null before one was made. Which folder is Android's grant. */
export async function readChoice(priv: FileOps): Promise<StorageChoice | null> {
  const bytes = await priv.read(CHOICE);
  if (!bytes) return null;
  try {
    const kind = JSON.parse(decoder.decode(bytes))?.kind;
    return kind === "app" || kind === "folder" ? kind : null;
  } catch {
    return null;
  }
}

export const writeChoice = (priv: FileOps, kind: StorageChoice) =>
  priv.write(CHOICE, new TextEncoder().encode(JSON.stringify({ kind })));

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
