# Settings

[← Back to README](../README.md)

All settings live under the `noteStack.*` namespace in VS Code's Settings UI or `settings.json`.

| Setting | Default | Description |
|---|---|---|
| `noteStack.storageLocation` | `""` | Custom directory for `note-stack-<appId>.json`. Leave empty to use VS Code's global storage. Set to a Dropbox/iCloud/GDrive folder for [cloud sync](CLOUD_SYNC.md). |
| `noteStack.showSharedNotes` | `true` | Show notes created on other machines. When disabled, only notes from this machine are shown. |
| `noteStack.noteCountThreshold` | `300` | Note count at which a performance warning is shown in the browser panel. |
| `noteStack.browserCodePreview` | `true` | Show a code snippet preview when hovering over a note card in the [Notes Browser](NOTES_BROWSER.md). |
| `noteStack.browserCodePreviewLines` | `4` | Lines of context shown above and below the annotated line in the browser panel code preview. |
| `noteStack.slackTeamId` | `""` | Slack workspace/team ID (e.g. `T01EYMQ3B`), found in your Slack web URL: `app.slack.com/client/<TEAM_ID>/...`. Required for [Slack mentions](TICKET_LINKING.md#slack-mentions) to deep-link correctly. |
| `noteStack.maxProjectSizeForZip` | `30` | Maximum size (MB) for the zip produced by [Zip Project](AI_INTEGRATION.md#zip-project). Matches Claude.ai's 30 MB chat upload cap by default — the zip is deleted and an error shown if it comes out larger. |
| `noteStack.codeTagBlameDrift` | `false` | Compare each [code tag](CODE_TAGS.md)'s date against the `git blame` date for that line. Disabled by default — enabling it runs `git blame` for each tagged line during workspace scan. |
| `noteStack.codeTagKeywords` | `["ISSUE", "TODO", "FIXME", "FIX", "HACK", "IDEA", "PORT", "BUG", "DEPRECATED", "REFACTOR", "NOTE", "REFERENCE", "OPTIMIZE", "REVIEW", "XXX"]` | Keywords scanned for in comments and shown in the [Code Tags](CODE_TAGS.md) tree. Case-insensitive. Changes trigger an automatic re-scan. |
| `noteStack.ticketTrackers` | `[]` | Tracker configurations for auto-linking ticket IDs in note text — see [Ticket Linking](TICKET_LINKING.md). Each entry: `prefixes` (string array), `system` (`jira` \| `linear` \| `github` \| `custom`), `baseUrl`. |

There is no setting to disable [Docs Tree](DOCS_TREE.md) scanning or configure its exclude patterns — use a `.nsignore` file instead.
