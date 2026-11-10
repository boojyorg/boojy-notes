import { Capacitor } from "@capacitor/core";
import { onCommand } from "./commands";
import { capacitorFiles, type FileOps, fileAddress } from "./files";
import {
  FolderAccess,
  folderAddress,
  folderFiles,
  type PickedFolder,
  reachableFolder,
} from "./folderFiles";
import { createPhoneSync } from "./phoneSync";
import { createPhoneVault, VAULT } from "./phoneVault";
import { holdFelt } from "./haptics";
import { routedFiles } from "./routedFiles";
import { selectWordAt } from "./selectWord";
import { hasBeenUsed, readChoice, startFor, writeChoice } from "./storageChoice";
import { askFolderAgain, askStorage } from "./storageScreens";

/**
 * Whether this build offers a notes folder at first launch. The test app
 * alone, until the app notices what other apps change in the folder while it
 * is open; every other build keeps its notes in its own storage, unasked.
 */
const FOLDER_OFFERED = import.meta.env.VITE_BOOJY_TEST_APP === "1";
const FOLDER_NAME = FOLDER_OFFERED ? "Boojy Notes (test)" : "Boojy Notes";

/**
 * The folder this install keeps its notes in, or null for the app's own
 * storage: asked at a fresh install's first launch, and asked again when a
 * chosen folder can no longer be reached (`storageChoice.ts` has the rules).
 */
async function notesFolder(priv: FileOps): Promise<PickedFolder | null> {
  const choice = await readChoice(priv);
  const used = choice === null && (await hasBeenUsed(priv));
  // An install that was never offered a folder never asks Android about one.
  const granted = choice === "folder" || (!used && FOLDER_OFFERED) ? await reachableFolder() : null;
  const start = startFor({ choice, folder: granted, used, canAsk: FOLDER_OFFERED });
  if (start === "app") return null;
  if (start === "folder") return granted;
  if (start === "lost") {
    const again = await askFolderAgain();
    await reachableFolder(FolderAccess, again);
    return again;
  }
  const picked = await askStorage(FOLDER_NAME, granted);
  await writeChoice(priv, picked ? "folder" : "app");
  if (picked) await reachableFolder(FolderAccess, picked);
  return picked;
}

/**
 * Runs before the app renders, on the phone only (main.jsx). The vault
 * answers the editor's file calls (`getAPI()` returns it), and sync starts
 * if a Dropbox folder is connected; with none, the notes are the phone's
 * alone until one is connected from Home.
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
  };
  await sync.start();
}
