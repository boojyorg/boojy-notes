/**
 * The Dropbox folder the phone's notes sync with: one in Apps/Boojy Notes,
 * the only part of a Dropbox the app can reach, or that folder itself,
 * written "". Chosen at a connect and kept in the binding
 * (`state/binding.json`); changing it is a disconnect and a connect.
 */

/** What Dropbox calls the app's folder, and so what the notes' folder is called when it is that one. */
export const APP_FOLDER = "Boojy Notes";

/**
 * Asked at a connect while Dropbox holds folders there: one of `folders`, ""
 * for the app folder itself, a new name, or null to connect nothing.
 */
export type ChooseFolder = (folders: string[]) => Promise<string | null>;

/**
 * The folder a choice names: the one Dropbox holds under that name (it
 * ignores case), else a new one, which the first pass makes. Throws for a
 * name that is no single folder.
 */
export function folderChosen(choice: string, folders: string[]) {
  if (choice === "") return "";
  const name = choice.trim();
  if (!name || /[/\\]/.test(name) || /^\.+$/.test(name)) {
    throw new Error("That folder name can't be used");
  }
  return folders.find((f) => f.toLowerCase() === name.toLowerCase()) ?? name;
}

/** The folder's name as Home and Settings show it. */
export const syncFolderName = (folder: string) => folder || APP_FOLDER;

/**
 * Where the folder is in a Dropbox, as the desktop shows a location there.
 * Dropbox names the Apps folder in the account's language and the app can't
 * see which, so `Apps` is the usual name, not a promise.
 */
export const syncFolderPath = (folder: string) =>
  `Dropbox/Apps/${APP_FOLDER}${folder ? `/${folder}` : ""}`;

/**
 * Whether `folder` is one another storage location on this phone syncs with
 * (`taken`): the same folder, or the app folder itself beside any folder in
 * it. Two locations over one Dropbox folder would each read the other's
 * notes as its own, and delete them.
 */
export const folderClash = (folder: string, taken: string[]) =>
  taken.some((t) => t === "" || folder === "" || t.toLowerCase() === folder.toLowerCase());
