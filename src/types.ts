/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

export type NotePriority = "high" | "medium" | "low" | undefined;
export type UrlKind =
  | "aws"
  | "jira"
  | "slack"
  | "linear"
  | "github"
  | "notion"
  | "azure"
  | "trello"
  | "asana"
  | "clickup"
  | "cloudflare"
  | "outlook"
  | "unknown";

export interface NoteEntry {
  id: string;
  line: number;
  character: number;
  note: string;
  timestamp: string;
  priority?: NotePriority;
  author?: string;
  machineId?: string;
  hostName?: string;
  private?: boolean;
  refUrl?: string;
  anchor?: string; // snapshot of line text at time of annotation — used to detect drift
  textSel?: {
    startLine: number;
    endLine: number;
    startChar: number;
    endChar: number;
  };
  commitHash?: string;
}

export interface CodeTagStats {
  files: number;
  total: number;
  codeTags: number;
  keywords: number;
  keywordCodeTags: number;
}

export interface CodeTagEntry {
  type: "CT" | "KW" | "KWCT"; // CT = codetag, KW = keyword, KWCT = keyword + codetag
  filePath: string;
  line: number; // 0-indexed
  column: number;
  tag: string; // The keyword or codetag string (e.g. "TODO", "FIXME", "CODETAG")
  text: string;
  author?: string;
  date?: string; // YYYY-MM-DD
  priority?: number; // 0–3
}

export interface CodeTagsStore {
  [filePath: string]: CodeTagEntry[];
}

export interface NotesStore {
  [filePath: string]: NoteEntry[];
}

export interface GlobalNotesStore {
  [workspaceRoot: string]: NotesStore;
}

export type TreeNode =
  | string
  | { filePath: string; fileName: string; note: NoteEntry }
  | { kind: "codeTagsRoot" }
  | { kind: "codeTagFile"; filePath: string }
  | { kind: "codeTag"; entry: CodeTagEntry };

export type AnchorMatch = {
  line: number;
  text: string;
  exactMatch: boolean;
  similarity: number; // 0–1
};
