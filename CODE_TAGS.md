## Why CodeTags are NOT the same as Git Blame — key distinction

- **Git blame answers**: `who last touched this line?`
- **Code tags answer**: `who intentionally marked this as pending,   when, and how urgent is it?`

A well-known Git Blame limitation: **If someone runs a code formatter across a file, every line now blames the formatter, not the original author**.<br> `<a1exnd3r 2026-05-02 p:1>` tag in a comment block is immune to this — it only disappears when the developer consciously removes it.

|                                 | Git Blame                             | CodeTag <author date p:N>             |
| ------------------------------- | ------------------------------------- | ------------------------------------- |
| What it tracks                  | Last commit to touch the line         | An explicit, authored intent marker   |
| Survives reformatting           | ❌ No — blame shifts to the formatter | ✅ Yes — embedded in the comment text |
| Shows priority                  | ❌ No | ✅ p:0–3                      |
| Shows intent date               | ❌ Only last-modified                 | ✅ Date when the issue was flagged    |
| Changes when someone else edits | ❌ Yes, blame shifts                  | ✅ No, the tag stays until removed    |
| Visible without leaving editor  | Inline annotation only                | ✅ Tree branch in sidebar             |

### Implementation

- **The <author date p:N> format** — standard TODO scanners show no author or date inside the tag itself. NoteStack's custom format makes ownership and age explicit in the source file, not just in git history.
- **Config-driven keyword list** — fully user-adjustable via noteStack.codeTagKeywords.
- **Numeric priority (0–3)** — NoteStack maps priority to colour-coded icons in the tree.
- **Unified panel** — both your private NoteStack annotations and in-source code tags live in the same sidebar tree. You don't need a separate extension.
