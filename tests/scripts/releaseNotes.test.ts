import { describe, expect, it } from "vitest";
import { releaseNotes } from "../../.github/scripts/release-notes.mjs";

const CHANGELOG = `# Changelog

## Unreleased

### Bug Fixes

- **Not yet** — Unreleased.

## v1.2.0 — 2026-10-06

### Features

- **A thing** — It does a thing.

### Bug Fixes

- **A fix** — Fixed. With **bold** inside.
- **Another fix** — Also fixed.

## v1.1.0 — 2026-10-01

- **Older** — Not in 1.2.0.
`;

describe("releaseNotes", () => {
  it("lists one version's headings and headlines, then links the changelog", () => {
    expect(releaseNotes(CHANGELOG, "1.2.0")).toBe(
      [
        "### Features",
        "- A thing",
        "",
        "### Bug Fixes",
        "- A fix",
        "- Another fix",
        "",
        "Full details in [CHANGELOG.md](https://github.com/boojyorg/boojy-notes/blob/master/CHANGELOG.md).",
      ].join("\n"),
    );
  });

  it("is null for a version the changelog has no section for, and never matches a prefix", () => {
    expect(releaseNotes(CHANGELOG, "1.3.0")).toBeNull();
    expect(releaseNotes(CHANGELOG, "1.2")).toBeNull();
  });
});
