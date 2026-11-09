import { Capacitor } from "@capacitor/core";
import { onCommand } from "./commands";
import { capacitorFiles, type FileOps, fileAddress } from "./files";
import { FolderAccess, folderAddress, folderFiles, grantedFolder } from "./folderFiles";
import { createPhoneSync } from "./phoneSync";
import { createPhoneVault, VAULT } from "./phoneVault";
import { holdFelt } from "./haptics";
import { routedFiles } from "./routedFiles";
import { selectWordAt } from "./selectWord";

/**
 * `pnpm android --test-app --folder` only: the notes live in a folder picked
 * with Android's folder picker. Until the app has a screen for choosing one,
 * no other build reaches the folder code.
 */
const FOLDER_SWITCH =
  (import.meta as { env?: Record<string, string> }).env?.VITE_BOOJY_FOLDER === "1";
const TEST_FOLDER = "Boojy Notes (test)";

/** The folder this install was given; asked for once, at the first start. */
async function testFolder() {
  const kept = await grantedFolder();
  if (kept) return kept;
  const { initial } = await FolderAccess.ensureDefault({ name: TEST_FOLDER });
  const got = await FolderAccess.pick({ initial });
  return got.picked && got.tree && got.root ? { tree: got.tree, root: got.root } : null;
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
  const folder = FOLDER_SWITCH ? await testFolder() : null;
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
