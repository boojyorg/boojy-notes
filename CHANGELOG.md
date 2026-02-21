# Changelog

## Unreleased

### Features
- Replace settings overlay modal with full Settings tab in editor area
- Settings opens via ● sync dot as a singleton tab (no duplicates)
- Settings page with three sections: Boojy Cloud, Appearance, About
- Boojy Cloud section with sign-in buttons (Google, Apple, Email) — visual only for now
- Appearance section with font size +/- controls and disabled spell check toggle ("coming soon")
- About section with N●tes wordmark, version + check for updates, Made by Tyr @ boojy.org
- Move New Note and New Folder creation into sidebar as inline "+ New Folder" and "+ New Note" buttons
- Add `createFolder` function with auto-rename mode and duplicate name handling
- Custom folders persist to localStorage and survive page refreshes

- Settings v2: card wrappers, smaller centered sign-in buttons, branded About section
- Per-note seeded star fields — each note has its own unique sky
- Star field no longer flashes on sidebar drag or window resize

### Improvements
- Simplify top bar right section — remove create buttons, keep only panel toggle, word count, and help
- Folder/note sections separated by spacing instead of divider line
- Create buttons hidden during search to avoid clutter
