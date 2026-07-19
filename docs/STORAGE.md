# Storage & Data Format

[← Back to README](../README.md)

Notes are written to two locations on every save:

```
# Primary — per machine, shared across all VS Code instances
<globalStorageUri>/note-stack-<machineId>.json

# Secondary — per workspace, git-trackable
<workspaceRoot>/.vscode/note-stack.json
```

The global store is keyed by workspace URI. On first launch with an existing `.vscode/note-stack.json`, notes are automatically migrated to global storage.

To commit notes to source control, add `.vscode/note-stack.json` to your repository. To exclude them, add it to `.gitignore`.

## Data Format

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

## Related

- [Cloud Sync & Collaboration](CLOUD_SYNC.md) — pointing `storageLocation` at a synced folder
- [Import / Export](IMPORT_EXPORT.md) — how this JSON is packaged for portable transfer
- [Settings](SETTINGS.md) — `storageLocation`
