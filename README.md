# NoteStack

Inline annotation layer for VS Code — attach persistent, drift-aware, prioritized notes to any line or selection in your codebase, across all your projects, without modifying source files.

## Features

| Feature | Detail | Docs |
|---|---|---|
| **Inline annotations** | Attach notes to any line or selection — gutter icon, highlight, and hover tooltip | [Notes & Annotations](docs/NOTES.md) |
| **Priority & tags** | 🔴 High / 🟡 Medium / 🟢 Low / ✅ Completed, plus freeform `#hashtags` | [Notes & Annotations](docs/NOTES.md) |
| **Drift detection** | Warns when annotated line content has changed, with fuzzy-matched one-click re-anchoring | [Notes & Annotations](docs/NOTES.md#drift-detection) |
| **Notes Browser** | Full-panel view of every note across all workspaces — search, sort, filter, code preview | [Notes Browser](docs/NOTES_BROWSER.md) |
| **Code Tags** | Scans the workspace for `<author date p:N>` tags and standard keywords (`TODO`, `FIXME`, …) | [Code Tags](docs/CODE_TAGS.md) |
| **Docs Tree** | Scans every Markdown file in the workspace into a browsable, searchable tree | [Docs Tree](docs/DOCS_TREE.md) |
| **Cross-workspace & cloud sync** | Notes persist globally and can sync across machines via Dropbox/OneDrive/iCloud/Syncthing | [Cloud Sync & Collaboration](docs/CLOUD_SYNC.md) |
| **Import / Export** | Share notes between machines or teammates via portable JSON, or export everything to Markdown | [Import / Export](docs/IMPORT_EXPORT.md) |
| **Ticket & Slack linking** | Detects ticket references and Slack profile URLs, renders them as clickable links / `@mentions` | [Ticket Linking & Slack Mentions](docs/TICKET_LINKING.md) |
| **AI integration** | Send a note or code tag to Claude/ChatGPT via Browser Bridge, or zip the project for upload | [AI Integration](docs/AI_INTEGRATION.md) |

For settings, storage internals, and the full command list, see [Settings](docs/SETTINGS.md), [Storage & Data Format](docs/STORAGE.md), and [Commands](docs/COMMANDS.md).

## Quick Start

Place the cursor on a line — or select a range — then:

- **Keyboard:** `Ctrl+Shift+N` / `Cmd+Shift+N`
- **Right-click:** context menu → *Add / Remove Note*

Write your note, pick a priority, `Ctrl+Enter` to save. See [Notes & Annotations](docs/NOTES.md) for editing, moving, and re-anchoring notes.

Open the full-panel browsers from the NoteStack tree view header bar, or:

- **Notes Browser:** `Ctrl+Shift+Alt+B` / `Cmd+Shift+Alt+B`
- **Command Palette:** `NoteStack: Open Notes Browser` / `Open Code Tags Browser` / `Open Docs Browser`

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
