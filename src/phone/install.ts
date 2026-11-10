import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { onCommand } from "./commands";
import { capacitorFiles, type FileOps, fileAddress } from "./files";
import {
  FolderAccess,
  folderAddress,
  folderFiles,
  folderLabel,
  type PickedFolder,
  reachableFolder,
} from "./folderFiles";
import { createPhoneSync } from "./phoneSync";
import { createPhoneVault, VAULT } from "./phoneVault";
import { holdFelt } from "./haptics";
import { clearCopied, copyNotes } from "./moveToFolder";
import { watchOutside } from "./outsideWatch";
import { routedFiles } from "./routedFiles";
import { selectWordAt } from "./selectWord";
import { hasBeenUsed, readStorage, startFor, writeChoice } from "./storageChoice";
import { askFolderAgain, askStorage, sayNotMoved, showMoving } from "./storageScreens";

/** The folder a first launch suggests; the test app's is its own, beside the everyday app's. */
const FOLDER_NAME =
  import.meta.env.VITE_BOOJY_TEST_APP === "1" ? "Boojy Notes (test)" : "Boojy Notes";

/**
 * A move into `to` that a press in Settings began (`moveToFolder` below), run
 * here where no note is open and nothing syncs. The folder is the choice only
 * once every file is in it whole; then the app's own copies go. Killed at any
 * point, the next start carries on from the record. A move that fails leaves
 * the notes in the app's storage, and says so.
 */
async function finishMove(priv: FileOps, to: PickedFolder): Promise<PickedFolder | null> {
  const screen = showMoving();
  const folder = folderFiles(to, priv);
  try {
    // A copy the app died in the middle of is written whole first.
    await folder.recover("");
    await copyNotes(priv, VAULT, folder, screen.progress);
    await writeChoice(priv, "folder", { clearing: true });
  } catch (error) {
    console.warn("[folder] move failed:", error);
    await writeChoice(priv, "app");
    await FolderAccess.release({ tree: to.tree }).catch(() => {});
    screen.close();
    await sayNotMoved((error as Error)?.message ?? String(error));
    return null;
  }
  await clearMoved(priv, to);
  await reachableFolder(FolderAccess, to);
  screen.close();
  return to;
}

/** The app's own copies of notes now in `folder` go; a failure is left for the next start. */
async function clearMoved(priv: FileOps, folder: PickedFolder) {
  try {
    await clearCopied(priv, VAULT, folderFiles(folder, priv));
    await writeChoice(priv, "folder");
  } catch (error) {
    console.warn("[folder] clearing the app's copies failed:", error);
  }
}

/**
 * The folder this install keeps its notes in, or null for the app's own
 * storage: asked at a fresh install's first launch, and asked again when a
 * chosen folder can no longer be reached (`storageChoice.ts` has the rules).
 */
async function notesFolder(priv: FileOps): Promise<PickedFolder | null> {
  const record = await readStorage(priv);
  if (record?.moving) return finishMove(priv, record.moving);
  const choice = record?.kind ?? null;
  const used = choice === null && (await hasBeenUsed(priv));
  // Only Android has folders to pick: the page in a browser (`pnpm dev:phone`) never asks.
  const canAsk = Capacitor.isNativePlatform();
  // An install that was never offered a folder never asks Android about one.
  const granted = choice === "folder" || (!used && canAsk) ? await reachableFolder() : null;
  const start = startFor({ choice, folder: granted, used, canAsk });
  if (start === "app") return null;
  if (start === "folder" || start === "lost") {
    let folder = granted;
    if (!folder) {
      folder = await askFolderAgain();
      await reachableFolder(FolderAccess, folder);
    }
    if (record?.clearing) await clearMoved(priv, folder);
    return folder;
  }
  const picked = await askStorage(FOLDER_NAME, granted);
  await writeChoice(priv, picked ? "folder" : "app");
  if (picked) await reachableFolder(FolderAccess, picked);
  return picked;
}

/** What a press on "Move notes to a folder…" came to; `moving` is followed by a restart. */
export type MoveAnswer = "moving" | "cancelled" | "refused" | "not-empty";

/**
 * Settings' "Move to a folder…", for notes kept in the app's storage.
 * Android's folder screen opens in `Documents/<FOLDER_NAME>`; the folder
 * taken must be on the phone and empty (nothing is merged). `saved` writes
 * the editor's waiting edits; then, with the vault at rest, the move is
 * recorded and the app starts again to make it (`finishMove`).
 */
async function moveToFolder(
  priv: FileOps,
  atRest: <T>(work: () => Promise<T>) => Promise<T>,
  saved: () => Promise<unknown>,
): Promise<MoveAnswer> {
  const { initial } = await FolderAccess.ensureDefault({ name: FOLDER_NAME });
  const got = await FolderAccess.pick({ initial });
  if (got.refused) return "refused";
  if (!got.picked || !got.tree || !got.root) return "cancelled";
  const to = { tree: got.tree, root: got.root };
  const { entries } = await FolderAccess.list({ tree: to.tree, id: to.root });
  if (entries.some((e) => !e.name.startsWith("."))) {
    await FolderAccess.release({ tree: to.tree });
    return "not-empty";
  }
  await saved();
  await atRest(async () => {
    await writeChoice(priv, "app", { moving: to });
    location.reload();
  });
  return "moving";
}

/**
 * Runs before the app renders, on the phone only (main.jsx). The vault
 * answers the editor's file calls (`getAPI()` returns it), and sync starts
 * if a Dropbox folder is connected; with none, the notes are the phone's
 * alone until one is connected from Settings.
 */
export async function installPhone() {
  const priv = capacitorFiles();
  // A save the app died in the middle of is finished or undone before anything reads.
  await priv.recover("state");
  const folder = await notesFolder(priv);
  // With a folder, the vault is the folder's and the rest stays private.
  const files: FileOps = folder ? routedFiles(priv, folderFiles(folder, priv), VAULT) : priv;
  await files.recover("vault");
  let sync: ReturnType<typeof createPhoneSync> | null = null;
  const vault = createPhoneVault(files, { onLocalChange: () => sync?.localChanged() });
  sync = createPhoneSync(files, vault.store);
  // The vault's file calls, the menu bar's command channel (the bar above the
  // keyboard sends on it), the feel of a hold, and sync for Home's folder row.
  (window as unknown as { boojyPhoneAPI: unknown }).boojyPhoneAPI = {
    ...vault.api,
    attachmentAddress: folder
      ? folderAddress(folder, Capacitor.convertFileSrc)
      : await fileAddress(VAULT),
    onMenuCommand: onCommand,
    holdFelt,
    selectWordAt,
    sync: {
      status: sync.status.status,
      subscribe: sync.status.subscribe,
      syncNow: sync.syncNow,
      signInAgain: sync.signInAgain,
      connect: sync.connect,
      disconnect: sync.disconnect,
    },
    // Where the notes are, for Settings: the folder as a person reads it, or null inside the app.
    notesFolder: folder ? folderLabel(folder) : null,
    // Offered only where there is a folder to move to, and the notes are not in one.
    moveToFolder:
      !folder && Capacitor.isNativePlatform()
        ? (saved: () => Promise<unknown>) => moveToFolder(priv, vault.atRest, saved)
        : undefined,
  };
  await sync.start();
  if (!folder) return;
  // Other apps write the folder too, and Android sends no word of it. A
  // folder gone while the app runs is asked for again by a fresh start.
  const watch = watchOutside({
    check: vault.checkOutside,
    stillThere: async () => (await reachableFolder()) !== null,
    lost: () => location.reload(),
  });
  watch.active(true, false);
  App.addListener("appStateChange", ({ isActive }) => watch.active(isActive));
}
