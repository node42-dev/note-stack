# Notes Browser

[← Back to README](../README.md)

A full panel showing **all notes across all workspaces**, with search, sort, and priority filtering.

## Open it

- **Button:** preview icon in the NoteStack tree view header bar
- **Keyboard:** `Ctrl+Shift+Alt+B` / `Cmd+Shift+Alt+B`
- **Command Palette:** `NoteStack: Open Notes Browser`

## What it shows

Each note is rendered as a card — see [Note Cards](NOTES.md#note-cards) for what each card displays and its click behaviors.

- **Search** — free-text filter across note text, file, and author.
- **Sort / filter by priority** — see [Priority](NOTES.md#priority).
- **Tag pills** — filter by one or more `#hashtag`, see [Tags](NOTES.md#tags).
- **Code preview on hover** — controlled by `noteStack.browserCodePreview` and `noteStack.browserCodePreviewLines`, see [Settings](SETTINGS.md).
- **Reference URLs and ticket links** render as clickable links — see [Ticket Linking](TICKET_LINKING.md).
- **Slack mentions** render as `@name` links — see [Ticket Linking § Slack Mentions](TICKET_LINKING.md#slack-mentions).

## Related

- [Notes & Annotations](NOTES.md) — how notes are created and edited
- [Cloud Sync & Collaboration](CLOUD_SYNC.md) — merging notes from teammates' machines into this panel
