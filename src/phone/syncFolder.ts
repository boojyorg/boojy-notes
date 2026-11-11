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

/** Where the folder is inside a Dropbox's Apps folder, whose own name Dropbox translates. */
export const syncFolderPath = (folder: string) =>
  folder ? `${APP_FOLDER} › ${folder}` : APP_FOLDER;
