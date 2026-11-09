import { onCommand } from "./commands";
import { capacitorFiles, fileAddress } from "./files";
import { createPhoneSync } from "./phoneSync";
import { createPhoneVault, VAULT } from "./phoneVault";
import { holdFelt } from "./haptics";
import { selectWordAt } from "./selectWord";

/**
 * Runs before the app renders, on the phone only (main.jsx). The vault
 * answers the editor's file calls (`getAPI()` returns it), and sync starts
 * if a Dropbox folder is connected; with none, the notes are the phone's
 * alone until one is connected from Home.
 */
export async function installPhone() {
  const files = capacitorFiles();
  // A save the app died in the middle of is finished or undone before anything reads.
  await files.recover("state");
  await files.recover("vault");
  let sync: ReturnType<typeof createPhoneSync> | null = null;
  const vault = createPhoneVault(files, { onLocalChange: () => sync?.localChanged() });
  sync = createPhoneSync(files, vault.store);
  // The vault's file calls, the menu bar's command channel (the bar above the
  // keyboard sends on it), the feel of a hold, and sync for Home's folder row.
  (window as unknown as { boojyPhoneAPI: unknown }).boojyPhoneAPI = {
    ...vault.api,
    vaultAddress: await fileAddress(VAULT),
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
