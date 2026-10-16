/**
 * Dropbox's `content_hash`, computed on the device: SHA-256 of each 4 MiB
 * block, then SHA-256 of those digests joined. Equal hashes mean equal bytes,
 * so the engine compares files without downloading them.
 * https://www.dropbox.com/developers/reference/content-hash
 */

const BLOCK = 4 * 1024 * 1024;

const sha256 = async (bytes: Uint8Array<ArrayBuffer>) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

export async function contentHash(bytes: Uint8Array): Promise<string> {
  const digests: Uint8Array[] = [];
  for (let at = 0; at < bytes.length; at += BLOCK) {
    digests.push(await sha256(bytes.slice(at, at + BLOCK)));
  }
  const joined = new Uint8Array(digests.length * 32);
  digests.forEach((digest, i) => {
    joined.set(digest, i * 32);
  });
  const hash = await sha256(joined);
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}
