/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import * as vscode from 'vscode';
import { NotePriority } from './types';

export function openNoteEditor(
  context: vscode.ExtensionContext,
  existing: string | undefined,
  locationLabel: string,
  existingPriority?: NotePriority,
  existingPrivate?: boolean,
  existingRefUrl?: string
): Promise<{ text: string; priority: NotePriority, private: boolean, refUrl: string } | undefined> {
  return new Promise(resolve => {
    const panel = vscode.window.createWebviewPanel(
      'codeNotesEditor',
      existing ? 'Edit Note' : 'New Note',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [],
      }
    );

    panel.webview.html = buildEditorHtml(locationLabel, existing ?? '', existingPriority, existingPrivate, existingRefUrl);

    let resolved = false;

    panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'save') {
        resolved = true;
        panel.dispose();

        const text: string = msg.text;
        const priority: NotePriority = msg.priority || undefined;
        const isPrivate: boolean = msg.private ?? false;
        const refUrl: string = msg.refUrl;
        resolve(text.length > 0 ? { text, priority, private: isPrivate, refUrl } : undefined);
      } 
      else if (msg.type === 'cancel') {
        resolved = true;
        panel.dispose();
        resolve(undefined);
      }
    });

    panel.onDidDispose(() => {
      if (!resolved) resolve(undefined);
    });
  });
}

function buildEditorHtml(
  locationLabel: string,
  initialValue: string,

  existingPriority?: NotePriority,
  existingPrivate?: boolean,
  existingRefUrl?: string
  ): string {
  const jsonLabel    = JSON.stringify(locationLabel);
  const jsonValue    = JSON.stringify(initialValue);
  
  const jsonPriority = JSON.stringify(existingPriority ?? '');
  const jsonPrivate  = JSON.stringify(existingPrivate ?? false);
  const jsonRefUrl   = JSON.stringify(existingRefUrl ?? '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>NoteStack</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:                 var(--vscode-editor-background);
    --fg:                 var(--vscode-editor-foreground);
    --input-bg:           var(--vscode-input-background);
    --input-fg:           var(--vscode-input-foreground);
    --input-border:       var(--vscode-input-border, transparent);
    --input-border-focus: var(--vscode-focusBorder);
    --btn-bg:             var(--vscode-button-background);
    --btn-fg:             var(--vscode-button-foreground);
    --btn-hover:          var(--vscode-button-hoverBackground);
    --btn-secondary-bg:   var(--vscode-button-secondaryBackground);
    --btn-secondary-fg:   var(--vscode-button-secondaryForeground);
    --btn-secondary-hover:var(--vscode-button-secondaryHoverBackground);
    --muted:              var(--vscode-descriptionForeground);
    --font:               var(--vscode-font-family);
    --font-size:          var(--vscode-font-size, 13px);
    --radius:             4px;
  }
  html, body { height: 100%; background: var(--bg); color: var(--fg); font-family: var(--font); font-size: var(--font-size); }
  body { display: flex; flex-direction: column; height: 100vh; padding: 16px; gap: 10px; }
  .location { font-size: 0.85em; opacity: 0.65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: default; }
  label { font-weight: 600; font-size: 0.9em; display: block; margin-bottom: 4px; }
  .editor-wrap { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  textarea {
    flex: 1; width: 100%; min-height: 120px;
    background: var(--input-bg); color: var(--input-fg);
    border: 1px solid var(--input-border); border-radius: var(--radius);
    padding: 8px 10px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: 1.5; resize: none; outline: none; tab-size: 2;
  }
  textarea:focus { border-color: var(--input-border-focus); }
  .hint { font-size: 0.78em; color: var(--muted); margin-top: 4px; cursor: default; }
  .priority-row { display: flex; align-items: center; gap: 10px; }
  .priority-row label { margin-bottom: 0; font-size: 0.88em; white-space: nowrap; flex-shrink: 0; }
  .priority-select {
    background: var(--input-bg); color: var(--input-fg);
    border: 1px solid var(--input-border); border-radius: var(--radius);
    padding: 4px 8px; font-family: var(--font); font-size: var(--font-size);
    outline: none; cursor: pointer; min-width: 140px;
  }
  .priority-select:focus { border-color: var(--input-border-focus); }
  .actions { display: flex; gap: 8px; justify-content: flex-end; padding-top: 4px; }
  button { padding: 5px 14px; border: none; border-radius: var(--radius); cursor: pointer; font-family: var(--font); font-size: var(--font-size); }
  #saveBtn { background: var(--btn-bg); color: var(--btn-fg); }
  #saveBtn:hover { background: var(--btn-hover); }
  #cancelBtn { background: var(--btn-secondary-bg); color: var(--btn-secondary-fg); }
  #cancelBtn:hover { background: var(--btn-secondary-hover); }
  #refUrlInput { width: 100%; padding: 5px 8px 5px 8px; background: var(--input-bg); color: var(--input-fg); border: 1px solid var(--input-border); border-radius: var(--radius); font-family: var(--font); font-size: var(--font-sz); outline: none; }
  .private-group { display: flex; padding: 5px 8px 5px 8px; background: var(--input-bg); color: var(--input-fg); border-radius: var(--radius); }
  .private-hint { padding-left: 5px; }
</style>
</head>
<body>
<div class="location" id="location"></div>
<div class="editor-wrap">
  <textarea id="noteArea" spellcheck="true" placeholder="Write your note here&#10;Supports multiple lines."></textarea>
  <div class="hint">Ctrl+Enter to save &nbsp;&middot;&nbsp; Escape to cancel</div>
</div>
<div class="priority-row">
 <div class="private-group">
    <input type="checkbox" id="private">
    <span class="private-hint">Private</span>
  </div>
  <select id="prioritySelect" class="priority-select">
    <option value="">No Priority</option>
    <option value="high">High</option>
    <option value="medium">Medium</option>
    <option value="low">Low</option>
    <option value="completed">Completed</option>
  </select>
  <input type="text" id="refUrlInput" placeholder="Write your ticket URL here&#10;" autocomplete="off" spellcheck="false">
</div>
<div class="actions">
  <button id="cancelBtn">Cancel</button>
  <button id="saveBtn">Save</button>
</div>
<script>
  const vscode      = acquireVsCodeApi();
  const textarea    = document.getElementById('noteArea');
  const refUrl      = document.getElementById('refUrlInput');
  const locationEl  = document.getElementById('location');
  const prioritySel = document.getElementById('prioritySelect');
  const private     = document.getElementById('private');

  locationEl.textContent = ${jsonLabel};
  textarea.value         = ${jsonValue};

  prioritySel.value      = ${jsonPriority};
  private.checked        = ${jsonPrivate};
  refUrl.value           = ${jsonRefUrl};

  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  function save() {
    vscode.postMessage({ 
      type: 'save', 
      text: textarea.value, 
      priority: prioritySel.value, 
      private: private.checked,
      refUrl: refUrl.value 
    });
  }

  function cancel() {
    vscode.postMessage({ type: 'cancel' });
  }

  document.getElementById('saveBtn').addEventListener('click', save);
  document.getElementById('cancelBtn').addEventListener('click', cancel);

  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
</script>
</body>
</html>`;
}