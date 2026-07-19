/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { APP_ID, HOST_NAME } from './constants';
import { CodeTagEntry, CodeTagsStore } from './types';
import { DEFAULT_KEYWORDS, escapeHtml, getItemAge } from './utils';

export interface ICodeTagsBrowserManager {
  getWorkspaceRootPublic(): string;
  getCodeTagsStore(): CodeTagsStore;
  openCodeTag(entry: CodeTagEntry): Promise<void>;
}

export class CodeTagsBrowserPanel {
  private static currentPanel: CodeTagsBrowserPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private browserCodePreview: boolean;
  private browserCodePreviewLines: number;

  static createOrShow(
    context: vscode.ExtensionContext,
    manager: ICodeTagsBrowserManager,
  ): CodeTagsBrowserPanel {
    const column = vscode.ViewColumn.Beside;

    if (CodeTagsBrowserPanel.currentPanel) {
      CodeTagsBrowserPanel.currentPanel.panel.reveal(column);
      CodeTagsBrowserPanel.currentPanel.update(manager);
      return CodeTagsBrowserPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'codeTagsBrowser',
      'NoteStack - CodeTags',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      },
    );

    CodeTagsBrowserPanel.currentPanel = new CodeTagsBrowserPanel(panel, context, manager);
    return CodeTagsBrowserPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    manager: ICodeTagsBrowserManager,
  ) {
    this.browserCodePreview = vscode.workspace
      .getConfiguration('noteStack')
      .get<boolean>('browserCodePreview', true);

    this.browserCodePreviewLines = vscode.workspace
      .getConfiguration('noteStack')
      .get<number>('browserCodePreviewLines', 4);

    this.panel = panel;
    this.update(manager);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'openCodeTag') {
        await manager.openCodeTag(msg.entry as CodeTagEntry);
      } else if (msg.type === 'getSnippet' && this.browserCodePreview) {
        try {
          const doc   = await vscode.workspace.openTextDocument(msg.filePath);
          const start = Math.max(0, msg.line - this.browserCodePreviewLines);
          const end   = Math.min(doc.lineCount - 1, msg.line + this.browserCodePreviewLines);
          const lines: string[] = [];
          for (let i = start; i <= end; i++) {
            lines.push((i === msg.line ? '▶ ' : '  ') + doc.lineAt(i).text);
          }
          this.panel.webview.postMessage({ type: 'snippetResult', id: msg.id, snippet: lines.join('\n') });
        } catch { /* file not accessible */ }
      }
    }, null, this.disposables);
  }

  update(manager: ICodeTagsBrowserManager): void {
    const keywords     = vscode.workspace
      .getConfiguration('noteStack')
      .get<string[]>('codeTagKeywords', DEFAULT_KEYWORDS)
      .map(k => k.trim())
      .filter(Boolean);
    const codiconUri   = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'codicons', 'codicon.css'),
    );
    const cssUri       = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'media', 'codetags', 'browser.css'),
    );
    const scriptUri    = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'media', 'codetags', 'browser.js'),
    );
    const cspSource    = this.panel.webview.cspSource;

    this.panel.webview.html = buildCodeTagsBrowserHtml(
      manager.getCodeTagsStore(), keywords, codiconUri.toString(), cspSource,
      cssUri.toString(), scriptUri.toString(),
    );
  }

  dispose(): void {
    CodeTagsBrowserPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<number, string> = { 0: 'Low', 1: 'Normal', 2: 'High', 3: 'Critical' };

const KW_CODICON: Record<string, string> = {
  IDEA:       'lightbulb',
  NOTE:       'note',
  ISSUE:      'issues',
  INFO:       'info',
  QUESTION:   'question',
  REF:        'book',
  REFERENCE:  'book',
  BUG:        'bug',
  TODO:       'checklist',
  FIXME:      'tools',
  FIX:        'tools',
  HACK:       'wrench',
  TEST:       'beaker',
  OPTIMIZE:   'rocket',
  SECURITY:   'shield',
  WARNING:    'warning',
  REFACTOR:   'symbol-method',
  TEMPORARY:  'clock',
  DEPRECATED: 'trash',
  REVIEW:     'eye',
  LINK:       'link',
  GITHUB:     'github-alt',
  PR:         'git-pull-request',
  WWW:        'globe',
  PORT:       'plug',
  XXX:        'chrome-close',
  CODETAG:    'tag',
};

function fileMtimeDate(filePath: string): string | undefined {
  try {
    const mtime = fs.statSync(filePath).mtime;
    return (
      mtime.getFullYear() + '-' +
      String(mtime.getMonth() + 1).padStart(2, '0') + '-' +
      String(mtime.getDate()).padStart(2, '0')
    );
  } catch {
    return undefined;
  }
}

type FlatTag = { filePath: string; fileName: string; entry: CodeTagEntry; displayDate: string | undefined; dateIsFile: boolean };

// ── HTML Builder ─────────────────────────────────────────────────────────────

export function buildCodeTagsBrowserHtml(
  store: CodeTagsStore,
  keywords: string[],
  codiconUri: string,
  cspSource: string,
  cssUri: string,
  scriptUri: string,
): string {
  // Cache mtime per file so we only stat once per file
  const fileDateCache = new Map<string, string | undefined>();
  const getFileDate = (fp: string) => {
    if (!fileDateCache.has(fp)) fileDateCache.set(fp, fileMtimeDate(fp));
    return fileDateCache.get(fp);
  };

  const flat: FlatTag[] = [];
  for (const [filePath, tags] of Object.entries(store)) {
    if (!tags?.length) continue;
    for (const entry of tags) {
      const dateIsFile = !entry.date;
      const displayDate = entry.date ?? getFileDate(filePath);
      flat.push({ filePath, fileName: path.basename(filePath), entry, displayDate, dateIsFile });
    }
  }

  // Default sort: priority desc (3 = Critical first), then date newest first
  flat.sort((a, b) => {
    const ap = a.entry.priority ?? -1;
    const bp = b.entry.priority ?? -1;
    if (ap !== bp) return bp - ap;
    const at = a.displayDate ? new Date(`${a.displayDate}T00:00:00`).getTime() : 0;
    const bt = b.displayDate ? new Date(`${b.displayDate}T00:00:00`).getTime() : 0;
    return bt - at;
  });

  const tagCount  = flat.length;
  const fileCount = Object.keys(store).filter(k => store[k]?.length > 0).length;

  const rows = flat.map(({ filePath, fileName, entry, displayDate, dateIsFile }, idx) => {
    const priorityClass = entry.priority !== undefined ? `p${entry.priority}` : 'none';
    const tagTs         = displayDate ? new Date(`${displayDate}T00:00:00`).getTime() : 0;
    const relPath       = escapeHtml(vscode.workspace.asRelativePath(filePath));
    const firstLine     = escapeHtml((entry.text || '').split('\n')[0]);
    const fullText      = escapeHtml(entry.text || '');
    const entryJson     = escapeHtml(JSON.stringify(entry));
    const age           = displayDate ? ` ${getItemAge(displayDate)}` : '';
    const codiconName   = KW_CODICON[entry.tag.toUpperCase()];
    const iconHtml      = codiconName ? `<i class="codicon codicon-${codiconName} tag-kw-icon"></i>` : '';
    const dateFlair     = displayDate
      ? `${escapeHtml(displayDate)}${age}${dateIsFile ? ' <span class="file-date" title="File modification date">(file)</span>' : ''}`
      : '';

    let driftAbs  = 0;
    const footerParts: string[] = [];

    if (entry.blameDate && entry.date) {
      const tagMs   = new Date(`${entry.date}T00:00:00`).getTime();
      const blameMs = new Date(`${entry.blameDate}T00:00:00`).getTime();
      const diff    = Math.round((blameMs - tagMs) / 86400000);
      driftAbs = Math.abs(diff);
      const sign = diff > 0 ? '+' : '';
      const warn = driftAbs > 30;
      footerParts.push(
        `<span class="blame-drift${warn ? ' blame-drift-warn' : ''}">blame: ${escapeHtml(entry.blameDate)}  ·  ${sign}${diff}d${warn ? ' ⚠️' : ''}</span>`,
      );
    }
    if (entry.priority !== undefined) {
      footerParts.push(`<span class="priority-label">P${entry.priority} ${PRIORITY_LABEL[entry.priority]}</span>`);
    }

    return `
    <div class="note-card priority-${priorityClass}"
        data-id="${idx}"
        data-priority="${priorityClass}"
        data-ts="${tagTs}"
        data-drift="${driftAbs}"
        data-line="${entry.line}"
        data-tag="${escapeHtml(entry.tag)}"
        data-file="${escapeHtml(filePath)}">
      <div class="note-header">
        <div class="note-title-row">
          ${iconHtml}<span class="tag-kw-badge" data-kw="${escapeHtml(entry.tag)}">${escapeHtml(entry.tag)}</span>
          <button class="note-title-btn" data-entry="${entryJson}" title="Jump to ${relPath}:${entry.line + 1}"
          >${firstLine || '<em>no description</em>'}</button>
          <span class="note-location" title="Preview code">Line ${entry.line + 1}</span>
        </div>
        <div class="note-meta">
          <span class="meta-item meta-file" title="${relPath}">${escapeHtml(fileName)}</span>
          ${entry.author ? `<span class="meta-separator"> · </span><span class="meta-item">${escapeHtml(entry.author)}</span>` : ''}
          ${dateFlair ? `<span class="meta-separator"> · </span><span class="meta-item meta-time">${dateFlair}</span>` : ''}
        </div>
      </div>
      <div class="note-body">${fullText}</div>
      <div class="note-snippet" style="display:none;"></div>
      ${footerParts.length ? `<div class="note-footer">${footerParts.join(' · ')}</div>` : ''}
    </div>`;
  }).join('\n');

  const emptyState = tagCount === 0
    ? `<div class="empty-state">
        <div class="empty-icon">🏷️</div>
        <div class="empty-title">No code tags found</div>
        <div class="empty-subtitle">Add tags like &lt;author YYYY-MM-DD p:N&gt; or keywords like TODO, FIXME</div>
       </div>`
    : '';

  // Which keywords are actually present in the store (for highlighting active pills)
  const presentKeywords = new Set(flat.map(f => f.entry.tag));

  const keywordPillsHtml = keywords
    .map(kw => `<button class="filter-btn kw-pill${presentKeywords.has(kw) ? '' : ' kw-absent'}" data-kw="${escapeHtml(kw)}">${escapeHtml(kw)}</button>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; font-src ${cspSource}; script-src ${cspSource};">
<link rel="stylesheet" href="${codiconUri}">
<link rel="stylesheet" href="${cssUri}">
<title>NoteStack - CodeTags</title>
</head>
<body>
<div class="header">
  <div class="header-top">
    <span class="header-title">CodeTags</span>
    <span class="header-stats" id="statsLabel" data-appid="${escapeHtml(APP_ID)}" data-host="${escapeHtml(HOST_NAME)}">${tagCount} tag${tagCount !== 1 ? 's' : ''} · ${fileCount} file${fileCount !== 1 ? 's' : ''} · ${escapeHtml(APP_ID)} · ${escapeHtml(HOST_NAME)}</span>
  </div>
  <div class="filter-bar">
    <div class="search-wrap">
      <input type="text" id="searchInput" placeholder="Search tags…" autocomplete="off" spellcheck="false">
    </div>
    <select id="sortSelect" class="select-elm">
      <option value="priority">Priority</option>
      <option value="newest">Newest</option>
      <option value="oldest">Oldest</option>
      <option value="drift">Drift</option>
      <option value="file">File</option>
    </select>
    <select id="prioritySelect" class="select-elm">
      <option value="all">All</option>
      <option value="p3">Critical</option>
      <option value="p2">High</option>
      <option value="p1">Normal</option>
      <option value="p0">Low</option>
      <option value="none">Untagged</option>
    </select>
    <div id="kwPills">${keywordPillsHtml}</div>
  </div>
</div>
<div class="notes-list" id="notesList">
  ${emptyState}
  ${rows}
</div>
<script src="${scriptUri}"></script>
</body>
</html>`;
}
