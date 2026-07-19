# Docs Tree

[← Back to README](../README.md)

NoteStack scans every Markdown file in the workspace and surfaces it in a **Docs** branch in the NoteStack tree, plus a dedicated full-panel browser — mirroring the [Code Tags](CODE_TAGS.md) tree and browser pattern.

## What gets scanned

- Glob: `**/*.md` — every Markdown file anywhere in the workspace.
- Always excluded: `node_modules`, `.git`, `dist`, `out`, `build`, `.next`, `vendor`.
- License files are always skipped, regardless of location — any `.md` whose name matches `license` (e.g. `LICENSE.md`, `MIT-LICENSE.md`, `THIRD_PARTY_LICENSES.md`).
- To exclude additional files or directories, add a `.nsignore` file to the workspace root using `.gitignore` syntax — rules are layered on top of the defaults above. Changing `.nsignore` triggers a full rescan automatically.
- Edits, creates, and deletes are picked up live via a file watcher — no manual rescan needed for normal editing.

## Title & preview extraction

For each doc, NoteStack extracts:

- **Title** — the first heading (`#` through `######`), after stripping any YAML front matter (`---`…`---`). Falls back to the filename (without extension) if no heading is found.
- **Preview** — the first non-empty paragraph after the title, skipping headings, code fences, blockquotes, tables, and horizontal rules. List markers and inline formatting (`` ` ``, `*`, `_`, `~`, `[text](url)`, `![alt](url)`) are stripped, truncated to 220 characters.

## Docs tree

A **Docs** root node appears in the NoteStack tree alongside **Code Tags**, using the book icon — only shown once at least one doc is found. Expanding it lists every doc alphabetically by relative path, labeled with its extracted title, with the relative path shown as the description/tooltip.

## Docs Browser

Opens a full panel listing every scanned doc as a card — title, relative path (click to copy), last-modified date and relative age, file size, and the extracted preview snippet.

- **Button:** book icon in the NoteStack tree view header bar
- **Command Palette:** `NoteStack: Open Docs Browser`

**Search** filters cards by substring match across title, path, and preview. **Sort** by path (default), newest, oldest, or size.

## Opening a doc

Clicking a doc's title — from either the tree or the browser — opens it directly in VS Code's built-in Markdown **preview** (rendered, not source), in the first editor column.

## Related

- [Code Tags](CODE_TAGS.md) — the same scan/tree/browser pattern applied to source comments
