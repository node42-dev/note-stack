/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import * as vscode from 'vscode';
import { NotesManager } from './NotesManager';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const manager = new NotesManager(context);

  context.subscriptions.push(
    manager,
    vscode.commands.registerCommand('noteStack.addNote',        () => manager.addNote()),
    vscode.commands.registerCommand('noteStack.removeNote',     () => manager.removeNote()),
    
    vscode.commands.registerCommand('noteStack.showNotes',      () => manager.showNotes()),
    vscode.commands.registerCommand('noteStack.showAllNotes',   () => manager.showAllNotes()),
 
    vscode.commands.registerCommand('noteStack.clearAllNotes',  () => manager.clearAllNotes()),
    vscode.commands.registerCommand('noteStack.openNote',       (item) => manager.openNote(item)),
    vscode.commands.registerCommand('noteStack.editNote',       (item) => manager.editNote(item)),
    /**
      Issue: Right-click context menu toggle between Add/Remove Note is laggy —
      caused by setContext async latency when evaluating noteStack.hasNoteAtLine.

      Fix: Replace both addNote/removeNote context menu entries with a single
      `noteStack.toggleNote` command that detects state internally at call time,
      eliminating the setContext round-trip entirely. 
      
      `removeNote` is retained for the tree view inline icon and "Ctrl+Shift+D"
      keybind.

      <a1exnd3r 2026-05-02 p:2>
    */
    //vscode.commands.registerCommand('noteStack.toggleNote',     () => manager.toggleNote()),
    vscode.commands.registerCommand('noteStack.moveNote',       () => manager.moveNote()),
    vscode.commands.registerCommand('noteStack.placeNote',      () => manager.placeNote()),

    vscode.commands.registerCommand('noteStack.reanchor',       (noteId: string, newLine: number) => manager.reanchorNote(noteId, newLine)),

    vscode.commands.registerCommand('noteStack.openRefUrl',     (item) => manager.openRefUrl(item)),
    vscode.commands.registerCommand('noteStack.deleteNote',     (item) => manager.deleteNote(item)),

    vscode.commands.registerCommand('noteStack.exportMarkdown', () => manager.exportToMarkdown()),
    vscode.commands.registerCommand('noteStack.exportNotes',    () => manager.exportNotes()),
    vscode.commands.registerCommand('noteStack.importNotes',    () => manager.importNotes()),

    vscode.commands.registerCommand('noteStack.openBrowser',            () => manager.openNotesBrowser(context)),
    vscode.commands.registerCommand('noteStack.openBrowserFromToolbar', () => manager.openNotesBrowser(context)),

    vscode.commands.registerCommand('noteStack.forceRefresh',   () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) manager.updateDecorations(editor);
    })
  );

  manager.getWorkspaceStats().then(stats => {
    if (stats.totalNotes > 0) {
      vscode.window.showInformationMessage(
        `NoteStack: ${stats.totalNotes} note${stats.totalNotes !== 1 ? 's' : ''} in ${stats.totalFiles} file${stats.totalFiles !== 1 ? 's' : ''}`
      );
    }
  });

  const pending = context.globalState.get<{ filePath: string; line: number; character: number }>('noteStack.pendingOpenFile');
  if (pending) {
    await context.globalState.update('noteStack.pendingOpenFile', undefined);

    const disposable = vscode.window.onDidChangeActiveTextEditor(editor => {
      if (!editor) return;
      disposable.dispose();
      const pos = new vscode.Position(pending.line, pending.character);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    });

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(pending.filePath));
    await vscode.window.showTextDocument(doc, { preserveFocus: false, preview: false });
  }
}

export function deactivate(): void {}