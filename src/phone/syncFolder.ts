/**
 * The Dropbox folder the phone syncs, under Apps/Boojy Notes: sync reads it,
 * and Home's vault row shows it. A label only; what the phone remembers per
 * vault (sort, open folders, recent notes) stays keyed by `getNotesDir`.
 * Fixed for now; the first version will choose it at sign-in. A change sets
 * the phone's copy of the old folder aside at the next start (folderSwitch.ts).
 */
export const SYNC_FOLDER = "Personal";
