# AI Integration

[← Back to README](../README.md)

Two features help hand context to an AI assistant without manual copy-pasting.

## Send Note / Code Tag to AI

Sends a note or code tag as structured context to **Browser Bridge** ([node42.browser-bridge-vscode](https://marketplace.visualstudio.com/items?itemName=node42.browser-bridge-vscode)), a separate extension that relays it into a Claude or ChatGPT browser tab.

- **Requires Browser Bridge to be installed.** Without it, invoking the command shows: *"Browser Bridge extension is not installed. Install it to send notes to Claude or ChatGPT."*
- **Right-click a note or code tag** in the tree or browser panel → *Send Note to AI* / *Send Code Tag to AI*. Both commands are also in the Command Palette, but only appear once Browser Bridge is detected.
- Invoking from the palette/keybinding without an item selected falls back to the note or code tag at the cursor in the active editor.

What gets sent:

| Source     | Payload |
|------------|---------|
| Note       | The note body as the prompt, plus source location and a `note` block (id, title — first 80 chars, body, priority) |
| Code Tag   | The tag's comment text as the prompt, plus source location and the surrounding code content |

## Zip Project

Zips the current workspace root for uploading to an AI chat (e.g. Claude.ai) as project context.

- **Right-click a workspace root folder in Explorer** → *Zip Project*. Only available on a folder that is an actual open workspace root — not on arbitrary subfolders, and not from the Command Palette.
- `.gitignore`-matched paths and `.git` are excluded automatically.
- The zip is written to your OS temp directory (not inside the workspace) as `<projectName>-<timestamp>.zip`. On success, a notification offers an *Open Folder* button to reveal it.
- `noteStack.maxProjectSizeForZip` (default `30`) caps the output size — matching Claude.ai's 30 MB chat upload limit. If the zip comes out larger, it's deleted and an error is shown instead.

## Related

- [Settings](SETTINGS.md) — `maxProjectSizeForZip`
