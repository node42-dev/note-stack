# Code Tags

[← Back to README](../README.md)

NoteStack scans every source file in the workspace and surfaces inline code tags in a dedicated **Code Tags** branch at the bottom of the NoteStack tree. Click any entry to open the file and scroll directly to the tagged line.

Two tag formats are recognised:

## 1. Custom codetag

A metadata stamp embedded anywhere in a comment block:

```
<identifier YYYY-MM-DD p:N>
```

| Field        | Example        | Description                       |
|--------------|----------------|------------------------------------|
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

## 2. Standard keyword

Any recognised keyword found in a comment line or block:

```
// TODO: fix memory leak
// FIXME urgent <a1exnd3r 2026-05-02 p:1>
/* HACK: workaround for upstream bug */
```

When a keyword and a `<author date p:N>` tag appear on the same line, they are merged into a single entry — the keyword is shown as the tag type and the codetag provides the author, date, and priority metadata.

## Priority Colours

| Level | Colour | When to use |
|-------|--------|-------------|
| `p:0` | 🔴 Red    | Critical / blocking |
| `p:1` | 🟠 Orange | High priority |
| `p:2` | 🟡 Yellow | Medium priority |
| `p:3` | 🔵 Blue   | Low priority |
| `p:4` | 🟢 Green  | Info / nice-to-have |

Tags without priority metadata use the default `tag` icon.

## Scanned File Types

`ts tsx js jsx mjs cjs py java c cpp h hpp cs go rb rs php swift kt scala vue svelte`

The following directories are always excluded regardless of workspace structure: `node_modules`, `dist`, `out`, `build`, `.next`, `vendor`, `.git`.

To exclude additional files or directories, add a `.nsignore` file to the workspace root using `.gitignore` syntax. Patterns are layered on top of the defaults above, and changes are picked up automatically.

## Configuring Keywords

The keyword list is fully configurable via `noteStack.codeTagKeywords` in Settings — changes trigger an automatic re-scan. See [Settings](SETTINGS.md).

## Blame Drift

Enable `noteStack.codeTagBlameDrift` to compare each tag's stamped date against the `git blame` date of that line. When enabled, the workspace scan runs `git blame` for every tagged line and shows the drift (in days) in the tag's tooltip and in the [Code Tags Browser](#code-tags-browser):

```
Git blame: 2026-06-14  ·  +43d from tag ⚠️
```

A ⚠️ warning appears when the drift exceeds 30 days, indicating the surrounding code has changed significantly since the tag was written. Disabled by default since it shells out to `git blame` for every tag during scanning.

## Code Tags Browser

Opens a full panel showing **every code tag across the workspace** with search, sort, and filters:

- **Button:** tag icon in the NoteStack tree view header bar
- **Command Palette:** `NoteStack: Open Code Tags Browser`

Sort by priority, newest, oldest, blame drift, or file. Filter by priority level or by keyword pill (click a pill in the filter bar, or click a tag's keyword badge on its card). Click a tag's line number to preview a live code snippet inline, or click the title to jump straight to the tagged line. Click the file name to copy its relative path.

## Why Code Tags Are Not the Same as Git Blame

- **Git blame answers:** who last touched this line?
- **Code tags answer:** who intentionally marked this as pending, when, and how urgent is it?

A well-known Git Blame limitation: if someone runs a code formatter across a file, every line now blames the formatter, not the original author. An `<a1exnd3r 2026-05-02 p:1>` tag in a comment block is immune to this — it only disappears when the developer consciously removes it.

|                                  | Git Blame                             | CodeTag `<author date p:N>`           |
|----------------------------------|----------------------------------------|-----------------------------------------|
| What it tracks                  | Last commit to touch the line         | An explicit, authored intent marker   |
| Survives reformatting           | ❌ No — blame shifts to the formatter | ✅ Yes — embedded in the comment text |
| Shows priority                  | ❌ No                                  | ✅ p:0–3                               |
| Shows intent date                | ❌ Only last-modified                 | ✅ Date when the issue was flagged     |
| Changes when someone else edits | ❌ Yes, blame shifts                   | ✅ No, the tag stays until removed     |
| Visible without leaving editor  | Inline annotation only                | ✅ Tree branch in sidebar              |

## Related

- [Docs Tree & Browser](DOCS_TREE.md) — the same scan-and-browse pattern applied to Markdown files
- [Settings](SETTINGS.md) — `codeTagKeywords`, `codeTagBlameDrift`
