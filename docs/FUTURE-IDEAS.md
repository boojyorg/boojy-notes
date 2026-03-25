# Future Ideas

Feature and improvement ideas for Boojy Notes, organized by effort and impact.

## High Value / Medium Effort

### 1. Backlinks Panel
Since wikilinks already exist, show "Notes that link to this note" in a sidebar panel. This transforms Boojy Notes from a note-taking app into a knowledge management tool. The wikilink data is already in block text; just need to build a reverse index.

### 3. Note Version History
Show previous versions of a note (leveraging the undo system or sync snapshots). Users could browse and restore past versions.

### 5. Keyboard Shortcut Cheat Sheet
No discoverable way to learn shortcuts. A `?` overlay or settings panel showing all shortcuts would help onboarding.

## High Value / Higher Effort

### 9. Math/LaTeX Blocks
A `math` block type that renders LaTeX via KaTeX. Common need for technical users.

### 10. Mermaid Diagram Blocks
Render diagrams from text using Mermaid.js. A `diagram` block type in the slash command menu.

## Medium Value / Low Effort

### 11. Export to PDF
Electron could use `webContents.printToPDF()`

### 12. Drag Blocks Between Panes
In split-pane mode, drag a block from one note to another.

### 13. Table Improvements
Column resizing (drag borders), row/column sorting, tab-to-next-cell navigation.

### 14. Image Lightbox Improvements
Zoom controls, pan, keyboard navigation between images in the same note.

### 15. Indent Guides
Visual lines connecting indented blocks to their parent, like in code editors.

## Nice to Have

### 18. Auto-Save Indicator
Small visual cue showing when the note was last saved / if there are unsaved changes.

