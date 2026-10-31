// TEMPORARY DIAGNOSTIC — remove before merge. Prints, per platform, how many
// files made together share a rounded Number ino while their exact ids differ.
import { it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

it("diag: Number ino collisions among files made together", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ino-diag-"));
  const files = Array.from({ length: 200 }, (_, i) => path.join(dir, `n${i}.md`));
  for (const f of files) fs.writeFileSync(f, "x");
  const plain = new Map();
  const exact = new Set();
  let unsafe = 0;
  for (const f of files) {
    const n = fs.statSync(f).ino;
    const b = fs.statSync(f, { bigint: true }).ino;
    if (b > BigInt(Number.MAX_SAFE_INTEGER)) unsafe++;
    plain.set(n, (plain.get(n) ?? 0) + 1);
    exact.add(b.toString());
  }
  const sample = fs.statSync(files[0], { bigint: true }).ino;
  process.stderr.write(
    `INO-DIAG ${process.platform}: files=${files.length} distinctExact=${exact.size} distinctNumber=${plain.size} aboveSafeInt=${unsafe} sample=${sample} (0x${sample.toString(16)})\n`,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});
