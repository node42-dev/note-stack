# Notes & Annotations

[← Back to README](../README.md)

Attach a persistent note to any line or selection without modifying the source file itself.

## Add / Edit a Note

Place the cursor on the target line — or select a range of lines — then:

- **Keyboard:** `Ctrl+Shift+N` / `Cmd+Shift+N`
- **Right-click:** context menu → *Add / Remove Note*

The note editor opens as a panel. Write your note, select a priority, optionally attach a reference URL and mark as private, then `Ctrl+Enter` to save or `Escape` to cancel. If a note already exists on that line, the editor opens pre-populated for editing.

NoteStack supports basic formatting in the browser panel:

| Syntax               | Result                      |
|----------------------|-----------------------------|
| `` `code` ``         | Inline code highlight       |
| ` ```multi line``` ` | Code block                  |
| `http://...`         | Clickable link              |
| `N42-123`            | Ticket link (if configured — see [Ticket Linking](TICKET_LINKING.md)) |

## Selection Annotations

Select one or more lines before adding a note — the selection range is saved alongside the note. When you navigate to the note later, the original selection is restored and highlighted in the editor.

## Move a Note

Place the cursor on the line with an existing note — or make a selection to re-anchor the range — then:

- **Right-click:** context menu → *Move Note*

Move the cursor (or make a new selection) to the target position, then:

- **Right-click:** context menu → *Place Note Here*

Works across files in the same workspace. The moved note inherits the new line, character, and selection range. Click *Cancel* in the notification to abort.

## Priority

Set priority when saving a note via the dropdown:

| Priority    | Icon | Use                                 |
|-------------|------|--------------------------------------|
| High        |  🔴  | Blocking issues, critical paths     |
| Medium      |  🟡  | Important but non-blocking          |
| Low         |  🟢  | Nice-to-have, minor observations    |
| Completed   |  ✅  | Resolved — hidden from default view |
| No Priority |  ⚪  | General annotations                 |

Notes are sorted priority-first throughout the tree view, browser panel, and QuickPick lists. Completed notes are filtered out of the default `All` view and shown only when the `Completed` filter is selected.

## Tags

Organize notes using hashtags anywhere in the note text (e.g. `#bug`, `#refactor`, `#work`).

- Tags are automatically detected and shown as clickable pills in the [Notes Browser](NOTES_BROWSER.md).
- Click one or more tag pills to filter the list.
- Multiple tags can be selected (AND logic).

**Example note:**
Fix race condition here **#bug** **#performance** N42-187

The note will appear under both `#bug` and `#performance` filters.

## Note Cards

Each card shows workspace, file, line, author, machine, timestamp, relative age, and full note body.

- Click the location info in the top-right corner of the note card to preview a live code snippet around the annotated line.
- Click the note title to jump directly to the file and annotated line — including files from other workspaces.
- Click the workspace name to open the file in its own project in a new window.

## Drift Detection

Warns you when annotated content has changed since the note was created. NoteStack scans the document for the original anchor text and surfaces the top fuzzy-matched candidate lines directly in the hover tooltip — ranked by similarity.

**One-click re-anchoring** updates the note's position, anchor, and selection range in place, without opening an editor.

### Known Limitations

NoteStack anchors notes to specific line positions without modifying your source files. When code is added, removed, or rearranged, note positions can become outdated — this is a common limitation of all external annotation tools that don't pollute your codebase. Drift Detection is specifically designed to mitigate this issue.

## Related

- [Notes Browser](NOTES_BROWSER.md) — full-panel view across all workspaces
- [Storage & Data Format](STORAGE.md) — where notes are saved and their JSON shape
- [Import / Export](IMPORT_EXPORT.md) — sharing notes between machines or teammates
