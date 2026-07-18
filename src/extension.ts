/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import * as vscode from "vscode";
import { NotesManager } from "./NotesManager";

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const manager = new NotesManager(context);

  manager.getStats();

  context.subscriptions.push(
    manager,
    vscode.commands.registerCommand("noteStack.addNote", () =>
      manager.addNote(),
    ),
    vscode.commands.registerCommand("noteStack.removeNote", () =>
      manager.removeNote(),
    ),

    vscode.commands.registerCommand("noteStack.showNotes", () =>
      manager.showNotes(),
    ),
    vscode.commands.registerCommand("noteStack.showAllNotes", () =>
      manager.showAllNotes(),
    ),

    vscode.commands.registerCommand("noteStack.clearAllNotes", () =>
      manager.clearAllNotes(),
    ),
    vscode.commands.registerCommand("noteStack.openNote", (item) =>
      manager.openNote(item),
    ),
    vscode.commands.registerCommand("noteStack.editNote", (item) =>
      manager.editNote(item),
    ),
    vscode.commands.registerCommand("noteStack.sendNoteToAi", (item) =>
      manager.sendNoteToAi(item),
    ),
    vscode.commands.registerCommand("noteStack.sendCodeTagToAi", (item) =>
      manager.sendCodeTagToAi(item),
    ),
    vscode.commands.registerCommand("noteStack.zipProject", (uri) =>
      manager.zipProject(uri),
    ),
    /**
      ISSUE: Right-click context menu toggle between Add/Remove Note is laggy —
      caused by setContext async latency when evaluating noteStack.hasNoteAtLine.

      FIX: Replace both addNote/removeNote context menu entries with a single
      `noteStack.toggleNote` command that detects state internally at call time,
      eliminating the setContext round-trip entirely. 
      
      `removeNote` is retained for the tree view inline icon and "Ctrl+Shift+D"
      keybind.

      <a1exnd3r 2026-05-02 p:1>
    */
    //vscode.commands.registerCommand('noteStack.toggleNote',     () => manager.toggleNote()),
    vscode.commands.registerCommand("noteStack.moveNote", () =>
      manager.moveNote(),
    ),
    vscode.commands.registerCommand("noteStack.placeNote", () =>
      manager.placeNote(),
    ),

    vscode.commands.registerCommand(
      "noteStack.reanchor",
      (noteId: string, newLine: number) =>
        manager.reanchorNote(noteId, newLine),
    ),

    vscode.commands.registerCommand("noteStack.openRefUrl", (item) =>
      manager.openRefUrl(item),
    ),
    vscode.commands.registerCommand("noteStack.deleteNote", (item) =>
      manager.deleteNote(item),
    ),

    vscode.commands.registerCommand("noteStack.exportMarkdown", () =>
      manager.exportToMarkdown(),
    ),
    vscode.commands.registerCommand("noteStack.exportNotes", () =>
      manager.exportNotes(),
    ),
    vscode.commands.registerCommand("noteStack.importNotes", () =>
      manager.importNotes(),
    ),

    vscode.commands.registerCommand("noteStack.openBrowser", () =>
      manager.openNotesBrowser(context),
    ),
    vscode.commands.registerCommand("noteStack.openBrowserFromToolbar", () =>
      manager.openNotesBrowser(context),
    ),
    vscode.commands.registerCommand("noteStack.openCodeTagBrowser", () =>
      manager.openCodeTagBrowser(context),
    ),
    vscode.commands.registerCommand("noteStack.openDocsBrowser", () =>
      manager.openDocsBrowser(context),
    ),

    vscode.commands.registerCommand("noteStack.forceRefresh", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        manager.updateDecorations(editor);
      }
      manager.rescanCodeTags();
      manager.rescanDocs();
    }),

    vscode.commands.registerCommand("noteStack.collapseAll", () => {
      vscode.commands.executeCommand("workbench.actions.treeView.noteStack.collapseAll");
    }),

    vscode.commands.registerCommand("noteStack.openCodeTag", (entry) =>
      manager.openCodeTag(entry),
    ),
    vscode.commands.registerCommand("noteStack.openDoc", (entry) =>
      manager.openDoc(entry),
    ),
  );

  const pending = context.globalState.get<{
    filePath: string;
    line: number;
    character: number;
  }>("noteStack.pendingOpenFile");

  if (pending) {
    await context.globalState.update("noteStack.pendingOpenFile", undefined);

    const disposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) return;
      disposable.dispose();
      const pos = new vscode.Position(pending.line, pending.character);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(
        new vscode.Range(pos, pos),
        vscode.TextEditorRevealType.InCenter,
      );
    });

    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.file(pending.filePath),
    );
    await vscode.window.showTextDocument(doc, {
      preserveFocus: false,
      preview: false,
    });
  }
}

export function deactivate(): void {}
