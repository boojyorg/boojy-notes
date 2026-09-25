// Files in the vault that are not notes, as the sidebar shows them: a PDF
// beside the notes in its folder, the attachment store as one row of its own.
// The main process lists them (`read-other-files`); this decides where each
// one sits and what glyph it wears.

import { naturalCompare } from "./sidebarTree";

export interface OtherFile {
  /** Vault-relative POSIX path. */
  path: string;
  attachment: boolean;
}

/** Per vault: what the tree shows besides notes. */
export interface VaultView {
  otherFiles: boolean;
  attachments: boolean;
}

export const DEFAULT_VAULT_VIEW: VaultView = { otherFiles: true, attachments: false };

export type OtherFileKind = "image" | "audio" | "video" | "slides" | "sheet" | "archive" | "file";

const KINDS: Record<string, OtherFileKind> = {};
const add = (kind: OtherFileKind, exts: string) => {
  for (const ext of exts.split(" ")) KINDS[ext] = kind;
};
add("image", "png jpg jpeg gif webp svg heic heif avif bmp tif tiff ico");
add("audio", "mp3 wav m4a aac flac ogg oga opus aif aiff");
add("video", "mp4 m4v mov webm mkv avi");
add("slides", "ppt pptx key odp");
add("sheet", "xls xlsx csv tsv numbers ods");
add("archive", "zip rar 7z tar gz tgz bz2 xz");

export const baseName = (rel: string) => rel.slice(rel.lastIndexOf("/") + 1);

/** `report.final.pdf` → `report.final` and `.pdf`; a dotfile-like or extensionless name has no extension. */
export function splitExtension(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, ext: "" };
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
}

export function otherFileKind(name: string): OtherFileKind {
  const { ext } = splitExtension(name);
  return KINDS[ext.slice(1).toLowerCase()] ?? "file";
}

/** An attachment's name under the store: `attachments/a/b.png` → `a/b.png`. */
export function attachmentLabel(rel: string): string {
  return rel.startsWith("attachments/") ? rel.slice("attachments/".length) : rel;
}

export interface OtherFileGroups {
  /** Folder path (`""` for the vault's root) → the files shown in it, in name order. */
  byFolder: Map<string, string[]>;
  /** The attachment store's files, or null when the store is not shown. */
  attachments: string[] | null;
}

const byName = (a: string, b: string) => naturalCompare(baseName(a), baseName(b));

export function groupOtherFiles(files: OtherFile[], view: VaultView): OtherFileGroups {
  const byFolder = new Map<string, string[]>();
  const attachments: string[] = [];
  for (const f of files) {
    if (f.attachment) {
      if (view.attachments) attachments.push(f.path);
      continue;
    }
    if (!view.otherFiles) continue;
    const slash = f.path.lastIndexOf("/");
    const folder = slash < 0 ? "" : f.path.slice(0, slash);
    const list = byFolder.get(folder);
    if (list) list.push(f.path);
    else byFolder.set(folder, [f.path]);
  }
  for (const list of byFolder.values()) list.sort(byName);
  attachments.sort((a, b) => naturalCompare(attachmentLabel(a), attachmentLabel(b)));
  return { byFolder, attachments: view.attachments ? attachments : null };
}
