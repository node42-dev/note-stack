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

import { DocEntry, DocsStore } from "./types";
import { updateWorkspaceStats } from "./utils";

const DOCS_GLOB = "**/*.md";

const EXCLUDE_GLOB =
  "{**/node_modules/**,**/.git/**,**/dist/**,**/out/**,**/build/**,**/.next/**,**/vendor/**}";

// Hard path-segment filter applied after findFiles — guards against glob engine quirks
const EXCLUDE_DIR_RE =
  /(^|[/\\])(node_modules|\.git|dist|out|build|\.next|vendor)([/\\]|$)/;

// Per-workspace-folder additional excludes, gitignore-style. Layered on top of the
// defaults above rather than replacing them.
const NSIGNORE_FILENAME = ".nsignore";
const NSIGNORE_WATCH_GLOB = `**/${NSIGNORE_FILENAME}`;

const PREVIEW_MAX_LEN = 220;

export class DocsScanner implements vscode.Disposable {
  private store: DocsStore = {};
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
    const uris = await vscode.workspace.findFiles(DOCS_GLOB, EXCLUDE_GLOB);
    const filtered = uris.filter((u) => !this.isExcluded(u.fsPath));
    await Promise.all(filtered.map((u) => this.scanFile(u.fsPath)));
    this._onDidChange.fire();

    this.getStats();
  }

  private async scanFile(filePath: string): Promise<void> {
    try {
      const [content, stat] = await Promise.all([
        fs.promises.readFile(filePath, "utf8"),
        fs.promises.stat(filePath),
      ]);

      this.store[filePath] = {
        filePath,
        title: this.extractTitle(content, filePath),
        preview: this.extractPreview(content),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      };
    } catch {
      // missing, unreadable or binary file
      delete this.store[filePath];
    }
  }

  // First ATX heading ("# Title"), skipping YAML front matter — else the file name.
  private extractTitle(content: string, filePath: string): string {
    const lines = this.stripFrontMatter(content).split("\n");
    for (const line of lines) {
      const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
      if (m) return m[1].trim();
    }
    return path.basename(filePath, path.extname(filePath));
  }

  // First non-empty paragraph line after the title, with basic markdown stripped.
  private extractPreview(content: string): string {
    const lines = this.stripFrontMatter(content).split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^#{1,6}\s/.test(trimmed)) continue; // heading
      if (/^(```|~~~)/.test(trimmed)) continue; // code fence marker
      if (/^(>|\||-{3,}|\*{3,}|_{3,})/.test(trimmed)) continue; // quote/table/hr

      const stripped = trimmed
        .replace(/^[-*+]\s+/, "")
        .replace(/^\d+\.\s+/, "")
        .replace(/[`*_~]/g, "")
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .trim();

      if (stripped) {
        return stripped.length > PREVIEW_MAX_LEN
          ? stripped.slice(0, PREVIEW_MAX_LEN - 1).trimEnd() + "…"
          : stripped;
      }
    }
    return "";
  }

  private stripFrontMatter(content: string): string {
    if (content.startsWith("---")) {
      const end = content.indexOf("\n---", 3);
      if (end !== -1) return content.slice(end + 4);
    }
    return content;
  }

  setupWatcher(): void {
    this.loadIgnoreFilters();

    this.watcher = vscode.workspace.createFileSystemWatcher(DOCS_GLOB);
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

  getStore(): DocsStore {
    return this.store;
  }

  getStats(): { files: number } {
    const stats = { files: Object.keys(this.store).length };
    updateWorkspaceStats({ docs: stats });
    return stats;
  }

  dispose(): void {
    this.watcher?.dispose();
    this.nsIgnoreWatcher?.dispose();
    this._onDidChange.dispose();
  }
}
