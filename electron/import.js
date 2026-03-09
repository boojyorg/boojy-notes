import fs from "node:fs";
import path from "node:path";

function ensureUniqueFilePath(filePath) {
  if (!fs.existsSync(filePath)) return filePath;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  let i = 2;
  while (fs.existsSync(path.join(dir, `${base}-${i}${ext}`))) i++;
  return path.join(dir, `${base}-${i}${ext}`);
}

export function importMarkdownFiles(filePaths, targetDir) {
  const imported = [];
  for (const fp of filePaths) {
    const dest = ensureUniqueFilePath(path.join(targetDir, path.basename(fp)));
    fs.copyFileSync(fp, dest);
    imported.push(dest);
  }
  return imported;
}

export function importMarkdownFolder(folderPath, targetDir) {
  const imported = [];
  function walk(dir, relBase) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), path.join(relBase, entry.name));
      } else if (/\.(md|markdown|txt)$/i.test(entry.name)) {
        const destDir = path.join(targetDir, relBase);
        fs.mkdirSync(destDir, { recursive: true });
        const dest = ensureUniqueFilePath(path.join(destDir, entry.name));
        fs.copyFileSync(path.join(dir, entry.name), dest);
        imported.push(dest);
      }
    }
  }
  walk(folderPath, "");
  return imported;
}

export async function importHtmlFiles(filePaths, targetDir) {
  const TurndownService = (await import("turndown")).default;
  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  const imported = [];
  for (const fp of filePaths) {
    const html = fs.readFileSync(fp, "utf-8");
    const md = td.turndown(html);
    const name = path.basename(fp, path.extname(fp)) + ".md";
    const dest = ensureUniqueFilePath(path.join(targetDir, name));
    fs.writeFileSync(dest, md, "utf-8");
    imported.push(dest);
  }
  return imported;
}
