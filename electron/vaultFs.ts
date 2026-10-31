import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Entries the vault walk never shows: hidden ones and the attachment store. */
export function isSkippedName(name: string): boolean {
  return name.startsWith(".") || name === "attachments";
}

/** Files a directory may hold and still count as empty. Only exact names; a
 * `._*` AppleDouble file could be a real user file and keeps the folder. */
export function isDeletableOsCruft(name: string): boolean {
  const lower = name.toLowerCase();
  // `Icon\r` is a folder's custom icon, which Finder and Dropbox write; the
  // carriage return is part of the name.
  return (
    lower === ".ds_store" || lower === "thumbs.db" || lower === "desktop.ini" || name === "Icon\r"
  );
}

/**
 * A file's identity, exact: its volume and file id, as text, or null when the
 * path is gone. Never the plain stat's numbers: on Windows a file id is 64 bits
 * and a Number rounds it, so two files made together can share one, and a
 * deleted note was taken for moved onto the next one and its text written there.
 */
export function fileIdentity(p: string): string | null {
  try {
    const st = fs.statSync(p, { bigint: true });
    return `${st.dev}:${st.ino}`;
  } catch {
    return null;
  }
}

/** Whether two paths name the same directory entry (false if either is missing). */
export function isSameEntry(a: string, b: string): boolean {
  const id = fileIdentity(a);
  return id !== null && id === fileIdentity(b);
}

/** A short key naming a vault in the stores kept outside it (index, history). */
export function vaultKey(notesDir: string): string {
  return crypto.createHash("sha1").update(path.resolve(notesDir)).digest("hex").slice(0, 12);
}
