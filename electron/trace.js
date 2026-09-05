// Diagnostic trace: one append-only log, one clock, both processes. Enabled
// only when BOOJY_TRACE names a file; otherwise every call is a no-op. The
// renderer's lines arrive over IPC and are stamped here, so main-process and
// renderer events interleave in the order they actually happened.
import fs from "node:fs";

const file = process.env.BOOJY_TRACE || null;
const t0 = Date.now();
if (file) fs.appendFileSync(file, `# boojy trace ${new Date().toISOString()} pid ${process.pid}\n`);

export const traceEnabled = !!file;

export function trace(source, ...parts) {
  if (!file) return;
  const stamp = String(Date.now() - t0).padStart(7, " ");
  fs.appendFile(file, `${stamp} ${source} ${parts.join(" ")}\n`, () => {});
}
