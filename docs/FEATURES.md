# NoteStack — Full Feature Reference

## Annotations

| Feature | Detail |
|---|---|
| **Inline annotations** | Attach multi-line notes to any file/line position via gutter icon + highlight |
| **Selection annotations** | Annotate a range of lines — selection boundaries are saved and restored when navigating to the note |
| **Drift detection** | Warns in hover tooltip if the annotated line content has changed since the note was created |
| **Moveable notes** | Pick up a note with right-click → Move Note, move cursor or selection, place with right-click → Place Note Here |
| **Time-aware tooltips** | Hover any annotated line to see the note, priority, author, and relative age e.g. `42m ago` |

## Priority & Status

| Feature | Detail |
|---|---|
| **Priority system** | Mark notes 🔴 High / 🟡 Medium / 🟢 Low / ✅ Completed — sorted and color-coded throughout the UI |
| **Completed status** | Mark notes as done — filtered out of the default view, greyed out when shown |
| **Private notes** | Mark a note as private — hidden from other machines sharing the same cloud folder |

## Browser Panel

| Feature | Detail |
|---|---|
| **Notes Browser** | Full-panel webview listing every note across all workspaces with search, sort and priority filtering |
| **Code preview** | Hover a note card in the browser to see a live inline code snippet around the annotated line |
| **Clickable URLs** | `http`, `https`, `ftp`, `mailto` links in note text are clickable in the browser panel |
| **Reference URLs** | Attach a Jira, Slack, Linear, GitHub, Notion, or any URL to a note — opens in browser |
| **Open workspace** | Click the workspace name on any card to open that project in a new window |

## Persistence & Sync

| Feature | Detail |
|---|---|
| **Global persistence** | Notes stored in VS Code's global storage — survive workspace deletion, visible across all instances |
| **Per-machine files** | Each machine writes its own `note-stack-<id>.json` — zero write conflicts in shared folders |
| **Cloud sync** | Point storage to Dropbox/iCloud/GDrive/Syncthing via settings for cross-machine sync |
| **Collaboration** | Share a cloud folder with your team — each member's notes merge automatically in the browser |
| **Local mirror** | `.vscode/note-stack.json` written in parallel so notes can be committed to git |
| **Export to Markdown** | Export all notes across all workspaces to a single `.md` file |

## UI

| Feature | Detail |
|---|---|
| **Tree view** | Sidebar panel grouped by file, sorted by priority then line |
| **Status bar** | Live note count — current file · workspace · global — click to open browser |
| **Author & machine** | Notes capture git user name, machine ID and hostname — visible in browser and hover tooltip |

## Commands

| Command | Keybind | Action |
|---|---|---|
| Add / Remove Note | `Ctrl+Shift+N` | Toggle note at cursor line or selection |
| Remove Note at Line | `Ctrl+Shift+D` | Remove note at cursor line |
| Open Notes Browser | `Ctrl+Shift+Alt+B` | Open the full browser panel |
| Show Notes in Current File | — | QuickPick list for the active file |
| Show All Notes in Workspace | `Ctrl+Shift+Alt+N` | QuickPick across all files |
| Export All Notes to Markdown | — | Saves all notes across all workspaces to `.md` |
| Clear All Notes in Workspace | — | Destructive wipe with confirmation |

## Settings

| Setting | Default | Description |
|---|---|---|
| `noteStack.storageLocation` | — | Custom directory for note files. Leave empty to use VS Code global storage. |
| `noteStack.showSharedNotes` | `false` | Merge notes from all machines in the storage folder |
| `noteStack.noteCountThreshold` | `300` | Note count at which a performance warning is shown |
| `noteStack.browserInlineCodePreview` | `true` | Show code snippet on hover in the browser panel |
| `noteStack.browserInlineCodePreviewContextLines` | `4` | Lines of context shown above and below the annotated line in the preview |