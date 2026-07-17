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
import { MentionLinker } from './MentionLinker';
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
  private mentionLinker: MentionLinker;
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
      'noteStackBrowser',
      'NoteStack - Notes',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
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

    this.mentionLinker = new MentionLinker(
      vscode.workspace.getConfiguration('noteStack').get('slackTeamId')
    );
    
    this.noteRenderer = new NoteRenderer(this.ticketLinker, this.mentionLinker);

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
        else if (msg.type === 'openUrl') {
          if (msg.url) {
            vscode.env.openExternal(vscode.Uri.parse(msg.url));
          }
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

    const cssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'media', 'notes', 'browser.css')
    );
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'media', 'notes', 'browser.js')
    );
    const cspSource = this.panel.webview.cspSource;

    this.panel.webview.html = buildBrowserHtml(
      wsName, wsRoot, allNotes, this.noteCountThreshold, this.noteRenderer,
      cssUri.toString(), scriptUri.toString(), cspSource
    );
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
  isLocal:  boolean;
  note:     NoteEntry;
};

export function buildBrowserHtml(
  workspaceName: string,
  workspaceRoot: string,
  notes: NotesStore,
  noteCountThreshold: number,
  noteRenderer: NoteRenderer | undefined,
  cssUri: string,
  scriptUri: string,
  cspSource: string
): string {
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

    // Compare actual workspace roots, not display names — two different
    // projects can share a folder basename (e.g. two "backend" checkouts).
    const isLocal = !!workspaceRoot && !!wsRootFs
      && path.normalize(wsRootFs) === path.normalize(workspaceRoot);

    for (const note of fileNotes) {
      flat.push({ filePath: absFilePath, fileName: path.basename(absFilePath), note, wsLabel, wsRoot: wsRootFs, isLocal });
    }
  }

  flat.sort((a, b) => {
    // 1. Current workspace first
    const aLocal = a.isLocal ? 0 : 1;
    const bLocal = b.isLocal ? 0 : 1;
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

  const rows = flat.map(({ filePath, fileName, note, wsLabel, wsRoot: itemWsRoot, isLocal }, idx) => {
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
        data-local="${isLocal}"
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src ${cspSource};">
<title>NoteStack - Notes</title>
<link rel="stylesheet" href="${cssUri}">
</head>
<body data-app-id="${APP_ID}" data-host-name="${HOST_NAME}">
<div class="header">
  <div class="header-top">
    <span class="header-title">Notes</span>
    <span class="header-stats" id="statsLabel">${noteCount} note${noteCount !== 1 ? 's' : ''} · ${fileCount} file${fileCount !== 1 ? 's' : ''} · ${APP_ID} · ${HOST_NAME}</span>
  </div>
  <div class="filter-bar">
    <button id="localOnlyToggle" class="local-filter-btn" title="Hide notes from other workspaces">📍</button>
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
  <div class="empty-state" id="noResultsState" style="display:none;">
    <div class="empty-icon">🔍</div>
    <div class="empty-title">No matching notes</div>
    <div class="empty-subtitle">Try adjusting your search or filters</div>
  </div>
  ${rows}
</div>
<script src="${scriptUri}"></script>
</body>
</html>`;
}