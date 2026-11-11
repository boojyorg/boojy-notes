import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { onCommand } from "./commands";
import { capacitorFiles, type FileOps, fileAddress } from "./files";
import {
  FolderAccess,
  folderAddress,
  folderFiles,
  folderLabel,
  folderReached,
  type PickedFolder,
  reachableFolder,
  treesOverlap,
} from "./folderFiles";
import {
  type LocationRow,
  type Locations,
  freeName,
  nameProblem,
  newLocationId,
  prefixOf,
  readLocations,
  removeLocationFiles,
  scopedFiles,
  writeLocations,
} from "./locations";
import { createPhoneSync, readBinding } from "./phoneSync";
import { syncFolderName } from "./syncFolder";
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
async function finishMove(
  priv: FileOps,
  to: PickedFolder,
  others: string[],
): Promise<PickedFolder | null> {
  const screen = showMoving();
  const folder = folderFiles(to, priv);
  try {
    // A copy the app died in the middle of is written whole first.
    await folder.recover("");
    await copyNotes(priv, VAULT, folder, screen.progress);
    await writeChoice(priv, "folder", { folder: to, clearing: true });
  } catch (error) {
    console.warn("[folder] move failed:", error);
    await writeChoice(priv, "app");
    await FolderAccess.release({ tree: to.tree }).catch(() => {});
    screen.close();
    await sayNotMoved((error as Error)?.message ?? String(error));
    return null;
  }
  await clearMoved(priv, to);
  await reachableFolder(FolderAccess, to, others);
  screen.close();
  return to;
}

/** The app's own copies of notes now in `folder` go; a failure is left for the next start. */
async function clearMoved(priv: FileOps, folder: PickedFolder) {
  try {
    await clearCopied(priv, VAULT, folderFiles(folder, priv));
    await writeChoice(priv, "folder", { folder });
  } catch (error) {
    console.warn("[folder] clearing the app's copies failed:", error);
  }
}

/** The folders the other storage locations keep their notes in, or are moving them to. */
async function foldersElsewhere(root: FileOps, { open, list }: Locations): Promise<string[]> {
  const trees: string[] = [];
  for (const { id } of list) {
    if (id === open) continue;
    const record = await readStorage(scopedFiles(root, prefixOf(id)));
    for (const folder of [record?.folder, record?.moving]) if (folder) trees.push(folder.tree);
  }
  return trees;
}

/**
 * The folder the open location keeps its notes in, or null for the app's own
 * storage: asked at a fresh install's first launch, and asked again when a
 * chosen folder can no longer be reached (`storageChoice.ts` has the rules).
 * `others` are the other locations' folders: theirs, never this one's.
 */
async function notesFolder(priv: FileOps, others: string[]): Promise<PickedFolder | null> {
  const record = await readStorage(priv);
  if (record?.moving) return finishMove(priv, record.moving, others);
  const choice = record?.kind ?? null;
  const used = choice === null && (await hasBeenUsed(priv));
  // Only Android has folders to pick: the page in a browser (`pnpm dev:phone`) never asks.
  const canAsk = Capacitor.isNativePlatform();
  // An install that was never offered a folder never asks Android about one.
  // A folder chosen before the choice kept it is the grant no other location holds.
  const granted =
    choice === "folder" || (!used && canAsk)
      ? record?.folder
        ? await folderReached(record.folder)
        : await reachableFolder(FolderAccess, undefined, others)
      : null;
  const start = startFor({ choice, folder: granted, used, canAsk });
  if (start === "app") return null;
  if (start === "folder" || start === "lost") {
    let folder = granted;
    if (!folder) {
      folder = await askFolderAgain(others);
      await reachableFolder(FolderAccess, folder, others);
    }
    if (record?.clearing) await clearMoved(priv, folder);
    else if (record?.folder?.tree !== folder.tree) await writeChoice(priv, "folder", { folder });
    return folder;
  }
  const picked = await askStorage(FOLDER_NAME, granted, others);
  await writeChoice(priv, picked ? "folder" : "app", picked ? { folder: picked } : {});
  if (picked) await reachableFolder(FolderAccess, picked, others);
  return picked;
}

/**
 * The locations as Home lists them. One with no name of its own (the first,
 * until it is renamed) is called what Home's heading calls it: the Dropbox
 * folder it syncs with, or "Phone".
 */
async function locationRows(root: FileOps, { open, list }: Locations): Promise<LocationRow[]> {
  return Promise.all(
    list.map(async ({ id, name }) => {
      const files = scopedFiles(root, prefixOf(id));
      const bound = await readBinding(files);
      const kept = (await readStorage(files))?.folder;
      return {
        id,
        name: name ?? (bound ? syncFolderName(bound.folder) : "Phone"),
        named: name !== undefined,
        open: id === open,
        dropbox: bound ? bound.folder : null,
        phone: kept ? folderLabel(kept) : null,
      };
    }),
  );
}

/**
 * Starts the app again in `next`'s open location: `saved` writes the editor's
 * waiting edits, then, with the vault at rest, the list is written and the
 * page reloaded. A sync pass cut off by it is one the next start repeats.
 */
async function startIn(
  root: FileOps,
  atRest: <T>(work: () => Promise<T>) => Promise<T>,
  next: Locations,
  saved: () => Promise<unknown>,
) {
  await saved();
  await atRest(async () => {
    await writeLocations(root, next);
    location.reload();
  });
}

/** What Add a location… came to: nothing is said of a picker that was left. */
export type AddAnswer = "added" | "cancelled" | "refused" | "in-use";

/** What a press on "Move notes to a folder…" came to; `moving` is followed by a restart. */
export type MoveAnswer = "moving" | "cancelled" | "refused" | "not-empty" | "in-use";

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
  others: string[],
): Promise<MoveAnswer> {
  const { initial } = await FolderAccess.ensureDefault({ name: FOLDER_NAME });
  const got = await FolderAccess.pick({ initial });
  if (got.refused) return "refused";
  if (!got.picked || !got.tree || !got.root) return "cancelled";
  // Another location's folder: its grant is that location's, so it is not given back.
  if (others.some((tree) => treesOverlap(tree, got.tree as string))) return "in-use";
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
 * Runs before the app renders, on the phone only (main.jsx). The app is built
 * for the open storage location (`locations.ts`): its vault answers the
 * editor's file calls (`getAPI()` returns it), and sync starts if a Dropbox
 * folder is connected; with none, the notes are the phone's alone until one
 * is connected from Settings.
 */
export async function installPhone() {
  const root = capacitorFiles();
  // A save the app died in the middle of is finished or undone before anything reads.
  await root.recover("state");
  // The list as it stands: a rename or a removal changes it while the app runs.
  let locations = await readLocations(root);
  const prefix = prefixOf(locations.open);
  // Everything from here on is the open location's: its own state, vault and bin.
  const priv = scopedFiles(root, prefix);
  if (prefix) await priv.recover("state");
  const others = await foldersElsewhere(root, locations);
  const folder = await notesFolder(priv, others);
  // With a folder, the vault is the folder's and the rest stays private.
  const files: FileOps = folder ? routedFiles(priv, folderFiles(folder, priv), VAULT) : priv;
  await files.recover("vault");
  let sync: ReturnType<typeof createPhoneSync> | null = null;
  const vault = createPhoneVault(files, { onLocalChange: () => sync?.localChanged() });
  // The Dropbox folders the other locations sync with are theirs alone.
  const taken = (await locationRows(root, locations))
    .filter((l) => !l.open && l.dropbox !== null)
    .map((l) => l.dropbox as string);
  sync = createPhoneSync(files, vault.store, { taken });
  // The vault's file calls, the menu bar's command channel (the bar above the
  // keyboard sends on it), the feel of a hold, and sync for Home's folder row.
  (window as unknown as { boojyPhoneAPI: unknown }).boojyPhoneAPI = {
    ...vault.api,
    attachmentAddress: folder
      ? folderAddress(folder, Capacitor.convertFileSrc)
      : await fileAddress(prefix + VAULT),
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
    locations: {
      list: () => locationRows(root, locations),
      // Another location is another start: the app is built for one (`locations.ts`).
      open: (id: string, saved: () => Promise<unknown>) => {
        if (!locations.list.some((l) => l.id === id)) throw new Error("No such storage location");
        return startIn(root, vault.atRest, { ...locations, open: id }, saved);
      },
      /**
       * Adds a folder as a location, as the desktop's Add folder… does:
       * Android's folder screen, and the folder taken joins the list under
       * its own name. The open location stays open. Its choice is written
       * before the list, so a location listed always knows its folder.
       */
      add: async (): Promise<AddAnswer> => {
        const got = await FolderAccess.pick({});
        if (got.refused) return "refused";
        if (!got.picked || !got.tree || !got.root) return "cancelled";
        const picked = { tree: got.tree, root: got.root };
        // No two locations share files: not the same folder, nor one inside another.
        const held = [
          ...(await foldersElsewhere(root, locations)),
          ...(folder ? [folder.tree] : []),
        ];
        if (held.some((tree) => treesOverlap(tree, picked.tree))) {
          // Another's own grant is kept; one over or under it is given back.
          if (!held.includes(picked.tree)) await FolderAccess.release({ tree: picked.tree });
          return "in-use";
        }
        const id = newLocationId();
        const taken = (await locationRows(root, locations)).map((l) => l.name);
        const name = freeName(folderLabel(picked).split("/").pop() || "Notes", taken);
        // A list that couldn't be read stays unwritten (`writeLocations` refuses it).
        const next = { ...locations, list: [...locations.list, { id, name }] };
        if (next.damaged) await writeLocations(root, next); // refuses, before anything is written
        await writeChoice(scopedFiles(root, prefixOf(id)), "folder", { folder: picked });
        await writeLocations(root, next);
        locations = next;
        return "added";
      },
      /** A name in the app alone: its folder, and its Dropbox folder, keep theirs. */
      rename: async (id: string, name: string) => {
        const rows = await locationRows(root, locations);
        const problem = nameProblem(
          name,
          rows.filter((l) => l.id !== id).map((l) => l.name),
        );
        if (problem) throw new Error(problem);
        const next = {
          ...locations,
          list: locations.list.map((l) => (l.id === id ? { id, name: name.trim() } : l)),
        };
        await writeLocations(root, next);
        locations = next;
      },
      /**
       * Forgets a location that is not open: off the list first, then its own
       * files in the app's storage, then its folder's grant. The folder and
       * the notes in it stay; a location kept inside the app loses its notes,
       * which Settings says before asking. Killed part-way, what is left is
       * files nothing lists.
       */
      remove: async (id: string) => {
        if (id === locations.open) throw new Error("The open storage location can't be removed");
        if (!locations.list.some((l) => l.id === id)) return;
        const kept = (await readStorage(scopedFiles(root, prefixOf(id))))?.folder;
        const next = { ...locations, list: locations.list.filter((l) => l.id !== id) };
        await writeLocations(root, next);
        locations = next;
        await removeLocationFiles(root, id);
        if (kept) await FolderAccess.release({ tree: kept.tree }).catch(() => {});
      },
    },
    // Where the notes are, for Settings: the folder as a person reads it, or null inside the app.
    notesFolder: folder ? folderLabel(folder) : null,
    // Offered only where there is a folder to move to, and the notes are not in one.
    moveToFolder:
      !folder && Capacitor.isNativePlatform()
        ? (saved: () => Promise<unknown>) => moveToFolder(priv, vault.atRest, saved, others)
        : undefined,
  };
  await sync.start();
  if (!folder) return;
  // Other apps write the folder too, and Android sends no word of it. A
  // folder gone while the app runs is asked for again by a fresh start.
  const watch = watchOutside({
    check: vault.checkOutside,
    stillThere: async () => (await folderReached(folder)) !== null,
    lost: () => location.reload(),
  });
  watch.active(true, false);
  App.addListener("appStateChange", ({ isActive }) => watch.active(isActive));
}
