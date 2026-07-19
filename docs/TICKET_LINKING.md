# Ticket Linking & Slack Mentions

[← Back to README](../README.md)

## Ticket Linking

NoteStack automatically detects ticket references in note text and renders them as clickable links in the [Notes Browser](NOTES_BROWSER.md). Supports Jira, Linear, GitHub Issues, and any custom tracker.

Configure in `settings.json`:

```jsonc
"noteStack.ticketTrackers": [
  { "prefixes": ["N42", "FEAT"], "system": "jira",    "baseUrl": "https://yourco.atlassian.net"     },
  { "prefixes": ["LIN"],         "system": "linear",  "baseUrl": "https://linear.app/yourworkspace" },
  { "prefixes": ["GH"],          "system": "github",  "baseUrl": "https://github.com/org/repo"      },
  { "prefixes": ["TASK"],        "system": "custom",  "baseUrl": "https://tracker.io/issues/{key}"  }
]
```

Any note containing a matching ticket ID — e.g. `N42-123` or `FEAT-123` — will render the ID as a direct link to that ticket in the browser panel. Multiple prefixes can point to the same tracker instance.

| System   | URL format                                          |
|----------|------------------------------------------------------|
| `jira`   | `https://<instance>.atlassian.net/browse/<KEY-123>` |
| `linear` | `https://linear.app/<workspace>/issue/<KEY-123>`    |
| `github` | `https://github.com/<org>/<repo>/issues/<number>`   |
| `custom` | any URL with `{key}` placeholder                    |

## Slack Mentions

Converts Slack profile URLs into `@mention` style links.

```bash
# Labeled:
[Alex](https://workspace.slack.com/team/U0ATJSRKMLN)
  → <a href="...U0ATJSRKMLN" class="mention">@Alex</a>

# Bare URL:
https://workspace.slack.com/team/U04TCCVB2
  → <a href="..." class="mention">@U04TCCVB2</a>
```

**Slack user IDs:** `U`... (regular) or `W`... (Enterprise Grid), 8+ uppercase alphanumerics.

Set `noteStack.slackTeamId` (found in your Slack web URL, `app.slack.com/client/<TEAM_ID>/...`) so `@mentions` deep-link into your Slack workspace correctly.

## Related

- [Notes Browser](NOTES_BROWSER.md) — where these links render
- [Settings](SETTINGS.md) — `ticketTrackers`, `slackTeamId`
