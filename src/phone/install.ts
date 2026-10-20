import { onCommand } from "./commands";
import { capacitorFiles } from "./files";
import { settleFolder } from "./folderSwitch";
import { createPhoneSync, readSecrets } from "./phoneSync";
import { createPhoneVault } from "./phoneVault";
import { holdFelt } from "./haptics";
import { SYNC_FOLDER } from "./syncFolder";

/**
 * Runs before the app renders, on the phone only (main.jsx). The vault
 * answers the editor's file calls (`getAPI()` returns it), and sync starts
 * once Dropbox is signed in. Until then a plain sign-in screen stands in for
 * the app: the phone's own design is a later session.
 */
export async function installPhone() {
  const files = capacitorFiles();
  // A save the app died in the middle of is finished or undone before anything reads.
  await files.recover("state");
  await files.recover("vault");
  // The copy is the synced folder's, or set aside, before the vault or sync reads it.
  const accountId = (await readSecrets(files))?.accountId;
  await settleFolder(files, { folder: SYNC_FOLDER, accountId });
  let sync: ReturnType<typeof createPhoneSync> | null = null;
  const vault = createPhoneVault(files, { onLocalChange: () => sync?.localChanged() });
  sync = createPhoneSync(files, vault.store);
  // The vault's file calls, the menu bar's command channel (the bar above the
  // keyboard sends on it), the feel of a hold, and sync's state for Home's folder row.
  (window as unknown as { boojyPhoneAPI: unknown }).boojyPhoneAPI = {
    ...vault.api,
    onMenuCommand: onCommand,
    holdFelt,
    sync: {
      status: sync.status.status,
      subscribe: sync.status.subscribe,
      syncNow: sync.syncNow,
      signInAgain: sync.signInAgain,
    },
  };

  if (!(await sync.signedIn())) await signInScreen(sync.signIn);
  await sync.start();
}

/** One button; a failed sign-in says why and offers it again. */
function signInScreen(signIn: () => Promise<void>) {
  return new Promise<void>((resolve) => {
    const screen = document.createElement("div");
    screen.style.cssText =
      "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;" +
      "justify-content:center;gap:16px;padding:24px;font:16px system-ui;text-align:center";
    const note = document.createElement("p");
    note.textContent = "Boojy Notes keeps your notes in your Dropbox, in Apps/Boojy Notes.";
    const button = document.createElement("button");
    button.textContent = "Sign in to Dropbox";
    button.style.cssText = "font:inherit;padding:12px 20px";
    button.onclick = async () => {
      button.disabled = true;
      try {
        await signIn();
        screen.remove();
        resolve();
      } catch (error) {
        note.textContent = `Sign-in didn't finish: ${(error as Error).message}`;
        button.disabled = false;
      }
    };
    screen.append(note, button);
    document.body.append(screen);
  });
}
