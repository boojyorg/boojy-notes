import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { contentHash } from "../../src/sync/contentHash";

/** Dropbox's algorithm written a second way, with Node's own hashing. */
function reference(bytes: Uint8Array) {
  const block = 4 * 1024 * 1024;
  const digests: Buffer[] = [];
  for (let at = 0; at < bytes.length; at += block) {
    digests.push(
      createHash("sha256")
        .update(bytes.subarray(at, at + block))
        .digest(),
    );
  }
  return createHash("sha256").update(Buffer.concat(digests)).digest("hex");
}

describe("contentHash", () => {
  it("hashes an empty file as SHA-256 of nothing", async () => {
    expect(await contentHash(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("hashes a note as one block", async () => {
    const bytes = new TextEncoder().encode("# A note\n\nwith words\n");
    expect(await contentHash(bytes)).toBe(reference(bytes));
  });

  it("hashes each 4 MiB block, then the digests together", async () => {
    const bytes = new Uint8Array(9 * 1024 * 1024 + 17);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) % 251;
    const hash = await contentHash(bytes);
    expect(hash).toBe(reference(bytes));
    // Not the same as hashing the whole file at once.
    expect(hash).not.toBe(createHash("sha256").update(bytes).digest("hex"));
  });
});
