/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import ignore, { Ignore } from "ignore";

import { CodeTagEntry, CodeTagsStore, CodeTagStats } from "./types";
import { getGitBlameDateForLine, getKeywordRe, isInsideString, updateWorkspaceStats } from "./utils";

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

// Per-workspace-folder additional excludes, gitignore-style. Layered on top of the
// defaults above rather than replacing them.
const NSIGNORE_FILENAME = ".nsignore";
const NSIGNORE_WATCH_GLOB = `**/${NSIGNORE_FILENAME}`;

export class CodeTagScanner implements vscode.Disposable {
  private store: CodeTagsStore = {};
  private watcher?: vscode.FileSystemWatcher;
  private nsIgnoreWatcher?: vscode.FileSystemWatcher;
  private ignoreFilters = new Map<string, Ignore>();
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private loadIgnoreFilters(): void {
    this.ignoreFilters.clear();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const ig = ignore();
      try {
        const content = fs.readFileSync(
          path.join(folder.uri.fsPath, NSIGNORE_FILENAME),
          "utf8",
        );
        ig.add(content);
      } catch {
        // no .nsignore in this folder — nothing to layer on top of the defaults
      }
      this.ignoreFilters.set(folder.uri.fsPath, ig);
    }
  }

  private isExcluded(fsPath: string): boolean {
    if (EXCLUDE_DIR_RE.test(fsPath)) return true;

    for (const [root, ig] of this.ignoreFilters) {
      const rel = path.relative(root, fsPath);
      if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
      if (ig.ignores(rel.split(path.sep).join("/"))) return true;
    }
    return false;
  }

  async scanWorkspace(): Promise<void> {
    this.store = {};
    this.loadIgnoreFilters();
    const keywordRe = getKeywordRe();
    const uris = await vscode.workspace.findFiles(SCAN_GLOB, EXCLUDE_GLOB);
    const filtered = uris.filter((u) => !this.isExcluded(u.fsPath));
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
        const blameDriftEnabled = vscode.workspace
          .getConfiguration("noteStack")
          .get<boolean>("codeTagBlameDrift", false);

        if (blameDriftEnabled) {
          for (const tag of finalTags) {
            if (tag.date) {
              tag.blameDate = getGitBlameDateForLine(filePath, tag.line);
            }
          }
        }

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
    this.loadIgnoreFilters();

    this.watcher = vscode.workspace.createFileSystemWatcher(SCAN_GLOB);
    this.watcher.onDidChange(async (uri) => {
      if (this.isExcluded(uri.fsPath)) return;
      await this.scanFile(uri.fsPath);
      this._onDidChange.fire();
    });
    this.watcher.onDidCreate(async (uri) => {
      if (this.isExcluded(uri.fsPath)) return;
      await this.scanFile(uri.fsPath);
      this._onDidChange.fire();
    });
    this.watcher.onDidDelete((uri) => {
      delete this.store[uri.fsPath];
      this._onDidChange.fire();
    });

    // .nsignore changed — reload filters and rescan, since previously
    // excluded/included files may now need the opposite treatment.
    this.nsIgnoreWatcher = vscode.workspace.createFileSystemWatcher(NSIGNORE_WATCH_GLOB);
    const onNsIgnoreChange = () => this.scanWorkspace();
    this.nsIgnoreWatcher.onDidChange(onNsIgnoreChange);
    this.nsIgnoreWatcher.onDidCreate(onNsIgnoreChange);
    this.nsIgnoreWatcher.onDidDelete(onNsIgnoreChange);
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

    const driftEntries = entries
      .filter((e) => e.date && e.blameDate)
      .map((e) => {
        const tagMs = new Date(`${e.date}T00:00:00`).getTime();
        const blameMs = new Date(`${e.blameDate}T00:00:00`).getTime();
        return {
          file: vscode.workspace.asRelativePath(e.filePath),
          line: e.line + 1,
          tag: e.tag,
          tagDate: e.date,
          blameDate: e.blameDate,
          driftDays: Math.round((blameMs - tagMs) / 86400000),
        };
      })
      .sort((a, b) => Math.abs(b.driftDays) - Math.abs(a.driftDays));

    const statsPayload: Record<string, unknown> = { tags: stats };
    if (driftEntries.length > 0) statsPayload.blameDrift = driftEntries;

    updateWorkspaceStats(statsPayload);

    return stats;
  }

  dispose(): void {
    this.watcher?.dispose();
    this.nsIgnoreWatcher?.dispose();
    this._onDidChange.dispose();
  }
}
