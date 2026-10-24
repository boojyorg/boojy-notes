/** What the web and Electron specs share. */

/** The platform's primary modifier, for shortcuts the app handles itself. */
export const MOD = process.platform === "darwin" ? "Meta" : "Control";

/** A 1×1 PNG, base64: a real picture for a block to load. */
export const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
/** The same picture's bytes. */
export const PNG = Buffer.from(PNG_B64, "base64");
