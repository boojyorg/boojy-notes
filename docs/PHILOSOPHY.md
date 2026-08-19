# Boojy Notes — product philosophy

**Status:** binding. Feature plans, reviews, and UI decisions are judged against this
document. If a proposal conflicts with it, the proposal changes, not the philosophy.

## The core

> **Boojy Notes is a simple editor for Markdown files you own.**
>
> Common note-taking should be obvious. Advanced syntax may be supported quietly.
> Unsupported Markdown must be preserved. Features do not earn permanent UI merely
> because Boojy can support them.

## The preservation promise

> **Editing one part of a Markdown file must not unexpectedly rewrite the rest of it.
> Unsupported syntax should be preserved, not "cleaned up".**

This is a product requirement, not an implementation detail. It is what makes it safe
to point Boojy at a folder of Markdown you care about.

On Obsidian: Boojy does **not** promise Obsidian-vault feature parity. The promise is
narrower and stronger: **Boojy can work directly with the Markdown files in an Obsidian
vault without damaging syntax it doesn't understand.** Plugins, Canvas, `.obsidian`
config, and the rest of the workspace are out of scope.

Enforcement: `tests/utils/preservation.test.js` runs a corpus of deliberately awkward
files (`tests/fixtures/preservation/`) through the real load→save path. Known failures
are marked in the suite, never omitted — the suite is the honest record of how far the
promise currently holds.

## Support levels

Every piece of Markdown syntax Boojy encounters sits at exactly one level. An Obsidian
feature does not need to be a Boojy feature just because Boojy can parse its syntax.

| Level | Meaning | Examples |
|---|---|---|
| **Native** | Boojy creates, edits, and renders it as a first-class feature | headings, lists, checkboxes, tables, images, code, quotes |
| **Compatible** | Boojy understands and renders it, but keeps the UI quiet — no permanent chrome, no promotion in menus | `[[wikilinks]]`, `#tags`, callouts, frontmatter |
| **Preserved** | Boojy may not render it meaningfully, but must never destroy or rewrite it | plugin syntax, block refs `^id`, `%%comments%%`, unknown YAML |
| **Out of scope** | No dedicated Boojy feature or UI, ever-until-argued-otherwise | graph view, canvas, databases, plugins, AI |

Moving something *up* a level (e.g. promoting a Compatible feature to Native UI) is a
product decision that needs the question answered: *does a first-time user's five
minutes get better or busier?*

## Consequences for UI

- The default surface stays small: folders, search, notes, one editor. Power lives
  behind typing (`/`, `[[`, `#`) and search, not behind permanent panels.
- A feature that demands a permanent sidebar, header control, or panel starts from
  "probably no".
- Opening a note replaces the current note. Tabs, split view, and workspace machinery
  were removed outright (2026-08-18, single-active-note refactor) — the code lives only
  in git history, and they earn UI again only if simplicity survives the argument.

*Related: `docs/SPEC-markdown-source-of-truth.md` (blocks must round-trip to markdown —
the other direction of the same contract).*
