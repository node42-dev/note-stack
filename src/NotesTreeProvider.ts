/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import * as path from 'path';
import * as vscode from 'vscode';
import { NoteEntry, TreeNode } from './types';
import { escapeMarkdown, formatTimestamp, prioritySort, timeAgo } from './utils';


export class NotesTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // Circular dep avoided by accepting the notes getter as a function
  constructor(
    private readonly getNotes: () => { [filePath: string]: NoteEntry[] },
    private readonly onOpenNote: (item: { filePath: string; fileName: string; note: NoteEntry }) => void
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    if (typeof element === 'string') {
      const item = new vscode.TreeItem(element, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = 'file';
      item.iconPath = new vscode.ThemeIcon('file');
      return item;
    }

    const label = element.note.note.split('\n')[0];
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.label = `[${element.note.line + 1}] ${label}`;
    item.description = undefined;
    item.contextValue = element.note.refUrl?.length ? 'noteWithUrl' : 'note';
    item.iconPath = this.noteIcon(element.note);
    item.command = {
      command: 'noteStack.openNote',
      title: 'Open Note',
      arguments: [element],
    };

    const md = new vscode.MarkdownString();
    md.isTrusted = false;

    const machine = element.note.hostName
      ? `\n\n\`${element.note.machineId?.slice(0, 8) ?? ''}\` · *${element.note.hostName}*`
      : element.note.machineId ? `\n\n\`${element.note.machineId.slice(0, 8)}\`` : '';

    const author = element.note.author ? `${element.note.author} · ` : ''; 
    const daysLabel = timeAgo(element.note.timestamp);

    md.appendMarkdown(`${author}*${formatTimestamp(element.note.timestamp)}* (${daysLabel})`);
    md.appendMarkdown('\n\n');
    md.appendMarkdown(escapeMarkdown(element.note.note).replace(/\n/g, '  \n'));
    
    md.appendMarkdown('\n\n');
    md.appendMarkdown(machine);
    
    item.tooltip = md;
    return item;
  }

  getChildren(element?: TreeNode): Thenable<TreeNode[]> {
    const all = this.getNotes();

    if (!element) {
      const files = Object.keys(all).filter(f => all[f].length > 0);
      return Promise.resolve(files);
    }

    if (typeof element === 'string') {
      const notes = all[element] ?? [];
      const sorted = [...notes].sort((a, b) => {
        const pd = prioritySort(a.priority, b.priority);
        return pd !== 0 ? pd : a.line - b.line;
      });
      return Promise.resolve(
        sorted.map(n => ({ filePath: element, fileName: path.basename(element), note: n }))
      );
    }

    return Promise.resolve([]);
  }

  private noteIcon(note: NoteEntry): vscode.ThemeIcon {
    if (note.priority === 'high')      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.red'));
    if (note.priority === 'medium')    return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.yellow'));
    if (note.priority === 'low')       return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green'));
    if (note.priority === 'completed') return new vscode.ThemeIcon('pass-filled',   new vscode.ThemeColor('testing.iconPassed'));
    return new vscode.ThemeIcon('note');
  }
}
