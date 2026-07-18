/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import * as vscode from 'vscode';
import { APP_ID, HOST_NAME } from './constants';
import { DocEntry, DocsStore } from './types';
import { escapeHtml, getItemAge } from './utils';

export interface IDocsBrowserManager {
  getWorkspaceRootPublic(): string;
  getDocsStore(): DocsStore;
  openDoc(entry: DocEntry): Promise<void>;
}

export class DocsBrowserPanel {
  private static currentPanel: DocsBrowserPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  static createOrShow(
    context: vscode.ExtensionContext,
    manager: IDocsBrowserManager,
  ): DocsBrowserPanel {
    const column = vscode.ViewColumn.Beside;

    if (DocsBrowserPanel.currentPanel) {
      DocsBrowserPanel.currentPanel.panel.reveal(column);
      DocsBrowserPanel.currentPanel.update(manager);
      return DocsBrowserPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'docsBrowser',
      'NoteStack - Docs',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      },
    );

    DocsBrowserPanel.currentPanel = new DocsBrowserPanel(panel, context, manager);
    return DocsBrowserPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    manager: IDocsBrowserManager,
  ) {
    this.panel = panel;
    this.update(manager);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'openDoc') {
        await manager.openDoc(msg.entry as DocEntry);
      }
    }, null, this.disposables);
  }

  update(manager: IDocsBrowserManager): void {
    const codiconUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'codicons', 'codicon.css'),
    );
    const cssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'media', 'docs', 'browser.css'),
    );
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'media', 'docs', 'browser.js'),
    );
    const cspSource = this.panel.webview.cspSource;

    this.panel.webview.html = buildDocsBrowserHtml(
      manager.getDocsStore(), codiconUri.toString(), cspSource,
      cssUri.toString(), scriptUri.toString(),
    );
  }

  dispose(): void {
    DocsBrowserPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(mtimeMs: number): string {
  const d = new Date(mtimeMs);
  return (
    d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

// ── HTML Builder ─────────────────────────────────────────────────────────────

export function buildDocsBrowserHtml(
  store: DocsStore,
  codiconUri: string,
  cspSource: string,
  cssUri: string,
  scriptUri: string,
): string {
  const docs = Object.values(store).sort((a, b) =>
    vscode.workspace.asRelativePath(a.filePath).localeCompare(vscode.workspace.asRelativePath(b.filePath)),
  );

  const docCount = docs.length;

  const rows = docs.map((entry, idx) => {
    const title     = escapeHtml(entry.title);
    const relPath   = escapeHtml(vscode.workspace.asRelativePath(entry.filePath));
    const preview   = escapeHtml(entry.preview || '');
    const entryJson = escapeHtml(JSON.stringify(entry));
    const dateStr   = formatDate(entry.mtimeMs);
    const age       = getItemAge(dateStr);
    const sizeStr   = formatSize(entry.size);

    return `
    <div class="doc-card"
        data-id="${idx}"
        data-ts="${entry.mtimeMs}"
        data-size="${entry.size}"
        data-path="${relPath}">
      <div class="doc-header">
        <div class="doc-title-row">
          <i class="codicon codicon-markdown doc-icon"></i>
          <button class="doc-title-btn" data-entry="${entryJson}" title="Open ${relPath}">${title}</button>
        </div>
        <div class="doc-meta">
          <span class="meta-item meta-path doc-path" data-path="${relPath}" title="Click to copy path">${relPath}</span>
          <span class="meta-separator"> · </span>
          <span class="meta-item">${dateStr} ${escapeHtml(age)}</span>
          <span class="meta-separator"> · </span>
          <span class="meta-item">${sizeStr}</span>
        </div>
      </div>
      ${preview ? `<div class="doc-body">${preview}</div>` : ''}
    </div>`;
  }).join('\n');

  const emptyState = docCount === 0
    ? `<div class="empty-state">
        <div class="empty-icon">📄</div>
        <div class="empty-title">No docs found</div>
        <div class="empty-subtitle">Markdown (.md) files anywhere in the workspace show up here</div>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; font-src ${cspSource}; script-src ${cspSource};">
<link rel="stylesheet" href="${codiconUri}">
<link rel="stylesheet" href="${cssUri}">
<title>NoteStack - Docs</title>
</head>
<body>
<div class="header">
  <div class="header-top">
    <span class="header-title">Docs</span>
    <span class="header-stats" id="statsLabel" data-appid="${escapeHtml(APP_ID)}" data-host="${escapeHtml(HOST_NAME)}">${docCount} doc${docCount !== 1 ? 's' : ''} · ${escapeHtml(APP_ID)} · ${escapeHtml(HOST_NAME)}</span>
  </div>
  <div class="filter-bar">
    <div class="search-wrap">
      <input type="text" id="searchInput" placeholder="Search docs…" autocomplete="off" spellcheck="false">
    </div>
    <select id="sortSelect" class="select-elm">
      <option value="path">Path</option>
      <option value="newest">Newest</option>
      <option value="oldest">Oldest</option>
      <option value="size">Size</option>
    </select>
  </div>
</div>
<div class="docs-list" id="docsList">
  ${emptyState}
  ${rows}
</div>
<script src="${scriptUri}"></script>
</body>
</html>`;
}
