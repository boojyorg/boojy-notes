import type { FileOps } from "./files";

type Entry = { path: string; mtime: number; size: number };

const join = (...parts: string[]) => parts.filter(Boolean).join("/");

/** Every file and folder under `dir`, paths relative to it, dot entries left out. */
async function tree(files: FileOps, dir: string) {
  const found = { files: [] as Entry[], dirs: [] as string[] };
  const all = await files.walk?.(dir);
  for (const e of all ?? []) {
    if (e.kind === "dir") found.dirs.push(e.path);
    else found.files.push(e);
  }
  const pending = all ? [] : [""];
  for (const rel of pending) {
    for (const e of await files.list(join(dir, rel))) {
      if (e.name.startsWith(".")) continue;
      const path = join(rel, e.name);
      if (e.kind === "dir") {
        found.dirs.push(path);
        pending.push(path);
      } else {
        found.files.push({ path, mtime: e.mtime, size: e.size });
      }
    }
  }
  // A folder before what is in it.
  found.dirs.sort();
  return found;
}

const same = (a: Uint8Array | null, b: Uint8Array) =>
  !!a && a.length === b.length && a.every((byte, i) => byte === b[i]);

/**
 * Copies the notes in the app's storage (`from`, under `src`) into a picked
 * folder (`dst`, at its top), each file read back and compared before the
 * next. Nothing is removed here: until every file is there whole, the app's
 * storage is where the notes are, and a copy cut short is simply run again
 * (a file already there whole is passed over).
 *
 * Oldest first, one at a time: the folder stamps each file with the moment
 * it lands (Android offers no way to set a modified time there), so the
 * dates are lost but the order "Most recent" sorts by is kept.
 *
 * The folder holds one name per spelling-without-case, the app's storage
 * does not: two files that would land on one name stop the move before
 * anything is written.
 */
export async function copyNotes(
  src: FileOps,
  from: string,
  dst: FileOps,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<void> {
  const { files, dirs } = await tree(src, from);
  const spellings = new Map<string, string>();
  for (const path of [...dirs, ...files.map((f) => f.path)]) {
    const other = spellings.get(path.toLowerCase());
    if (other) throw new Error(`"${other}" and "${path}" differ only by capitals`);
    spellings.set(path.toLowerCase(), path);
  }
  files.sort((a, b) => a.mtime - b.mtime || (a.path < b.path ? -1 : 1));
  const there = new Map((await tree(dst, "")).files.map((f) => [f.path, f.size]));
  for (const dir of dirs) await dst.mkdir(dir);
  let done = 0;
  onProgress(done, files.length);
  for (const { path } of files) {
    const bytes = await src.read(join(from, path));
    if (!bytes) throw new Error(`${path} could not be read`);
    if (there.get(path) !== bytes.length || !same(await dst.read(path), bytes)) {
      await dst.write(path, bytes);
      if (!same(await dst.read(path), bytes)) throw new Error(`${path} did not copy whole`);
    }
    onProgress(++done, files.length);
  }
}

/**
 * Removes from the app's storage what `copyNotes` put in the folder, once
 * the folder is where the notes are. Only a file the folder holds goes, then
 * the folders left empty; anything else stays, out of sight, rather than be
 * deleted unseen.
 */
export async function clearCopied(src: FileOps, from: string, dst: FileOps): Promise<void> {
  const { files, dirs } = await tree(src, from);
  const there = new Set((await tree(dst, "")).files.map((f) => f.path));
  for (const { path } of files) if (there.has(path)) await src.remove(join(from, path));
  for (const dir of dirs.reverse()) await src.rmdir(join(from, dir)).catch(() => {});
}
