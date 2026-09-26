// Storage locations as a person reads them (Settings, the remove question):
// `~` for home, a cloud provider by its name, the folder's own name apart.
// Code calls a location a vault (electron/vaults.ts).

export interface StorageLocation {
  path: string;
  name: string;
  current: boolean;
  exists: boolean;
  cloud: boolean;
}

/** `~` for the home directory, on either platform. */
export const displayPath = (dir: string | null | undefined): string =>
  dir ? dir.replace(/^\/Users\/[^/]+/, "~").replace(/^C:\\Users\\[^\\]+/, "~") : "\u2014";

/** A location's path: `~` for home, iCloud Drive and the CloudStorage providers by name. */
export function locationPath(dir: string): string {
  return displayPath(dir)
    .replace(/^~\/Library\/Mobile Documents\/com~apple~CloudDocs/, "iCloud Drive")
    .replace(/^~\/Library\/CloudStorage\/([^/-]+)[^/]*/, (_m, provider: string) =>
      provider === "GoogleDrive" ? "Google Drive" : provider,
    );
}

/** `~/Documents/Boojy` and `Notes`: where it lives, and the folder's own name. */
export function splitLocation(dir: string): { parent: string; name: string } {
  const shown = locationPath(dir);
  const cut = Math.max(shown.lastIndexOf("/"), shown.lastIndexOf("\\"));
  return {
    parent: cut <= 0 ? shown.slice(0, cut + 1) : shown.slice(0, cut),
    name: shown.slice(cut + 1),
  };
}

/**
 * The question before a location leaves the list. Nothing on disk changes,
 * so it says where the folder stays; removing the open one says where the
 * app goes instead. Not the danger colour: nothing is deleted.
 */
export function removeLocationPrompt(vault: StorageLocation, next?: StorageLocation | null) {
  const stays = `The folder and its notes stay in ${locationPath(vault.path)}.`;
  if (next) {
    return {
      title: `Remove "${vault.name}" from Boojy Notes?`,
      message: `You're using it now, so Boojy Notes will switch to "${next.name}". ${stays}`,
      confirmLabel: "Remove and switch",
      danger: false,
    };
  }
  return {
    title: `Remove "${vault.name}" from Boojy Notes?`,
    message: `${stays} You can add it again with Add folder….`,
    confirmLabel: "Remove",
    danger: false,
  };
}

/** The sync service a location lives in, by name (`iCloud`, `Dropbox`), or null. */
export function cloudProvider(dir: string | null | undefined): string | null {
  if (!dir) return null;
  if (dir.includes("/Library/Mobile Documents/")) return "iCloud";
  const m = dir.match(/\/Library\/CloudStorage\/([^/-]+)/);
  if (!m) return null;
  return m[1] === "GoogleDrive" ? "Google Drive" : m[1];
}
