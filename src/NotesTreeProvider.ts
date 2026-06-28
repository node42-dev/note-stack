/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import * as path from "path";
import * as vscode from "vscode";
import { CodeTagsStore, NoteEntry, TreeNode } from "./types";
import {
  escapeMarkdown,
  formatTimestamp,
  getItemAge,
  getKeywordRe,
  prioritySort,
  timeAgo,
} from "./utils";

const KW_ICON_MAP: Record<string, vscode.ThemeIcon> = {
  IDEA: new vscode.ThemeIcon("lightbulb"),
  NOTE: new vscode.ThemeIcon("note"),

  ISSUE: new vscode.ThemeIcon("issues"),
  INFO: new vscode.ThemeIcon("info"),
  QUESTION: new vscode.ThemeIcon("question"),
  REF: new vscode.ThemeIcon("book"),

  BUG: new vscode.ThemeIcon("bug"),
  TODO: new vscode.ThemeIcon("checklist"),

  FIXME: new vscode.ThemeIcon("tools"),
  HACK: new vscode.ThemeIcon("wrench"),
  TEST: new vscode.ThemeIcon("beaker"),
  OPTIMIZE: new vscode.ThemeIcon("rocket"),

  SECURITY: new vscode.ThemeIcon("shield"),
  WARNING: new vscode.ThemeIcon("warning"),

  REFACTOR: new vscode.ThemeIcon("symbol-method"),
  TEMPORARY: new vscode.ThemeIcon("clock"),
  DEPRECATED: new vscode.ThemeIcon("trash"),
  REVIEW: new vscode.ThemeIcon("eye"),

  LINK: new vscode.ThemeIcon("link"),
  GITHUB: new vscode.ThemeIcon("github-alt"),
  PR: new vscode.ThemeIcon("git-pull-request"),
  WWW: new vscode.ThemeIcon("globe"),
};

const PRIORITY_LABEL: Record<number, string> = {
  0: "Low",
  1: "Normal",
  2: "High",
  3: "Critical",
};

export class NotesTreeDataProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // Circular dep avoided by accepting the notes getter as a function
  constructor(
    private readonly getNotes: () => { [filePath: string]: NoteEntry[] },
    private readonly getCodeTags: () => CodeTagsStore,
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    // ── Existing note file (string path) ──────────────────────────────────────
    if (typeof element === "string") {
      const item = new vscode.TreeItem(
        element,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.contextValue = "file";
      item.iconPath = new vscode.ThemeIcon("file");
      return item;
    }

    // ── Code tag nodes ────────────────────────────────────────────────────────
    if ("kind" in element) {
      if (element.kind === "codeTagsRoot") {
        const item = new vscode.TreeItem(
          "Code Tags",
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.contextValue = "codeTagsRoot";
        item.iconPath = new vscode.ThemeIcon("tag");
        return item;
      }

      if (element.kind === "codeTagFile") {
        const item = new vscode.TreeItem(
          path.basename(element.filePath),
          vscode.TreeItemCollapsibleState.Collapsed,
        );
        item.description = vscode.workspace.asRelativePath(element.filePath);
        item.contextValue = "codeTagFile";
        item.iconPath = new vscode.ThemeIcon("file");
        return item;
      }

      if (element.kind === "codeTag") {
        const { entry } = element;
        let treeLabel: vscode.TreeItemLabel;

        switch (entry.type) {
          case "CT": {
            const keywordRe = getKeywordRe("gi");
            const cleanText = entry.text.replace(keywordRe, "").trim();
            treeLabel = {
              label: `${getItemAge(entry.date, true)} ${cleanText}`,
            };
            break;
          }
          case "KW":
          case "KWCT": {
            const prefix =
              entry.type === "KWCT" ? `${getItemAge(entry.date, true)} ` : ``;
            /*    
            const prefix =
              entry.type === "KWCT"
                ? `${getItemAge(entry.date, true)} `
                : `[${entry.line + 1}] `;

            const tagPart = `${entry.tag} `;
            treeLabel = {
              label: `${prefix}${tagPart}${entry.text}`,
              highlights: [[prefix.length, prefix.length + tagPart.length - 1]], // highlight the (TAG) part
            };
            */
            treeLabel = { label: `${prefix}${entry.text}` };
            break;
          }
        }

        const item = new vscode.TreeItem(
          treeLabel,
          vscode.TreeItemCollapsibleState.None,
        );
        item.iconPath = this.codeTagIcon(entry.priority, entry.tag);
        item.contextValue = "codeTag";
        item.command = {
          command: "noteStack.openCodeTag",
          title: "Open Code Tag",
          arguments: [entry],
        };

        const md = new vscode.MarkdownString();
        md.isTrusted = false;
        if (entry.author) md.appendMarkdown(`**${entry.author}**`);
        if (entry.date) md.appendMarkdown(`  ·  *${entry.date}*`);
        
        md.appendMarkdown(`\n\n${escapeMarkdown(entry.text)}`);

        if (entry.tag !== undefined) {
          md.appendMarkdown(`\n\n\`${entry.tag}\``);
          if (entry.priority !== undefined) {
            md.appendMarkdown(` — ${PRIORITY_LABEL[entry.priority]}`);
          }
        }
        
        item.tooltip = md;
        return item;
      }
    }

    // ── Existing note item ─────────────────────────────────────────────────────
    const label = element.note.note.split("\n")[0];
    const item = new vscode.TreeItem(
      label,
      vscode.TreeItemCollapsibleState.None,
    );
    item.label = `${getItemAge(element.note.timestamp, true)} ${label}`;

    item.description = undefined;
    item.contextValue = element.note.refUrl?.length ? "noteWithUrl" : "note";
    item.iconPath = this.noteIcon(element.note);
    item.command = {
      command: "noteStack.openNote",
      title: "Open Note",
      arguments: [element],
    };

    const md = new vscode.MarkdownString();
    md.isTrusted = false;

    const machine = element.note.hostName
      ? `\n\n\`${element.note.machineId?.slice(0, 8) ?? ""}\` · *${element.note.hostName}*`
      : element.note.machineId
        ? `\n\n\`${element.note.machineId.slice(0, 8)}\``
        : "";

    const author = element.note.author ? `${element.note.author} · ` : "";
    const daysLabel = timeAgo(element.note.timestamp);

    md.appendMarkdown(
      `${author}*${formatTimestamp(element.note.timestamp)}* (${daysLabel})`,
    );
    md.appendMarkdown("\n\n");
    md.appendMarkdown(escapeMarkdown(element.note.note).replace(/\n/g, "  \n"));
    md.appendMarkdown("\n\n");
    md.appendMarkdown(machine);

    item.tooltip = md;
    return item;
  }

  getChildren(element?: TreeNode): Thenable<TreeNode[]> {
    // ── Root ──────────────────────────────────────────────────────────────────
    if (!element) {
      const all = this.getNotes();
      const files = Object.keys(all).filter(
        (f) => all[f].length > 0,
      ) as TreeNode[];

      const store = this.getCodeTags();
      const hasCodeTags = Object.values(store).some((arr) => arr.length > 0);
      if (hasCodeTags) files.push({ kind: "codeTagsRoot" });

      return Promise.resolve(files);
    }

    // ── Note file ─────────────────────────────────────────────────────────────
    if (typeof element === "string") {
      const all = this.getNotes();
      const notes = all[element] ?? [];
      const sorted = [...notes].sort((a, b) => {
        const pd = prioritySort(a.priority, b.priority);
        return pd !== 0 ? pd : a.line - b.line;
      });
      return Promise.resolve(
        sorted.map((n) => ({
          filePath: element,
          fileName: path.basename(element),
          note: n,
        })),
      );
    }

    if ("kind" in element) {
      // ── Code tags root ───────────────────────────────────────────────────────
      if (element.kind === "codeTagsRoot") {
        const store = this.getCodeTags();
        const nodes: TreeNode[] = Object.keys(store)
          .filter((f) => store[f].length > 0)
          .sort()
          .map((f) => ({ kind: "codeTagFile" as const, filePath: f }));
        return Promise.resolve(nodes);
      }

      // ── Code tag file ────────────────────────────────────────────────────────
      if (element.kind === "codeTagFile") {
        const store = this.getCodeTags();
        const tags = store[element.filePath] ?? [];
        const sorted = [...tags].sort((a, b) => {
          const ap = a.priority ?? 99;
          const bp = b.priority ?? 99;
          return ap !== bp ? ap - bp : a.line - b.line;
        });
        return Promise.resolve(
          sorted.map((entry) => ({ kind: "codeTag" as const, entry })),
        );
      }
    }

    return Promise.resolve([]);
  }

  private codeTagIcon(priority?: number, tag?: string): vscode.ThemeIcon {
    if (tag && KW_ICON_MAP[tag]) {
      return KW_ICON_MAP[tag];
    }

    switch (priority) {
      case 0:
        return new vscode.ThemeIcon(
          "circle-filled",
          new vscode.ThemeColor("charts.black"),
        );
      case 1:
        return new vscode.ThemeIcon(
          "circle-filled",
          new vscode.ThemeColor("charts.green"),
        );
      case 2:
        return new vscode.ThemeIcon(
          "circle-filled",
          new vscode.ThemeColor("charts.yellow"),
        );
      case 3:
        return new vscode.ThemeIcon(
          "circle-filled",
          new vscode.ThemeColor("charts.red"),
        );
      default:
        return new vscode.ThemeIcon("tag");
    }
  }

  private noteIcon(note: NoteEntry): vscode.ThemeIcon {
    if (note.priority === "high")
      return new vscode.ThemeIcon(
        "circle-filled",
        new vscode.ThemeColor("charts.red"),
      );
    if (note.priority === "medium")
      return new vscode.ThemeIcon(
        "circle-filled",
        new vscode.ThemeColor("charts.yellow"),
      );
    if (note.priority === "low")
      return new vscode.ThemeIcon(
        "circle-filled",
        new vscode.ThemeColor("charts.green"),
      );
    if (note.priority === "completed")
      return new vscode.ThemeIcon(
        "pass-filled",
        new vscode.ThemeColor("testing.iconPassed"),
      );
    return new vscode.ThemeIcon("note");
  }
}
