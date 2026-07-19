# Cloud Sync & Collaboration

[← Back to README](../README.md)

NoteStack supports cloud sync and lightweight team collaboration by pointing the storage location to any synced folder.

Edit your VS Code `settings.json`:

```json
{
  "noteStack.storageLocation": "/path/to/your/cloud/folder/NoteStack",
  "noteStack.showSharedNotes": true
}
```

Each machine writes its own `note-stack-<machineId>.json` file — no write conflicts. When `showSharedNotes` is enabled, the [Notes Browser](NOTES_BROWSER.md) merges notes from all machines in the folder. Private notes are only visible on the machine that created them.

Tested with **Dropbox**, **OneDrive**, **iCloud Drive**, and **Syncthing**. Create a dedicated subfolder rather than placing notes in the root of your cloud folder.

## Related

- [Storage & Data Format](STORAGE.md) — file layout and JSON schema
- [Settings](SETTINGS.md) — `storageLocation`, `showSharedNotes`
- [Import / Export](IMPORT_EXPORT.md) — a one-off alternative to live folder sync
