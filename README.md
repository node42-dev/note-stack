# NoteStack

Inline annotation layer for VS Code — attach persistent, drift-aware, prioritized notes to any line or selection in your codebase, across all your projects, without modifying source files.

## Features

| Feature                | Detail |
|------------------------|--------|
| **Inline annotations** | Attach notes to any line or selection — gutter icon, highlight, and hover tooltip |
| **Priority system**    | 🔴 High / 🟡 Medium / 🟢 Low / ✅ Completed — sorted and color-coded throughout |
| **Tags** | Organize notes using `#hashtags` anywhere in the note text |
| **Notes Browser**      | Full-panel view of every note across all workspaces — search, sort, filter, code preview on hover |
| **Cross-workspace**    | Notes persist globally across all VS Code instances and survive workspace deletion |
| **Cloud sync**         | Point storage to any synced folder (Dropbox, OneDrive, iCloud) for cross-machine sync and team collaboration |
| **Import / Export**    | Share notes between machines or team members via portable JSON export — merge without duplicates |
| **Drift detection**    | Warns when annotated line content has changed since the note was created |
| **Re-anchor**          | Drift-detected notes show fuzzy-matched candidate lines with one-click re-anchoring |
| **Reference URLs**     | Attach any URL to a note — Jira, GitHub, Slack, Outlook, Notion — opens directly from the browser panel |
| **Ticket Linker**      | Detects ticket references in note text and renders them as clickable links |
| **Slack Mentions**     | Detects Slack profile URLs and renders them as `@mentions` |
| **Export**             | Export all notes across all workspaces to a single Markdown file |
| **Code Tags**          | Scans the workspace for `<author date p:N>` tags and standard keywords (`TODO`, `FIXME`, …) — listed in a dedicated *Code Tags* branch of the tree, click to jump directly to the line |

For the detailed feature reference, see [docs/FEATURES.md](FEATURES.md).

## Usage

### Add / Edit a Note

Place cursor on the target line — or select a range of lines — then:

- **Keyboard:** `Ctrl+Shift+N` / `Cmd+Shift+N`
- **Right-click:** context menu → *Add / Remove Note*

The note editor opens as a panel. Write your note, select a priority, optionally attach a reference URL and mark as private, then `Ctrl+Enter` to save or `Escape` to cancel. If a note already exists on that line, the editor opens pre-populated for editing.

NoteStack supports basic formatting in the browser panel:

| Syntax               | Result                      |
|----------------------|-----------------------------|
| `` `code` ``         | Inline code highlight       |
| ` ```multi line``` ` | Code block                  |
| `http://...`         | Clickable link              |
| `N42-123`            | Ticket link (if configured) |

### Selection Annotations

Select one or more lines before adding a note — the selection range is saved alongside the note. When you navigate to the note later, the original selection is restored and highlighted in the editor.

### Move a Note

Place cursor on the line with an existing note — or make a selection to re-anchor the range — then:

- **Right-click:** context menu → *Move Note*

Move the cursor (or make a new selection) at the target position, then:

- **Right-click:** context menu → *Place Note Here*

Works across files in the same workspace. The moved note inherits the new line, character, and selection range. Click *Cancel* in the notification to abort.

### Notes Browser

Opens a full panel showing **all notes across all workspaces** with search, sort and priority filter:

- **Button:** preview icon in the NoteStack tree view header bar
- **Keyboard:** `Ctrl+Shift+Alt+B` / `Cmd+Shift+Alt+B`
- **Command Palette:** `NoteStack: Open Notes Browser`

### Note Cards

Each card shows workspace, file, line, author, machine, timestamp, relative age, and full note body. 
- Click the location info in the top-right corner of the note card to preview a live code snippet around the annotated line. 

- Click the note title to jump directly to the file and annotated line — including files from other workspaces. 

- Click the workspace name to open the file in its own project in a new window.

### Priority

Set priority when saving a note via the dropdown:

| Priority    | Icon | Use                                 |
|-------------|------|-------------------------------------|
| High        |  🔴  | Blocking issues, critical paths     |
| Medium      |  🟡  | Important but non-blocking          |
| Low         |  🟢  | Nice-to-have, minor observations    |
| Completed   |  ✅  | Resolved — hidden from default view |
| No Priority |  ⚪  | General annotations                 |

Notes are sorted priority-first throughout the tree view, browser panel, and QuickPick lists. Completed notes are filtered out of the default `All` view and shown only when the `Completed` filter is selected.

### Tags

You can organize notes using hashtags anywhere in the note text (e.g. `#bug`, `#refactor`, `#work`).

- Tags are automatically detected and shown as clickable pills in the **Notes Browser**.
- Click one or more tag pills to filter the list.
- Multiple tags can be selected (AND logic).

**Example note:**
Fix race condition here **#bug** **#performance** N42-187

The note will appear under both `#bug` and `#performance` filters.

### Code Tags

NoteStack scans every source file in the workspace and surfaces inline code tags in a dedicated **Code Tags** branch at the bottom of the NoteStack tree. Click any entry to open the file and scroll directly to the tagged line.

Two tag formats are recognised:

**1. Custom codetag** — a metadata stamp embedded anywhere in a comment block:

```
<identifier YYYY-MM-DD p:N>
```

| Field        | Example        | Description                       |
|--------------|----------------|-----------------------------------|
| `identifier` | `a1exnd3r`     | Author or machine ID              |
| `YYYY-MM-DD` | `2026-05-02`   | Date the tag was written          |
| `p:N`        | `p:1`          | Priority: 0 (info) → 3 (critical) |

Example usage in a block comment:
```typescript
/**
  ISSUE: setContext round-trip causes laggy context menu toggle.

  FIX: replace with a single toggleNote command that reads state internally.

  <a1exnd3r 2026-05-02 p:2>
*/
```

The description shown in the tree is extracted automatically from the surrounding comment text above the tag line.

**2. Standard keyword** — any recognised keyword found in a comment line or block:

```
// TODO: fix memory leak
// FIXME urgent <a1exnd3r 2026-05-02 p:1>
/* HACK: workaround for upstream bug */
```

When a keyword and a `<author date p:N>` tag appear on the same line, they are merged into a single entry — the keyword is shown as the tag type and the codetag provides the author, date, and priority metadata.

#### Priority colours

| Level | Colour | When to use |
|-------|--------|-------------|
| `p:0` | 🔴 Red    | Critical / blocking |
| `p:1` | 🟠 Orange | High priority |
| `p:2` | 🟡 Yellow | Medium priority |
| `p:3` | 🔵 Blue   | Low priority |
| `p:4` | 🟢 Green  | Info / nice-to-have |

Tags without priority metadata use the default `tag` icon.

#### Scanned file types

`ts tsx js jsx mjs cjs py java c cpp h hpp cs go rb rs php swift kt scala vue svelte`

The following directories are always excluded regardless of workspace structure: `node_modules`, `dist`, `out`, `build`, `.next`, `vendor`, `.git`.

#### Configuring keywords

The keyword list is fully configurable via `noteStack.codeTagKeywords` in Settings — changes trigger an automatic re-scan. See [Settings](#settings) below.

---

### Cloud Sync & Collaboration

NoteStack supports cloud sync and lightweight team collaboration by pointing the storage location to any synced folder.

Edit your VS Code `settings.json`:

```json
{
  "noteStack.storageLocation": "/path/to/your/cloud/folder/NoteStack",
  "noteStack.showSharedNotes": true
}
```

Each machine writes its own `note-stack-<machineId>.json` file — no write conflicts. When `showSharedNotes` is enabled, the browser panel merges notes from all machines in the folder. Private notes are only visible on the machine that created them.

Tested with **Dropbox**, **OneDrive**, **iCloud Drive**, and **Syncthing**. Create a dedicated subfolder rather than placing notes in the root of your cloud folder.

### Ticket Linking

NoteStack automatically detects ticket references in note text and renders them as clickable links in the Notes Browser. Supports Jira, Linear, GitHub Issues, and any custom tracker.

Configure in `settings.json`:

```json
"codeNotes.ticketTrackers": [
  { "prefixes": ["N42", "FEAT"], "system": "jira",    "baseUrl": "https://yourco.atlassian.net"     },
  { "prefixes": ["LIN"],         "system": "linear",  "baseUrl": "https://linear.app/yourworkspace" },
  { "prefixes": ["GH"],          "system": "github",  "baseUrl": "https://github.com/org/repo"      },
  { "prefixes": ["TASK"],        "system": "custom",  "baseUrl": "https://tracker.io/issues/{key}"  }
]
```
Any note containing a matching ticket ID — e.g. `N42-123` or `FEAT-123` — will render the ID as a direct link to that ticket in the browser panel. Multiple prefixes can point to the same tracker instance.

| System   | URL format                                          |
|----------|-----------------------------------------------------|
| `jira`   | `https://<instance>.atlassian.net/browse/<KEY-123>` |
| `linear` | `https://linear.app/<workspace>/issue/<KEY-123>`    |
| `github` | `https://github.com/<org>/<repo>/issues/<number>`   |
| `custom` | any URL with `{key}` placeholder                    |

### Slack Mention

Converts Slack profile URLs into `@mention` style links.
 ```bash
# Labeled:
[Alex](https://workspace.slack.com/team/U0ATJSRKMLN)
  → <a href="...U0ATJSRKMLN" class="mention">@Alex</a>
 
# Bare URL: 
https://workspace.slack.com/team/U04TCCVB2
  → <a href="..." class="mention">@U04TCCVB2</a>
```
**Slack user IDs**: `U`... (regular) or `W`... (Enterprise Grid), 8+ uppercase alphanumerics.
 
## Drift detection

The feature warns you when annotated content has changed since the note was created. NoteStack scans the document for the original anchor text and surfaces the top fuzzy-matched candidate lines directly in the hover tooltip — ranked by similarity. 

**One-click re-anchoring** updates the note's position, anchor, and selection range in place, without opening an editor.

### Known Limitations

NoteStack anchors notes to specific line positions without modifying your source files. When code is added, removed, or rearranged, note positions can become outdated — this is a common limitation of all external annotation tools that don't pollute your codebase. **Drift Detection is specifically designed to mitigate this issue**.

## Settings

| Setting | Default | Description |
|---|---|---|
| `noteStack.storageLocation` | — | Custom directory for note files. Leave empty to use VS Code global storage. |
| `noteStack.showSharedNotes` | `false` | Merge notes from all machines in the storage folder |
| `noteStack.noteCountThreshold` | `300` | Note count at which a performance warning is shown |
| `noteStack.browserInlineCodePreview` | `true` | Show code snippet on hover in the browser panel |
| `noteStack.browserInlineCodePreviewContextLines` | `4` | Lines of context shown above and below the annotated line in the preview |
| `noteStack.codeTagKeywords` | `["ISSUE","TODO","FIXME","FIX","HACK","IDEA","PORT","BUG","DEPRECATED","REFACTOR","NOTE","REFERENCE","OPTIMIZE","REVIEW","XXX"]` | Keywords scanned for in comments and shown in the Code Tags tree. Case-insensitive. Changes trigger an automatic re-scan. |

## Storage

Notes are written to two locations on every save:

```
# Primary — per machine, shared across all VS Code instances
<globalStorageUri>/note-stack-<machineId>.json

# Secondary — per workspace, git-trackable
<workspaceRoot>/.vscode/note-stack.json
```

The global store is keyed by workspace URI. On first launch with an existing `.vscode/note-stack.json`, notes are automatically migrated to global storage.

To commit notes to source control, add `.vscode/note-stack.json` to your repository. To exclude them, add it to `.gitignore`.

### Data Format

```jsonc
// note-stack-<machineId>.json
{
  "file:///home/user/projects/myapp": {
    "src/server.ts": [
      {
        "id": "c9a41cf4-...",
        "line": 42,
        "character": 0,
        "note": "Race condition here under high load — see issue #42",
        "timestamp": "4/2/2026, 4:42:00 AM",
        "priority": "high",
        "author": "Alex",
        "machineId": "4b82d310...",
        "hostName": "n42",
        "private": false,
        "anchor": "private init ...",
        "textSel": {
          "startLine": 42,
          "endLine": 45,
          "startChar": 0,
          "endChar": 3
        },
        "refUrl": "https://github.com/org/repo/issues/42",
        "commitHash": "fe8b06d5..."
      }
    ]
  }
}
```
Priority is categorized as `high` | `medium` | `low` | `completed` or absent.

## Other Commands

| Command | Keybind | Action |
|---|---|---|
| Add / Remove Note | `Ctrl+Shift+N` | Toggle note at cursor line or selection |
| Remove Note at Line | `Ctrl+Shift+D` | Remove note at cursor line |
| Show Notes in Current File | — | QuickPick list for the active file |
| Show All Notes in Workspace | `Ctrl+Shift+Alt+N` | QuickPick across all files |
| Export All Notes to Markdown | — | Saves all notes across all workspaces to `.md` |
| Clear All Notes in Workspace | — | Destructive wipe with confirmation |

## Build & Install

```bash
npm install
npm run compile
npm run package
npx @vscode/vsce package --no-dependencies --out dist/
code --install-extension "dist/note-stack-$(node -e "console.log(require('./package.json').version)").vsix"
```

## Requirements

- VS Code `^1.74.0`
- Node.js `^16` (build only)

## License

MIT — see [LICENSE.txt](LICENSE.txt)

## Author

**Alex Olsson** \
**[LinkedIn](https://www.linkedin.com/in/alex-o-33165720)**