// The release page's notes for one version, from CHANGELOG.md: its section's
// headings, and each entry's bold headline as a bullet, then a link to the
// whole file. Run by release.yml: `node .github/scripts/release-notes.mjs 0.15.0`
// prints the notes, or exits 1 when the changelog has no section for it.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const CHANGELOG_URL = "https://github.com/boojyorg/boojy-notes/blob/master/CHANGELOG.md";

/** The notes for `version`, or null when CHANGELOG.md has no `## v<version>` section. */
export function releaseNotes(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((l) => l === `## v${version}` || l.startsWith(`## v${version} `));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  const out = [];
  for (const line of lines.slice(start + 1, end < 0 ? undefined : end)) {
    if (line.startsWith("### ")) {
      if (out.length) out.push("");
      out.push(line);
    } else {
      const headline = line.match(/^- \*\*(.+?)\*\*/);
      if (headline) out.push(`- ${headline[1]}`);
    }
  }
  out.push("", `Full details in [CHANGELOG.md](${CHANGELOG_URL}).`);
  return out.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  const notes = releaseNotes(fs.readFileSync("CHANGELOG.md", "utf-8"), version);
  if (notes === null) {
    console.error(`CHANGELOG.md has no "## v${version}" section.`);
    process.exit(1);
  }
  process.stdout.write(`${notes}\n`);
}
