/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import * as fs from "fs";
import * as vscode from "vscode";

import { CodeTagEntry, CodeTagsStore, CodeTagStats } from "./types";
import { getKeywordRe, isInsideString, updateWorkspaceStats } from "./utils";

// <identifier YYYY-MM-DD p:N>
const CODETAG_RE = /<([A-Za-z0-9_]+)\s+(\d{4}-\d{2}-\d{2})\s+p:([0-3])>/;

// Single-line comment starters (// # <!--)
const INLINE_COMMENT_RE = /^\s*(\/\/|#|<!--)/;

const SCAN_GLOB =
  "**/*.{ts,tsx,js,jsx,mjs,cjs,py,java,c,cpp,h,hpp,cs,go,rb,rs,php,swift,kt,scala,vue,svelte}";

const EXCLUDE_GLOB =
  "{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/.next/**,**/vendor/**}";

// Hard path-segment filter applied after findFiles — guards against glob engine quirks
const EXCLUDE_DIR_RE =
  /(^|[/\\])(node_modules|\.git|dist|out|build|\.next|vendor)([/\\]|$)/;

export class CodeTagScanner implements vscode.Disposable {
  private store: CodeTagsStore = {};
  private watcher?: vscode.FileSystemWatcher;
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  async scanWorkspace(): Promise<void> {
    this.store = {};
    const keywordRe = getKeywordRe();
    const uris = await vscode.workspace.findFiles(SCAN_GLOB, EXCLUDE_GLOB);
    const filtered = uris.filter((u) => !EXCLUDE_DIR_RE.test(u.fsPath));
    await Promise.all(filtered.map((u) => this.scanFile(u.fsPath, keywordRe)));
    this._onDidChange.fire();

    this.getStats();
    /*
    if (stats.codeTags > 0 || stats.keywords > 0) {
      vscode.window.showInformationMessage(
        `NoteStack: ${stats.codeTags} tag${stats.codeTags !== 1 ? "s" : ""} and ${stats.keywords} keyword${stats.keywords !== 1 ? "s" : ""} in ${stats.files} file${stats.files !== 1 ? "s" : ""}`,
      );
    }
    */
  }

  private async scanFile(filePath: string, keywordRe?: RegExp): Promise<void> {
    const kwRe = keywordRe ?? getKeywordRe();
    try {
      const content = await fs.promises.readFile(filePath, "utf8");
      const lines = content.split("\n");
      const tags: CodeTagEntry[] = [];
      let inBlock = false;

      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        kwRe.lastIndex = 0; // ← reset before every exec

        // Enter block comment on the line that opens it
        if (!inBlock && lineText.includes("/*")) inBlock = true;

        const isComment = inBlock || INLINE_COMMENT_RE.test(lineText);

        // Exit block comment after processing this line
        if (inBlock && lineText.includes("*/")) inBlock = false;

        const ctMatch = CODETAG_RE.exec(lineText);
        let kwMatch = isComment ? kwRe.exec(lineText) : null;

        // Skip keyword if it's inside a string literal
        if (kwMatch && isInsideString(lineText, kwMatch.index)) {
          kwMatch = null;
        }

        if (ctMatch && kwMatch) {
          // Both on same line: keyword entry with codetag metadata
          // IDEA: Prioritize the CodeTag?
          const tag = kwMatch[1];

          let text = lineText
            .slice(kwMatch.index + tag.length)
            .replace(ctMatch[0], "")
            .replace(/^\s*[:–—-]\s*/, "")
            .trim();

          tags.push({
            type: "KWCT",
            filePath,
            line: i,
            column: kwMatch.index,
            tag,
            text: text || tag,
            author: ctMatch[1],
            date: ctMatch[2],
            priority: parseInt(ctMatch[3], 10),
          });
        } else if (ctMatch) {
          // Bare codetag: extract description from surrounding comment block
          tags.push({
            type: "CT",
            filePath,
            line: i,
            column: ctMatch.index,
            tag: "CODETAG",
            text: this.extractCommentContext(lines, i),
            author: ctMatch[1],
            date: ctMatch[2],
            priority: parseInt(ctMatch[3], 10),
          });
        } else if (kwMatch) {
          // Standard keyword only
          const tag = kwMatch[1];

          const text = lineText
            .slice(kwMatch.index + tag.length)
            .replace(/^\s*[:–—-]\s*/, "")
            .trim();

          tags.push({
            type: "KW",
            filePath,
            line: i,
            column: kwMatch.index,
            tag,
            text: text || tag,
          });
        }
      }

      // Deduplicate: if a CT (bare codetag) follows a KW within 25 lines,
      // merge the codetag metadata into that KW entry (→ KWCT) and drop the CT.
      const toRemove = new Set<number>();
      for (let i = 0; i < tags.length; i++) {
        if (tags[i].type !== "CT") continue;
        for (let j = i - 1; j >= 0; j--) {
          if (tags[i].line - tags[j].line > 25) break;
          if (tags[j].type === "KW") {
            tags[j].type = "KWCT";
            tags[j].author = tags[i].author;
            tags[j].date = tags[i].date;
            tags[j].priority = tags[i].priority;
            toRemove.add(i);
            break;
          }
        }
      }
      const finalTags = toRemove.size
        ? tags.filter((_, i) => !toRemove.has(i))
        : tags;

      if (finalTags.length > 0) {
        this.store[filePath] = finalTags;
      } else {
        delete this.store[filePath];
      }
    } catch {
      // missing, unreadable or binary file
      delete this.store[filePath];
    }
  }

  // Walk backwards from a bare <author date p:N> line to find the comment body above it.
  private extractCommentContext(lines: string[], tagLine: number): string {
    const collected: string[] = [];

    for (let i = tagLine - 1; i >= 0 && i >= tagLine - 25; i--) {
      const raw = lines[i];
      const trimmed = raw.trim();

      if (
        trimmed === "" ||
        trimmed === "/**" ||
        trimmed === "/*" ||
        trimmed === "*/"
      ) {
        if (collected.length > 0) break;
        continue;
      }

      const stripped = trimmed
        .replace(/^\/\*\*?\s*/, "")
        .replace(/^\*\s*/, "")
        .replace(/^\/\/\s*/, "")
        .replace(/^#\s*/, "")
        .trim();

      if (stripped) collected.unshift(stripped);
    }

    return collected.join(" ").trim() || `Code tag at line ${tagLine + 1}`;
  }

  setupWatcher(): void {
    this.watcher = vscode.workspace.createFileSystemWatcher(SCAN_GLOB);
    this.watcher.onDidChange(async (uri) => {
      if (EXCLUDE_DIR_RE.test(uri.fsPath)) return;
      await this.scanFile(uri.fsPath);
      this._onDidChange.fire();
    });
    this.watcher.onDidCreate(async (uri) => {
      if (EXCLUDE_DIR_RE.test(uri.fsPath)) return;
      await this.scanFile(uri.fsPath);
      this._onDidChange.fire();
    });
    this.watcher.onDidDelete((uri) => {
      delete this.store[uri.fsPath];
      this._onDidChange.fire();
    });
  }

  getStore(): CodeTagsStore {
    return this.store;
  }

  getStats(): CodeTagStats {
    const entries = Object.values(this.store).flat();
    const tagCounts: Record<string, number> = {};
    const keywordCounts: Record<string, number> = {};
    for (const e of entries) {
      tagCounts[e.tag] = (tagCounts[e.tag] ?? 0) + 1;
      if (e.type === "KW" || e.type === "KWCT") {
        keywordCounts[e.tag] = (keywordCounts[e.tag] ?? 0) + 1;
      }
    }

    const stats = {
      files: Object.keys(this.store).length,
      total: entries.length,
      codeTags: entries.filter((e) => e.type === "CT" || e.type === "KWCT")
        .length,
      keywords: entries.filter((e) => e.type === "KW" || e.type === "KWCT")
        .length,
      keywordCodeTags: entries.filter((e) => e.type === "KWCT").length,
      /*
      tags: Object.entries(tagCounts)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count),
      */
      keywordBreakdown: Object.entries(keywordCounts)
        .map(([keyword, count]) => ({ keyword, count }))
        .sort((a, b) => b.count - a.count),
    };

    updateWorkspaceStats({
      tags: stats,
    });

    return stats;
  }

  dispose(): void {
    this.watcher?.dispose();
    this._onDidChange.dispose();
  }
}
