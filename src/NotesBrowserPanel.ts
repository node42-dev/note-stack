/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import * as path from 'path';
import * as vscode from 'vscode';
import { APP_ID, HOST_NAME } from './constants';
import { NoteRenderer } from './NoteRenderer';
import { TicketLinker, parseTicketConfigs } from './TicketLinker';
import { NoteEntry, NotesStore } from './types';
import { detectUrlKind, escapeHtml, formatTimestamp, prioritySort, timeAgo, urlKindLabel } from './utils';

export interface INotesBrowserManager {
  getWorkspaceRootPublic(): string;
  getAllNotesGlobal(): NotesStore;
  openNote(item: { filePath: string; fileName: string; note: NoteEntry }): Promise<void>;
  editNote(item: { filePath: string; fileName: string; note: NoteEntry }): Promise<void>;
  exportToMarkdown(): Promise<void>;
}

export class NotesBrowserPanel {
  private static currentPanel: NotesBrowserPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private ticketLinker: TicketLinker;
  private noteRenderer:  NoteRenderer;

  private noteCountThreshold: number;
  private browserInlineCodePreview: boolean;
  private browserInlineCodePreviewContextLines: number;

  static createOrShow(
    context: vscode.ExtensionContext,
    manager: INotesBrowserManager
  ): NotesBrowserPanel {    
    
    const column = vscode.ViewColumn.Beside;

    if (NotesBrowserPanel.currentPanel) {
      NotesBrowserPanel.currentPanel.panel.reveal(column);
      NotesBrowserPanel.currentPanel.update(manager);
      return NotesBrowserPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'codeNotesBrowser',
      'NoteStack — All Notes',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      }
    );

    NotesBrowserPanel.currentPanel = new NotesBrowserPanel(panel, context, manager);
    return NotesBrowserPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    manager: INotesBrowserManager
  ) {
    this.browserInlineCodePreview = vscode.workspace
      .getConfiguration('noteStack')
      .get<boolean>('browserInlineCodePreview', true);
    
    this.browserInlineCodePreviewContextLines = vscode.workspace
      .getConfiguration('noteStack')
      .get<number>('browserInlineCodePreviewContextLines', 4);

    this.noteCountThreshold = vscode.workspace
      .getConfiguration('noteStack')
      .get<number>('noteCountThreshold', 300);

    this.ticketLinker = new TicketLinker(
      parseTicketConfigs(vscode.workspace.getConfiguration('noteStack').get('ticketTrackers'))
    );
    this.noteRenderer = new NoteRenderer(this.ticketLinker);

    this.panel = panel;
    this.update(manager);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === 'openNote') {
          await manager.openNote({
            filePath: msg.filePath,
            fileName: path.basename(msg.filePath),
            note: msg.note as NoteEntry,
          });
        } 
        else if (msg.type === 'editNote') {
          await manager.editNote({
            filePath: msg.filePath,
            fileName: path.basename(msg.filePath),
            note: msg.note as NoteEntry,
          });
        } 
        else if (msg.type === 'openWorkspace') {
          if (msg.filePath) {
            await context.globalState.update('noteStack.pendingOpenFile', {
              filePath:  msg.filePath,
              line:      msg.line ?? 0,
              character: msg.character ?? 0,
            });
          }
          const uri = vscode.Uri.file(msg.wsRoot);
          await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
        } 
        else if (msg.type === 'exportMarkdown') {
          await manager.exportToMarkdown();
        }
        else if (msg.type === 'getSnippet' && this.browserInlineCodePreview) {
          try {
            const doc   = await vscode.workspace.openTextDocument(msg.filePath);
            const start = Math.max(0, msg.line - this.browserInlineCodePreviewContextLines);
            const end   = Math.min(doc.lineCount - 1, msg.line + this.browserInlineCodePreviewContextLines);
            const lines = [];
            
            for (let i = start; i <= end; i++) {
              const prefix = i === msg.line ? '▶ ' : '  ';
              lines.push(prefix + doc.lineAt(i).text);
            }

            this.panel.webview.postMessage({
              type:    'snippetResult',
              id:      msg.id,
              snippet: lines.join('\n'),
              lang:    doc.languageId,
            });
          } catch { 
             vscode.window.showErrorMessage(`NoteStack: File not accessible: ${msg.filePath}`);
          }
        }
      },
      null,
      this.disposables
    );
  }

  refreshTicketLinker(): void {
    this.ticketLinker = new TicketLinker(
      parseTicketConfigs(vscode.workspace.getConfiguration('noteStack').get('ticketTrackers'))
    );
  }

  update(manager: INotesBrowserManager): void {
    const wsRoot  = manager.getWorkspaceRootPublic();
    const wsName  = wsRoot ? path.basename(wsRoot) : 'Unknown Workspace';
    const allNotes = manager.getAllNotesGlobal();
    this.panel.webview.html = buildBrowserHtml(wsName, allNotes, this.noteCountThreshold, this.noteRenderer);
  }

  dispose(): void {
    NotesBrowserPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

type FlatNote = {
  filePath: string;
  fileName: string;
  wsLabel:  string;
  wsRoot:   string;
  note:     NoteEntry;
};

export function buildBrowserHtml(workspaceName: string, notes: NotesStore, noteCountThreshold: number, noteRenderer?: NoteRenderer): string {
  const flat: FlatNote[] = [];

  for (const [qualifiedPath, fileNotes] of Object.entries(notes)) {
    if (!fileNotes?.length) continue;

    const separatorIdx = qualifiedPath.indexOf(' > ');
    const wsLabel      = separatorIdx !== -1 ? qualifiedPath.slice(0, separatorIdx) : workspaceName;
    const remainder    = separatorIdx !== -1 ? qualifiedPath.slice(separatorIdx + 3) : qualifiedPath;
    const pipeIdx      = remainder.indexOf('|');
    const wsRootFs     = pipeIdx !== -1 ? remainder.slice(0, pipeIdx) : '';
    const filePath     = pipeIdx !== -1 ? remainder.slice(pipeIdx + 1) : remainder;
    const absFilePath  = wsRootFs && !path.isAbsolute(filePath)
      ? path.join(wsRootFs, filePath)
      : filePath;

    for (const note of fileNotes) {
      flat.push({ filePath: absFilePath, fileName: path.basename(absFilePath), note, wsLabel, wsRoot: wsRootFs });
    }
  }

  flat.sort((a, b) => {
    // 1. Current workspace first
    const aLocal = a.wsLabel === workspaceName ? 0 : 1;
    const bLocal = b.wsLabel === workspaceName ? 0 : 1;
    if (aLocal !== bLocal) return aLocal - bLocal;

    // 2. Priority
    const pd = prioritySort(a.note.priority, b.note.priority);
    if (pd !== 0) return pd;

    // 3. Newest first
    const at = new Date(a.note.timestamp).getTime();
    const bt = new Date(b.note.timestamp).getTime();
    if (bt !== at) return bt - at;

    // 4. Location
    return a.note.line - b.note.line;
  });

  const noteCount = flat.length;
  const overLimit = noteCount > noteCountThreshold;
  const fileCount = Object.keys(notes).filter(k => notes[k]?.length > 0).length;

  const rows = flat.map(({ filePath, fileName, note, wsLabel, wsRoot: itemWsRoot }, idx) => {
    const wsRootJson    = (itemWsRoot ?? '').replace(/"/g, '&quot;');
    const priorityClass = note.priority ?? 'none';
    const firstLine     = escapeHtml(note.note.split('\n')[0]);
    
    const fullNote = noteRenderer!.render(note.note);

    const relPath       = escapeHtml(filePath);
    const lineNum       = note.line + 1;
    const colNum        = note.character + 1;
    const timestamp     = escapeHtml(formatTimestamp(note.timestamp));
    const daysLabel     = timeAgo(note.timestamp);
    const noteJson      = escapeHtml(JSON.stringify(note));
    const filePathJson  = escapeHtml(JSON.stringify(filePath));
    const author        = note.author ? `${escapeHtml(note.author)} · ` : ''; 
    
    const appId         = note.machineId?.slice(0, 8);
    const hostName      = note.hostName;
    const localNote     = note.machineId?.startsWith(APP_ID) ?? false;

    const refUrlKind    = note.refUrl ? detectUrlKind(note.refUrl) : null;
    const refUrl        = refUrlKind ? `<a href="${note.refUrl}" title="${note.refUrl}" style="float:right;text-decoration:none;">⧉ Open in ${urlKindLabel(refUrlKind)}</a>` : '';

    return `
    <div class="note-card priority-${priorityClass}" 
        data-id="${idx}"
        data-priority="${priorityClass}" 
        data-ts="${new Date(note.timestamp).getTime()}"
        data-line="${note.line}"
        data-local="${wsLabel === workspaceName}"
        data-file="${escapeHtml(filePath)}">
      <div class="note-header">
        <div class="note-title-row">
          <button class="note-title-btn" data-file="${filePathJson}" data-note="${noteJson}" title="Jump to ${relPath}:${lineNum}"
          >${firstLine || '<em>empty note</em>'}</button>
          <button class="note-edit-btn" data-file="${filePathJson}" data-note="${noteJson}" title="Edit note">✎</button>
          <span class="note-location" title="Preview code">Line ${lineNum}, Col ${colNum}</span>
        </div>
        <div class="note-meta">
          <span class="meta-item meta-workspace" data-wsroot="${wsRootJson}" title="Open workspace in new window">${escapeHtml(wsLabel)}</span>
          <span class="meta-separator">/</span>
          <span class="meta-item meta-file" title="${relPath}">${escapeHtml(fileName)}</span>
          <span class="meta-separator"> · </span>
          <span class="meta-item meta-time">${author}${timestamp} (${daysLabel})</span>
        </div>
      </div>
      <div class="note-body">${fullNote}</div>
      <div class="note-snippet" style="display:none;"></div>
      <div class="note-footer">${appId && localNote ? '' : `<span title="Note origin">⊛ ${appId}`}${!localNote && hostName ? ` · ${hostName}</span> ` : ''}${refUrl}</div>
    </div>`;
  }).join('\n');

  const emptyState = noteCount === 0
    ? `<div class="empty-state">
        <div class="empty-icon">📝</div>
        <div class="empty-title">No notes yet</div>
        <div class="empty-subtitle">Add notes with Ctrl+Shift+N or right-click in the editor</div>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>NoteStack Browser</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:          var(--vscode-editor-background);
    --fg:          var(--vscode-editor-foreground);
    --panel-bg:    var(--vscode-sideBar-background, var(--vscode-editor-background));
    --card-bg:     var(--vscode-editorWidget-background, var(--vscode-editor-background));
    --card-border: var(--vscode-editorWidget-border, rgba(128,128,128,0.2));
    --input-bg:    var(--vscode-input-background);
    --input-fg:    var(--vscode-input-foreground);
    --input-border:var(--vscode-input-border, rgba(128,128,128,0.4));
    --focus:       var(--vscode-focusBorder);
    --link:        var(--vscode-textLink-foreground);
    --link-hover:  var(--vscode-textLink-activeForeground);
    --muted:       var(--vscode-descriptionForeground);
    --btn-bg:      var(--vscode-button-background);
    --btn-fg:      var(--vscode-button-foreground);
    --btn-hover:   var(--vscode-button-hoverBackground);
    --border-high: rgba(255, 70, 70, 0.5);
    --border-med:  rgba(255, 200, 0, 0.5);
    --border-low:  rgba(60, 200, 80, 0.5);
    --font:        var(--vscode-font-family);
    --font-sz:     var(--vscode-font-size, 14px);
    --radius:      6px;
    --info-fg:     var(--vscode-button-background);
  }
  html, body { height: 100%; color: var(--fg); font-family: var(--font); font-size: var(--font-sz); line-height: 1.5; }
  body { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  .header { flex-shrink: 0; padding: 14px 16px 10px; border-bottom: 1px solid var(--card-border); }
  .header-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; cursor: default; }
  .header-title { font-size: 1.1em; font-weight: 700; flex: 1; }
  .header-stats { font-size: 0.82em; color: var(--muted); }
  .filter-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .search-wrap { flex: 1; min-width: 160px; position: relative; }
  .search-wrap::before { content: '🔍'; position: absolute; left: 8px; top: 50%; transform: translateY(-50%); font-size: 0.85em; pointer-events: none; opacity: 0.6; }
  #searchInput { width: 100%; padding: 5px 8px 5px 28px; background: var(--bg); color: var(--input-fg); border: 1px solid var(--input-bg); border-radius: var(--radius); font-family: var(--font); font-size: var(--font-sz); outline: none; }
  #searchInput:focus { border-color: var(--input-bg); }
  .filter-group { display: flex; gap: 4px; flex-wrap: wrap; }
  .filter-btn { padding: 4px 10px; border: 1px solid var(--card-border); border-radius: var(--radius); background: transparent; color: var(--fg); font-family: var(--font); font-size: 0.82em; cursor: pointer; transition: background 0.15s, border-color 0.15s; }
  .filter-btn:hover, .filter-btn.active { background: var(--btn-bg); color: var(--btn-fg); border-color: transparent; }
  .select-elm {
    background: var(--bg); color: var(--input-fg);
    border: 1px solid var(--input-bg); border-radius: var(--radius);
    padding: 4px 8px; font-family: var(--font); font-size: var(--font-size);
    outline: none; cursor: pointer; min-width: 140px;
  }
  .select-elm:focus { border-color: var(-focus); }
  #exportBtn { font-family: var(--font); background: transparent; color: var(--muted); border: 1px solid var(--card-border); font-size: 0.75em; cursor: pointer; border-radius: 999px; padding: 2px 6px 2px 6px; margin-left: 6px; }
  #exportBtn:hover { background: var(--btn-bg); color: var(--btn-fg); border-color: transparent; }
  .notes-list { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
  .notes-list::-webkit-scrollbar { width: 6px; }
  .notes-list::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.3); border-radius: 3px; }
  .note-card { border: 1px solid var(--card-border); border-radius: var(--radius); padding: 10px 12px; border-left: 3px solid transparent; transition: box-shadow 0.15s; }
  .note-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  .note-card.priority-high   { border-left-color: var(--border-high); }
  .note-card.priority-medium { border-left-color: var(--border-med); }
  .note-card.priority-low    { border-left-color: var(--border-low); }
  .note-card.priority-none   { border-left-color: rgba(128,128,128,0.3); }
  .note-header { margin-bottom: 6px; }
  .note-title-row { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
  .note-title-btn { background: none; border: none; color: var(--vscode-foreground); font-family: var(--font); font-size: var(--font-sz); font-weight: 600; cursor: pointer; text-align: left; padding: 0; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note-title-btn:hover { color: var(--link-hover); text-decoration: underline; }
  .note-edit-btn { border: 1px solid var(--card-border); background: transparent; border-radius: 4px; padding: 1px 3px 1px 3px; cursor: pointer; }
  .note-ws-btn { background: none; border: 1px solid var(--card-border); border-radius: var(--radius); color: var(--muted); font-size: 0.8em; padding: 1px 5px; cursor: pointer; flex-shrink: 0; }
  .note-ws-btn:hover { color: var(--link); border-color: var(--link); }
  .note-location { font-size: 0.8em; color: var(--muted); flex-shrink: 0; white-space: nowrap; cursor: pointer; }
  .note-meta { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; font-size: 0.78em; color: var(--muted); cursor: default; }
  .note-footer { font-weight: bold; font-size: 0.78em; color: var(--info-fg); padding-top: 5px; cursor: default; }
  .meta-separator { opacity: 0.4; }
  .meta-item { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
  .meta-item.meta-workspace { text-decoration: underline; cursor: pointer; }
  .priority-text-high   { color: #ff4646; }
  .priority-text-medium { color: #d4a800; }
  .priority-text-low    { color: #3cc850; }
  .priority-text-completed { color: #888; text-decoration: line-through; }
  .note-card.priority-completed { opacity: 0.55; border-left-color: rgba(128,128,128,0.3); }
  .note-body { font-family: var(--vscode-editor-font-family, monospace); font-size: var(--font-sz); line-height: 1.55; white-space: pre-wrap; word-break: break-word; padding: 6px 8px; background: rgba(128,128,128,0.07); border-radius: 3px; max-height: 200px; overflow-y: auto; }
  .note-body::-webkit-scrollbar { width: 4px; }
  .note-body::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.3); border-radius: 2px; }
  .note-body a { color: var(--link); word-break: break-all; }
  .note-body a:hover { color: var(--link-hover); }
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; gap: 8px; text-align: center; }
  .empty-icon { font-size: 3em; }
  .empty-title { font-size: 1.1em; font-weight: 600; }
  .empty-subtitle { color: var(--muted); font-size: 0.88em; }
  .limit-warning { padding: 6px 10px; background: rgba(255,200,0,0.12); border: 1px solid rgba(255,200,0,0.4); border-radius: var(--radius); font-size: 0.82em; color: var(--muted); }
  .hidden { display: none !important; }
   #tagPills { display:flex; gap:4px; flex-wrap:wrap; padding-top:6px; width:100%; }
  .note-tag { color: var(--vscode-textLink-foreground); background: rgba(79,195,247,0.1); border-radius: 3px; padding: 0 3px; cursor: pointer; font-weight: 500; }
  .note-tag:hover { background: rgba(79,195,247,0.2); }
  .note-snippet pre {
    margin: 0;
    padding: 6px 8px;
    background: transparent;
    color: var(--vscode-textPreformat-foreground);
    border-radius: 3px;
    overflow-x: auto;
    font-family: monospace;
    font-size: 0.9em;
    white-space: pre;
  }
  .note-snippet pre code,
  .note-snippet pre code * {
    background-color: transparent !important;
    text-decoration: none !important;
    box-shadow: none !important;
    outline: none !important;
  }
  .note-snippet {
    opacity: 0;
    max-height: 0;
    overflow: hidden;
    transform: translateY(-4px);
    transition: 
      opacity 120ms ease,
      max-height 180ms ease,
      transform 120ms ease;
  }
  .note-snippet.open {
    opacity: 1;
    max-height: 300px; /* big enough for content */
    transform: translateY(0);
  }
  code.inline-code {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.9em;
    background: rgba(128,128,128,0.07);
    padding: 1px 4px;
    border-radius: 3px;
    color: var(--vscode-textPreformat-foreground);
  }
  pre.code-block {
    margin: 6px 0 0;
    padding: 6px 8px;
    background: rgba(128,128,128,0.07);
    border-radius: 3px;
    overflow-x: auto;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.9em;
    white-space: pre;
    color: var(--vscode-textPreformat-foreground);
  }
  pre.code-block code {
    background: transparent;
  }
</style>
</head>
<body>
<div class="header">
  <div class="header-top">
    <span class="header-title">NoteStack<button id="exportBtn" title="Export all notes to Markdown">Export</button></span>
    <span class="header-stats" id="statsLabel">${noteCount} note${noteCount !== 1 ? 's' : ''} · ${fileCount} file${fileCount !== 1 ? 's' : ''} · ${APP_ID} · ${HOST_NAME}</span>
  </div>
  <div class="filter-bar">
    <div class="search-wrap">
      <input type="text" id="searchInput" placeholder="Search notes…" autocomplete="off" spellcheck="false">
    </div>
    <select id="sortSelect" class="select-elm">
      <option value="newest">Newest first</option>
      <option value="oldest">Oldest first</option>
      <option value="workspace">Workspace</option>
    </select>
    <select id="prioritySelect" class="select-elm">
      <option value="all">All</option>
      <option value="high">High</option>
      <option value="medium">Medium</option>
      <option value="low">Low</option>
      <option value="completed">Completed</option>
    </select>
    <div id="tagPills"></div>
  </div>
</div>
<div class="notes-list" id="notesList">
  ${overLimit ? `<div class="limit-warning">&#x26A0;&#xFE0F; ${noteCount} notes — consider archiving old ones for best performance</div>` : ''}
  ${emptyState}
  ${rows}
</div>
<script>
  const vscode = acquireVsCodeApi();

  const list = document.getElementById('notesList');
  const snippetLoaded = new Set();

  let activeTags = new Set();

  // Restore persisted state
  const _state = vscode.getState() || {};
  let activePriority = _state.priority || 'all';
  let searchTerm     = _state.search   || '';

  if (searchTerm) {
    document.getElementById('searchInput').value = searchTerm;
  }
  if (_state.priority) {
    document.getElementById('prioritySelect').value = _state.priority;
  }
  if (_state.sort) {
    document.getElementById('sortSelect').value = _state.sort;
  }

  function saveState() {
    vscode.setState({
      priority: activePriority,
      search:   searchTerm,
      sort:     document.getElementById('sortSelect').value,
    });
  }

  document.querySelectorAll('.note-title-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const filePath = JSON.parse(btn.getAttribute('data-file'));
      const note     = JSON.parse(btn.getAttribute('data-note'));
      vscode.postMessage({ type: 'openNote', filePath, note });
    });
  });

  document.querySelectorAll('.note-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const filePath = JSON.parse(btn.getAttribute('data-file'));
      const note     = JSON.parse(btn.getAttribute('data-note'));
      vscode.postMessage({ type: 'editNote', filePath, note });
    });
  });

  document.querySelectorAll('.meta-workspace').forEach(el => {
    el.addEventListener('click', () => {
      const wsRoot = el.getAttribute('data-wsroot');
      const card     = el.closest('.note-card');
      const filePath = card?.getAttribute('data-file');
      const line     = parseInt(card?.getAttribute('data-line') ?? '0');
      if (wsRoot) vscode.postMessage({ type: 'openWorkspace', wsRoot, filePath, line, character: 0 })
    });
  });

  list.querySelectorAll('.note-card').forEach(card => {
    const loc = card.querySelector('.note-location');
    const snippetEl = card.querySelector('.note-snippet');
    if (!loc || !snippetEl) return;

    loc.addEventListener('click', (e) => {
      e.stopPropagation();

      const isOpen = snippetEl.classList.contains('open');
      if (isOpen) {
        snippetEl.classList.remove('open');
        return;
      }

      snippetEl.classList.add('open');

      const id = card.getAttribute('data-id');
      if (!snippetLoaded.has(id)) {
        snippetLoaded.add(id);

        const filePath = card.getAttribute('data-file');
        const line = parseInt(card.getAttribute('data-line'));
        vscode.postMessage({ type: 'getSnippet', filePath, line, id });
      }
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.note-snippet.open').forEach(el => {
      el.classList.remove('open');
    });
  });

  window.addEventListener('message', e => {
    const { type, id, snippet, lang } = e.data;
    if (type === 'snippetResult') {
      const el = document.querySelector('[data-id="' + id + '"] .note-snippet');
      if (el && snippet) {
        const code = document.createElement('code');
        code.textContent = snippet;
        const pre = document.createElement('pre');
        pre.appendChild(code);
        el.innerHTML = '';
        el.appendChild(pre);

        el.style.marginTop = '6px';
        el.style.display = 'block';
      }
    }
  });

  document.querySelectorAll('.note-body a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      vscode.postMessage({ type: 'openUrl', url: a.getAttribute('href') });
    });
  });

  document.querySelectorAll('.meta-item.meta-file').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      const relPath = el.getAttribute('title');
      if (!relPath) return;
      navigator.clipboard.writeText(relPath).then(() => {
        const orig = el.textContent;
        el.textContent = '✓ copied';
        setTimeout(() => el.textContent = orig, 1200);
      });
    });
  });

  document.querySelectorAll('.note-tag').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const tag = el.getAttribute('data-tag');
      if (activeTags.has(tag)) {
        activeTags.delete(tag);
      } else {
        activeTags.add(tag);
      }
      document.querySelectorAll('.tag-pill').forEach(p => {
        p.classList.toggle('active', activeTags.has(p.getAttribute('data-tag')));
      });
      applyFilters();
    });
  });

  function renderTagPills() {
    const wrap = document.getElementById('tagPills');
    wrap.innerHTML = '';
    const tags = new Set();
    document.querySelectorAll('.note-tag').forEach(el => tags.add(el.getAttribute('data-tag')));
    [...tags].sort().forEach(tag => {
      const pill = document.createElement('button');
      pill.className = 'filter-btn tag-pill';
      pill.textContent = tag;
      pill.setAttribute('data-tag', tag);
      if (activeTags.has(tag)) pill.classList.add('active');
      pill.addEventListener('click', () => {
        if (activeTags.has(tag)) {
          activeTags.delete(tag);
          pill.classList.remove('active');
        } else {
          activeTags.add(tag);
          pill.classList.add('active');
        }
        applyFilters();
      });
      wrap.appendChild(pill);
    });
  }
  
  function applyFilters() {
    const cards = document.querySelectorAll('.note-card');
    let visible = 0;
    cards.forEach(card => {
      const priority      = card.getAttribute('data-priority');
      const text          = card.textContent.toLowerCase();
      const priorityMatch = activePriority === 'all'
        ? priority !== 'completed'
        : priority === activePriority;
      const searchMatch   = !searchTerm || text.includes(searchTerm);
     const tagMatch = activeTags.size === 0 ||
        [...activeTags].every(tag => 
          [...card.querySelectorAll('.note-tag')].some(t => t.getAttribute('data-tag') === tag)
        );
      if (priorityMatch && searchMatch && tagMatch) { card.classList.remove('hidden'); visible++; }
      else { card.classList.add('hidden'); }
    });

    const visibleCards = [...document.querySelectorAll('.note-card:not(.hidden)')];
    const visibleFiles = new Set(visibleCards.map(c => c.getAttribute('data-file'))).size;
    document.getElementById('statsLabel').textContent =
      visible + ' note' + (visible !== 1 ? 's' : '') + ' · ' + visibleFiles + ' file' + (visibleFiles !== 1 ? 's' : '') + ' · ${APP_ID} · ${HOST_NAME}';
  }

  function getSortedCards() {
    const sort = document.getElementById('sortSelect').value;
    const cards = [...document.querySelectorAll('.note-card')];
    const priorityOrder = { high: 0, medium: 1, low: 2, none: 3, completed: 4 };

    cards.sort((a, b) => {
      const at = parseInt(a.getAttribute('data-ts'));
      const bt = parseInt(b.getAttribute('data-ts'));
      const pd = (priorityOrder[a.getAttribute('data-priority')] ?? 3)
               - (priorityOrder[b.getAttribute('data-priority')] ?? 3);
      const aLocal = a.getAttribute('data-local') === 'true' ? 0 : 1;
      const bLocal = b.getAttribute('data-local') === 'true' ? 0 : 1;
      const line   = parseInt(a.getAttribute('data-line')) - parseInt(b.getAttribute('data-line'));

      if (sort === 'newest') {
        // priority → newest → line
        if (pd !== 0) return pd;
        if (bt !== at) return bt - at;
        return line;
      }
      if (sort === 'oldest') {
        // priority → oldest → line
        if (pd !== 0) return pd;
        if (bt !== at) return at - bt;
        return line;
      }
      // workspace: current first → priority → newest → line
      if (aLocal !== bLocal) return aLocal - bLocal;
      if (pd !== 0) return pd;
      if (bt !== at) return bt - at;
      return line;
    });

    const list = document.getElementById('notesList');
    cards.forEach(c => list.appendChild(c));
  }

  document.getElementById('sortSelect').addEventListener('change', () => { saveState(); getSortedCards(); });
 
  document.getElementById('prioritySelect').addEventListener('change', e => {
    activePriority = e.target.value;
    saveState();
    applyFilters();
  });

  document.getElementById('searchInput').addEventListener('input', e => {
    searchTerm = e.target.value.toLowerCase().trim();
    saveState();
    applyFilters();
  });

  document.getElementById('exportBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'exportMarkdown' });
  });

  // run on load
  getSortedCards();
  renderTagPills(); 
  applyFilters();

  document.getElementById('searchInput').focus();
  </script>
</body>
</html>`;
}