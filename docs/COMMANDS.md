# Commands

[← Back to README](../README.md)

## Keyboard shortcuts

| Command | Keybind | Action |
|---|---|---|
| Add / Remove Note | `Ctrl+Shift+N` / `Cmd+Shift+N` | Toggle note at cursor line or selection (editor focus required) |
| Remove Note at Line | `Ctrl+Shift+D` / `Cmd+Shift+D` | Remove note at cursor line (only when a note exists there) |
| Show All Notes in Workspace | `Ctrl+Shift+Alt+N` / `Cmd+Shift+Alt+N` | QuickPick across all files |
| Open Notes Browser | `Ctrl+Shift+Alt+B` / `Cmd+Shift+Alt+B` | Open the [Notes Browser](NOTES_BROWSER.md) panel |

## Editor right-click menu

| Command | When shown |
|---|---|
| Add / Remove Note | No note on the current line |
| Remove Note at Line | A note exists on the current line |
| Move Note | A note exists on the current line and no move is in progress |
| Place Note Here | A note move is in progress ([Move a Note](NOTES.md#move-a-note)) |

## NoteStack tree view toolbar

| Command | Icon |
|---|---|
| Open Notes Browser | note |
| Open Code Tags Browser | tag |
| Open Docs Browser | book |
| Import Notes from File | inbox — see [Import / Export](IMPORT_EXPORT.md) |
| Export Notes to File | archive — see [Import / Export](IMPORT_EXPORT.md) |
| Export All Notes to Markdown | markdown |
| Force Refresh | refresh — re-scans notes, code tags, and docs |
| Collapse All | collapse-all |

## Tree item inline actions (hover a note)

| Command | Shown when |
|---|---|
| Send Note to AI | Browser Bridge extension installed — see [AI Integration](AI_INTEGRATION.md) |
| Edit Note | Always |
| Open Reference URL | Note has a reference URL attached |
| Remove Note | Always |

Code tags additionally show **Send Code Tag to AI** when Browser Bridge is installed.

## Explorer context menu

| Command | When shown |
|---|---|
| Zip Project | Right-clicking a folder that is an open workspace root — see [AI Integration § Zip Project](AI_INTEGRATION.md#zip-project) |

## Command Palette only

These have no dedicated keybind or toolbar button:

| Command | Action |
|---|---|
| Show Notes in Current File | QuickPick list for the active file |
| Clear All Notes in Workspace | Destructive wipe with confirmation |

`Export Notes to File` and `Import Notes from File` are **toolbar-only** — they do not appear in the Command Palette.
