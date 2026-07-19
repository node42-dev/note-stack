# Import / Export

[← Back to README](../README.md)

Share notes between machines or teammates via a portable JSON file, without setting up [cloud sync](CLOUD_SYNC.md).

## Export Notes to File

- **Button:** archive icon in the NoteStack tree view header bar (not in the Command Palette).
- Prompts you to pick which workspace(s) to include (multi-select), then saves a JSON file — default name `notestack-export.json`.
- Exports from *this machine's* store, which holds every workspace ever opened on this machine, not just the currently open one.

## Import Notes from File

- **Button:** inbox icon in the NoteStack tree view header bar (not in the Command Palette).
- Pick a previously exported JSON file. Notes are merged into this machine's store per workspace and file.
- **Deduplication is by note ID** — a note already present with the same id is skipped; everything else is added. Safe to re-import the same file without creating duplicates.
- If the imported file contains notes for the workspace you currently have open, the tree/browser refresh immediately to show them.

## Export All Notes to Markdown

A separate, simpler export — flattens every note across every workspace into a single human-readable `.md` file. Not intended for re-import; use *Export Notes to File* above for machine-to-machine transfer.

- **Command Palette:** `NoteStack: Export All Notes to Markdown`

## Related

- [Storage & Data Format](STORAGE.md) — the underlying JSON schema
- [Cloud Sync & Collaboration](CLOUD_SYNC.md) — for continuous sync instead of one-off transfers
