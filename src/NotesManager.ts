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

import {
  codeTagToRequestContext,
  getBrowserBridgeProvider,
  noteToRequestContext,
} from "./browserBridge";
import { CodeTagsBrowserPanel, ICodeTagsBrowserManager } from "./CodeTagsBrowserPanel";
import { CodeTagScanner } from "./CodeTagScanner";
import { APP_ID, HOST_NAME, MACHINE_ID, PRIORITY_LABEL } from "./constants";
import { DocsBrowserPanel, IDocsBrowserManager } from "./DocsBrowserPanel";
import { DocsScanner } from "./DocsScanner";
import { INotesBrowserManager, NotesBrowserPanel } from "./NotesBrowserPanel";
import { openNoteEditor } from "./NotesEditorPanel";
import { NotesTreeDataProvider } from "./NotesTreeProvider";
import { zipProjectRoot } from "./projectZipper";
import {
  CodeTagEntry,
  CodeTagStats,
  CodeTagsStore,
  DocEntry,
  DocsStore,
  GlobalNotesStore,
  NoteEntry,
  NotesStore,
} from "./types";

import {
  codeBlockMarkdown,
  escapeMarkdown,
  findAnchorCandidates,
  formatTimestamp,
  generateUUID,
  getGitCommitHash,
  getGitUserName,
  priorityBadge,
  prioritySort,
  timeAgo,
  updateWorkspaceStats
} from "./utils";

export class NotesManager implements vscode.Disposable, INotesBrowserManager, ICodeTagsBrowserManager, IDocsBrowserManager {
  private notes: NotesStore = {};
  private notesFilePath!: string;
  private globalNotesFilePath!: string;
  private treeDataProvider!: NotesTreeDataProvider;
  private decorationType!: vscode.TextEditorDecorationType;
  private gutterDecorationType!: vscode.TextEditorDecorationType;
  private outputChannel!: vscode.OutputChannel;
  private lastCursorPosition?: number;
  private browserPanel?: NotesBrowserPanel;
  private codeTagBrowserPanel?: CodeTagsBrowserPanel;
  private statusBarItem!: vscode.StatusBarItem;
  private noteInFlight?: { filePath: string; note: NoteEntry };
  private noteCountThreshold!: number;
  private codeTagScanner!: CodeTagScanner;
  private docsScanner!: DocsScanner;
  private docsBrowserPanel?: DocsBrowserPanel;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.initialize();
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  private initialize(): void {
    this.outputChannel = vscode.window.createOutputChannel("NoteStack");
    this.log("Extension starting…");

    const ws = this.getWorkspaceRoot();

    this.notesFilePath = ws ? path.join(ws, ".vscode", "note-stack.json") : "";

    const configuredPath = vscode.workspace
      .getConfiguration("noteStack")
      .get<string>("storageLocation", "")
      .trim();

    const globalDir = configuredPath || this.context.globalStorageUri.fsPath;
    if (configuredPath) {
      this.log(`Using custom storage location: ${globalDir}`);
    }

    try {
      if (!fs.existsSync(globalDir))
        fs.mkdirSync(globalDir, { recursive: true });
    } catch (e) {
      this.log(`Global storage dir error: ${e}`);
    }

    this.globalNotesFilePath = path.join(
      globalDir,
      `note-stack-${APP_ID}.json`,
    );
    this.log(`Local notes file:  ${this.notesFilePath}`);
    this.log(`Global notes file: ${this.globalNotesFilePath}`);

    this.noteCountThreshold = vscode.workspace
      .getConfiguration("noteStack")
      .get<number>("noteCountThreshold", 300);

    this.log(`Note count threshold: ${this.noteCountThreshold}`);

    this.createDecorationTypes();
    this.createStatusBarItem();

    this.treeDataProvider = new NotesTreeDataProvider(
      () => this.notes,
      () => this.codeTagScanner.getStore(),
      () => this.docsScanner.getStore(),
    );
    vscode.window.createTreeView("noteStack", {
      treeDataProvider: this.treeDataProvider,
    });

    this.codeTagScanner = new CodeTagScanner();
    this.codeTagScanner.onDidChange(() => {
      this.treeDataProvider.refresh();
      this.codeTagBrowserPanel?.update(this);
    });
    this.codeTagScanner.setupWatcher();
    this.codeTagScanner.scanWorkspace();

    this.docsScanner = new DocsScanner();
    this.docsScanner.onDidChange(() => {
      this.treeDataProvider.refresh();
      this.docsBrowserPanel?.update(this);
    });
    this.docsScanner.setupWatcher();
    this.docsScanner.scanWorkspace();

    this.loadNotes();
    this.setupEventListeners();
    this.updateBrowserBridgeContext();
    this.updateWorkspaceRootContext();
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() =>
        this.updateWorkspaceRootContext(),
      ),
    );

    this.log("Initialized");
  }

  // ── Explorer root detection ──────────────────────────────────────────────────

  private updateWorkspaceRootContext(): void {
    const basenames = (vscode.workspace.workspaceFolders ?? []).map((f) =>
      path.basename(f.uri.fsPath),
    );
    vscode.commands.executeCommand(
      "setContext",
      "noteStack.workspaceRootBasenames",
      basenames,
    );
  }

  // ── Browser Bridge availability ─────────────────────────────────────────────

  private async updateBrowserBridgeContext(): Promise<void> {
    const provider = await getBrowserBridgeProvider();
    vscode.commands.executeCommand(
      "setContext",
      "noteStack.browserBridgeInstalled",
      !!provider,
    );
  }

  log(msg: string): void {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${msg}`);
  }

  // ── Statusbar Item ─────────────────────────────────────────────────────────

  private createStatusBarItem(): void {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.statusBarItem.command = "noteStack.openBrowser";
    this.statusBarItem.tooltip = "Open NoteStack Browser";
    this.statusBarItem.show();
    this.context.subscriptions.push(this.statusBarItem);
  }

  // ── Decoration ─────────────────────────────────────────────────────────────

  private createDecorationTypes(): void {
    const isDark =
      vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
      vscode.window.activeColorTheme.kind ===
        vscode.ColorThemeKind.HighContrast;

    this.gutterDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.getGutterIcon(isDark ? "#fff" : "#000"),
      gutterIconSize: "contain",
      overviewRulerColor: new vscode.ThemeColor(
        "editorOverviewRuler.wordHighlightForeground",
      ),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });

    this.decorationType = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor("editor.wordHighlightBackground"),
    });
  }

  private getGutterIcon(color: string): string {
    const dir = path.join(this.context.extensionPath, "resources");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const iconPath = path.join(dir, "note-marker.svg");
    const svg = `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="1" width="2" height="18" rx="1" fill="${color}"/></svg>`;
    try {
      fs.writeFileSync(iconPath, svg);
    } catch (e) {
      this.log(`Icon write failed: ${e}`);
    }
    return iconPath;
  }

  // ── Workspace helpers ──────────────────────────────────────────────────────

  private getWorkspaceRoot(): string {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : "";
  }

  private getWorkspaceKey(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return "__no_workspace__";
    return folders[0].uri.toString();
  }

  getWorkspaceRootPublic(): string {
    return this.getWorkspaceRoot();
  }

  private getRelativeFilePath(fsPath: string): string {
    const root = this.getWorkspaceRoot();
    return root && fsPath.startsWith(root)
      ? path.relative(root, fsPath)
      : fsPath;
  }

  // ── Rate Limiting / Debounce ────────────────────────────────────────────────────────

  private debounce<T extends (...args: any[]) => any>(fn: T, delay: number) {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    };
  }

  private updateDecorationsDebounced = this.debounce(() => {
    const editor = vscode.window.activeTextEditor;
    if (editor) this.updateDecorations(editor);
  }, 250);

  // ── Event listeners ────────────────────────────────────────────────────────

  private setupEventListeners(): void {
    vscode.extensions.onDidChange(
      () => this.updateBrowserBridgeContext(),
      null,
      this.context.subscriptions,
    );

    vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (
          e.affectsConfiguration("noteStack.ticketTrackers") &&
          this.browserPanel
        ) {
          this.browserPanel.refreshTicketLinker();
          this.browserPanel.update(this);
        }
        if (
          e.affectsConfiguration("noteStack.codeTagKeywords") ||
          e.affectsConfiguration("noteStack.codeTagBlameDrift")
        ) {
          this.codeTagScanner.scanWorkspace();
        }
        if (e.affectsConfiguration("noteStack.storageLocation")) {
          const newPath = vscode.workspace
            .getConfiguration("noteStack")
            .get<string>("storageLocation", "")
            .trim();
          this.globalNotesFilePath = newPath
            ? path.join(newPath, `note-stack-${APP_ID}.json`)
            : path.join(
                this.context.globalStorageUri.fsPath,
                `note-stack-${APP_ID}.json`,
              );
          this.log(`Storage location changed: ${this.globalNotesFilePath}`);
          this.loadNotes();
        }
      },
      null,
      this.context.subscriptions,
    );

    vscode.window.onDidChangeActiveColorTheme(
      () => {
        this.gutterDecorationType.dispose();
        this.decorationType.dispose();
        this.createDecorationTypes();
        const editor = vscode.window.activeTextEditor;
        if (editor) this.updateDecorations(editor);
      },
      null,
      this.context.subscriptions,
    );

    vscode.window.onDidChangeTextEditorSelection((e) => {
      const line = e.selections[0].active.line;
      if (this.lastCursorPosition === line) return;
      this.lastCursorPosition = line;
      this.updateContextMenuState(e.textEditor);
    });

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      this.log(`Editor changed: ${editor?.document.fileName ?? "none"}`);
      if (editor) {
        setTimeout(() => {
          this.updateDecorations(editor);
          this.updateContextMenuState(editor);
          if (this.browserPanel) {
            try {
              this.browserPanel.update(this);
            } catch {
              /* panel may be disposing */
            }
          }
        }, 100);
      }
    });

    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        setTimeout(() => {
          this.updateDecorationsDebounced();
          this.updateContextMenuState(editor);
        }, 500);
      }
    });

    const current = vscode.window.activeTextEditor;
    if (current) {
      setTimeout(() => {
        this.updateDecorations(current);
        this.updateContextMenuState(current);
      }, 200);
    }
  }

  // ── JSON Validation ────────────────────────────────────────────────────────────

  private isValidNote(n: any): boolean {
    return (
      typeof n?.line === "number" &&
      typeof n?.character === "number" &&
      typeof n?.note === "string" &&
      typeof n?.timestamp === "string"
    );
  }

  private sanitizeStore(raw: any): GlobalNotesStore {
    if (typeof raw !== "object" || !raw) return {};
    const result: GlobalNotesStore = {};
    for (const [wsKey, wsStore] of Object.entries(raw)) {
      if (typeof wsStore !== "object" || !wsStore) continue;
      result[wsKey] = {};
      for (const [filePath, notes] of Object.entries(wsStore as any)) {
        if (!Array.isArray(notes)) continue;
        const valid = notes.filter((n) => this.isValidNote(n));
        if (valid.length) result[wsKey][filePath] = valid;
      }
    }
    return result;
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  private readAllGlobalStores(): GlobalNotesStore {
    const dir = path.dirname(this.globalNotesFilePath);
    if (!fs.existsSync(dir)) return {};
    try {
      const merged: GlobalNotesStore = {};
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith("note-stack-") && f.endsWith(".json"));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(dir, file), "utf8");
          const store = JSON.parse(raw) as GlobalNotesStore;

          for (const [wsKey, wsStore] of Object.entries(store)) {
            if (!merged[wsKey]) merged[wsKey] = {};

            for (const [filePath, notes] of Object.entries(wsStore)) {
              if (!merged[wsKey][filePath]) merged[wsKey][filePath] = [];
              /*
                Current behaviour:
                - Private notes from own machine always show.
                - Private notes from other machines are silently excluded.
              */
              const visible = notes.filter(
                (n) => !n.private || n.machineId?.startsWith(APP_ID),
              );
              merged[wsKey][filePath].push(...visible);
            }
          }
        } catch {
          /* skip corrupt file */
        }
      }
      return merged;
    } catch {
      return {};
    }
  }

  private readMyGlobalStore(): GlobalNotesStore {
    if (!fs.existsSync(this.globalNotesFilePath)) return {};
    try {
      const raw = fs.readFileSync(this.globalNotesFilePath, "utf8");
      const store = this.sanitizeStore(JSON.parse(raw)) as GlobalNotesStore;
      return store;
    } catch (err: any) {
      this.log(`Failed to parse notes file: ${err}`);
      vscode.window.showErrorMessage(
        `NoteStack: Notes file is corrupt: ${this.globalNotesFilePath}`,
      );
      return {};
    }
  }

  private readGlobalStore(): GlobalNotesStore {
    const showSharedNotes = vscode.workspace
      .getConfiguration("noteStack")
      .get<boolean>("showSharedNotes", false);

    if (showSharedNotes) {
      return this.readAllGlobalStores();
    } else {
      return this.readMyGlobalStore();
    }
  }

  private async loadNotes(): Promise<void> {
    const store = this.readMyGlobalStore();
    const key = this.getWorkspaceKey();

    //this.log(`Store keys: ${Object.keys(store).join(', ')}`);
    //this.log(`Using key: ${key}`);

    if (store[key] && Object.keys(store[key]).length > 0) {
      this.notes = store[key];
      this.log(
        `Loaded ${Object.keys(this.notes).length} files from store (key: ${key})`,
      );

      this.treeDataProvider.refresh();
      const editor = vscode.window.activeTextEditor;
      if (editor) setTimeout(() => this.updateDecorations(editor), 300);
      return;
    }

    // Migration: only runs if no notes found in global store for this workspace
    if (this.notesFilePath && fs.existsSync(this.notesFilePath)) {
      try {
        const local = JSON.parse(
          fs.readFileSync(this.notesFilePath, "utf8"),
        ) as NotesStore;
        if (Object.keys(local).length > 0) {
          this.notes = local;
          this.log(
            `Migrated ${Object.keys(this.notes).length} files from local store`,
          );
          await this.saveNotes();
        }
      } catch (e) {
        this.log(`Local migration failed: ${e}`);
        this.notes = {};
      }
    }

    this.treeDataProvider.refresh();
    const editor = vscode.window.activeTextEditor;
    if (editor) setTimeout(() => this.updateDecorations(editor), 300);
  }

  private async saveNotes(): Promise<void> {
    const key = this.getWorkspaceKey();

    /** 
      FIXME: Strip transient notes and empty file entries before saving
      <a1exnd3r 2026-05-02 p:2>
    */
    for (const filePath of Object.keys(this.notes)) {
      this.notes[filePath] = this.notes[filePath]?.filter(
        (n) => !(n as any).__transient,
      );
      if (!this.notes[filePath]?.length) delete this.notes[filePath];
    }

    // Global store
    if (this.globalNotesFilePath) {
      try {
        const store = this.readMyGlobalStore();
        store[key] = this.notes;
        fs.writeFileSync(
          this.globalNotesFilePath,
          JSON.stringify(store, null, 2),
        );
        this.log(`Saved to global store (key: ${key})`);
      } catch (e) {
        this.log(`Global save failed: ${e}`);
        vscode.window.showErrorMessage(
          `NoteStack: Failed to save to global store: ${this.globalNotesFilePath}`,
        );
      }
    }

    // Local mirror
    if (this.notesFilePath) {
      try {
        const dir = path.dirname(this.notesFilePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          this.notesFilePath,
          JSON.stringify(this.notes, null, 2),
        );
      } catch (e) {
        this.log(`Local save failed (non-fatal): ${e}`);
      }
    }

    this.treeDataProvider.refresh();
    this.updateStatusBar(vscode.window.activeTextEditor);

    if (this.browserPanel) {
      try {
        this.browserPanel.update(this);
      } catch {
        /* panel may be disposing */
      }
    }
  }

  // ── Context menu ───────────────────────────────────────────────────────────

  updateContextMenuState(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      vscode.commands.executeCommand(
        "setContext",
        "noteStack.hasNoteAtLine",
        false,
      );
      return;
    }
    const line = editor.selection.active.line;
    const rel = this.getRelativeFilePath(editor.document.fileName);
    const fileNotes = this.notes[rel];
    const has = !!fileNotes && fileNotes.some((n) => n.line === line);
    vscode.commands.executeCommand(
      "setContext",
      "noteStack.hasNoteAtLine",
      has,
    );
  }

  // ── Public note accessors ──────────────────────────────────────────────────

  getAllNotes(): NotesStore {
    return this.notes;
  }

  getAllNotesGlobal(): NotesStore {
    const global = this.readGlobalStore();
    const merged: NotesStore = {};

    for (const [wsKey, store] of Object.entries(global)) {
      const wsName = wsKey.startsWith("file://")
        ? path.basename(decodeURIComponent(wsKey.slice("file://".length)))
        : wsKey;
      const wsRootFs = wsKey.startsWith("file://")
        ? decodeURIComponent(wsKey.slice("file://".length))
        : "";

      for (const [filePath, notes] of Object.entries(store)) {
        const cleanFilePath = filePath.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
        const qualifiedPath = `${wsName} > ${wsRootFs}|${cleanFilePath}`;
        merged[qualifiedPath] = notes;
      }
    }

    return merged;
  }

  private findNotesByAbsPath(absPath: string): NoteEntry[] | undefined {
    const global = this.readGlobalStore();
    for (const store of Object.values(global)) {
      for (const [filePath, notes] of Object.entries(store)) {
        const cleanFilePath = filePath.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
        if (absPath.endsWith(cleanFilePath) || absPath.endsWith(filePath)) {
          return notes;
        }
      }
    }
    return undefined;
  }

  // ── Decorations ────────────────────────────────────────────────────────────

  updateDecorations(editor: vscode.TextEditor): void {
    this.updateStatusBar(editor);

    const rel = this.getRelativeFilePath(editor.document.fileName);
    const fileNotes =
      this.notes[rel] ?? this.findNotesByAbsPath(editor.document.fileName);

    editor.setDecorations(this.decorationType, []);
    editor.setDecorations(this.gutterDecorationType, []);

    if (!fileNotes?.length) return;

    const ranges: vscode.DecorationOptions[] = [];

    for (const n of fileNotes) {
      if (n.line >= editor.document.lineCount) continue;

      const currentContent = editor.document.lineAt(n.line).text.trim();
      const drifted = n.anchor && currentContent !== n.anchor;

      const daysLabel = timeAgo(n.timestamp);
      const timestamp = formatTimestamp(n.timestamp);
      const author = n.author ? `${n.author} · ` : "";

      const machine = n.hostName
        ? `\n\n\`${n.machineId?.slice(0, 8) ?? ""}\` · *${n.hostName}*`
        : n.machineId
          ? `\n\n\`${n.machineId.slice(0, 8)}\``
          : "";

      const md = new vscode.MarkdownString();
      md.isTrusted = true;

      if (drifted) {
        const candidates = findAnchorCandidates(editor.document, n.anchor!);
        md.appendMarkdown(
          `⚠️ **Note drifted** — last anchor:\n${codeBlockMarkdown(n.anchor ?? "")}`,
        );

        if (candidates.length === 0) {
          md.appendMarkdown(`*Anchor not found in document.*\n\n`);
        } else if (candidates[0].exactMatch) {
          const args = encodeURIComponent(
            JSON.stringify([n.id, candidates[0].line]),
          );
          const cmd = `command:noteStack.reanchor?${args}`;
          md.appendMarkdown(
            `✅ **Exact match found at line ${candidates[0].line + 1}**\n${codeBlockMarkdown(candidates[0].text)}\n\n[**Re-anchor**](${cmd})\n\n`,
          );
        } else {
          md.appendMarkdown(`**Possible re-anchor positions:**\n\n`);
          for (const c of candidates) {
            const pct = Math.round(c.similarity * 100);
            md.appendMarkdown(
              `→ **Line ${c.line + 1}** *(${pct}% match)*\n${codeBlockMarkdown(c.text)}`,
            );
          }
        }
      }

      if (n.priority) {
        md.appendMarkdown(
          `${priorityBadge(n.priority)}  ${author}*${timestamp}* (${daysLabel})`,
        );
      } else {
        md.appendMarkdown(`${author}*${timestamp}* (${daysLabel})`);
      }
      md.appendMarkdown("\n\n");
      md.appendMarkdown(escapeMarkdown(n.note).replace(/\n/g, "  \n"));

      md.appendMarkdown("\n\n");
      md.appendMarkdown(machine);

      const endLine = n.textSel?.endLine ?? n.line;
      const endChar =
        n.textSel?.endChar ??
        (editor.document.lineAt(endLine).text.length || 1);
      ranges.push({
        range: new vscode.Range(n.line, 0, endLine, endChar),
        hoverMessage: md,
      });
    }

    editor.setDecorations(this.gutterDecorationType, ranges);
    editor.setDecorations(
      this.decorationType,
      ranges.map((r) => ({ range: r.range })),
    );
  }

  updateStatusBar(editor?: vscode.TextEditor): void {
    const global = this.readGlobalStore();
    
    const globalTotal = Object.values(global)
      .flatMap((s) => Object.values(s))
      .flat().length;

    const localTotal = Object.values(this.notes).reduce(
      (s, n) => s + (n?.length ?? 0),
      0,
    );

    const rel = editor
      ? this.getRelativeFilePath(editor.document.fileName)
      : "";

    const fileNotes = editor
      ? (this.notes[rel] ??
        this.findNotesByAbsPath(editor.document.fileName) ??
        [])
      : [];

    const fileCount = fileNotes.length;
    const codeTagStats = this.codeTagScanner.getStats();
    const totalCount = localTotal + globalTotal;

    this.statusBarItem.text = `$(note) ${totalCount} notes $(tag) ${codeTagStats.total} tags`;
    this.statusBarItem.tooltip = "NoteStack — click to open notes browser";
  }

  // ── Commands ────────────────────────────────────────────────────────────────

  async addNote(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor");
      return;
    }

    const totalNotes = Object.values(this.notes).reduce(
      (sum, n) => sum + (n?.length ?? 0),
      0,
    );
    if (totalNotes >= this.noteCountThreshold) {
      vscode.window.showWarningMessage(
        `NoteStack: workspace limit of ${this.noteCountThreshold} notes reached. Remove some notes before adding new ones.`,
      );
      return;
    }

    const pos = editor.selection.active;
    const rel = this.getRelativeFilePath(editor.document.fileName);
    const gitUser = await getGitUserName();
    const locationLabel = `${gitUser ? `${gitUser} (${APP_ID}) · ` : ""}${path.basename(rel)} · Line ${pos.line + 1}, Col ${pos.character + 1}`;
    const existing = this.notes[rel]?.find((n) => n.line === pos.line);

    const result = await openNoteEditor(
      this.context,
      existing?.note,
      locationLabel,
      existing?.priority,
      existing?.private,
      existing?.refUrl,
    );

    if (result === undefined) {
      return;
    }

    if (!this.notes[rel]) this.notes[rel] = [];

    this.notes[rel] = this.notes[rel].filter((n) => n.line !== pos.line);
    this.notes[rel].push({
      id: generateUUID(),
      line: !editor.selection.isEmpty ? editor.selection.start.line : pos.line,
      character: pos.character,
      note: result.text,
      timestamp: new Date().toLocaleString(),
      priority: result.priority || undefined,
      private: result.private || undefined,
      refUrl: result.refUrl || undefined,
      author: gitUser || undefined,
      machineId: MACHINE_ID,
      hostName: HOST_NAME,
      anchor:
        editor.document
          .lineAt(
            !editor.selection.isEmpty ? editor.selection.start.line : pos.line,
          )
          .text.trim() || undefined,
      textSel: !editor.selection.isEmpty
        ? {
            startLine: editor.selection.start.line,
            endLine: editor.selection.end.line,
            startChar: editor.selection.start.character,
            endChar: editor.selection.end.character,
          }
        : undefined,
      commitHash: getGitCommitHash(this.getWorkspaceRoot()) || undefined,
    });

    await this.saveNotes();
    this.lastCursorPosition = undefined;

    this.updateContextMenuState(editor);
    this.updateDecorations(editor);
  }

  async removeNote(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor");
      return;
    }

    const pos = editor.selection.active;
    const rel = this.getRelativeFilePath(editor.document.fileName);
    if (!this.notes[rel]) {
      vscode.window.showWarningMessage("No notes for this file");
      return;
    }

    const before = this.notes[rel].length;
    this.notes[rel] = this.notes[rel].filter((n) => n.line !== pos.line);

    if (this.notes[rel].length === before) {
      vscode.window.showWarningMessage("No note on this line");
      return;
    }

    await this.saveNotes();
    this.lastCursorPosition = undefined;
    this.updateContextMenuState(editor);
    this.updateDecorations(editor);
  }

  async showNotes(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor");
      return;
    }

    const rel = this.getRelativeFilePath(editor.document.fileName);
    const fileNotes = this.notes[rel];
    if (!fileNotes || fileNotes.length === 0) {
      vscode.window.showInformationMessage("No notes in this file");
      return;
    }

    const items = [...fileNotes]
      .sort((a, b) => a.line - b.line || a.character - b.character)
      .map((n) => ({
        label: `${priorityBadge(n.priority) || "📝"} Line ${n.line + 1}, Col ${n.character + 1}`,
        description: n.note.split("\n")[0],
        detail: `Created: ${n.timestamp}${n.priority ? `  [${n.priority}]` : ""}${n.note.includes("\n") ? "  [multiline]" : ""}`,
        note: n,
      }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a note to navigate to",
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (picked) {
      const p = new vscode.Position(picked.note.line, picked.note.character);
      editor.selection = new vscode.Selection(p, p);
      editor.revealRange(new vscode.Range(p, p));
    }
  }

  async showAllNotes(): Promise<void> {
    const picked = await this.pickNote();
    if (picked) await this.openNote(picked);
  }

  /**
   * Lets the user search/select a note across the whole workspace via QuickPick.
   * Used as a fallback for commands (editNote, deleteNote, showAllNotes) invoked
   * without a tree item, e.g. from the Command Palette or a keybinding.
   */
  private async pickNote(
    placeHolder?: string,
  ): Promise<{ filePath: string; fileName: string; note: NoteEntry } | undefined> {
    type NoteItem = vscode.QuickPickItem & {
      filePath: string;
      note: NoteEntry;
    };
    const items: NoteItem[] = [];

    for (const [filePath, notes] of Object.entries(this.notes)) {
      if (!notes?.length) continue;
      for (const n of notes) {
        items.push({
          label: `${priorityBadge(n.priority) || "📝"} ${path.basename(filePath)} — Line ${n.line + 1}`,
          description: n.note.split("\n")[0],
          detail: `${filePath} · ${n.timestamp}${n.priority ? `  [${n.priority}]` : ""}${n.note.includes("\n") ? "  [multiline]" : ""}`,
          filePath,
          note: n,
        });
      }
    }

    if (items.length === 0) {
      vscode.window.showInformationMessage("No notes in workspace");
      return undefined;
    }

    items.sort((a, b) => {
      const pd = prioritySort(a.note.priority, b.note.priority);
      if (pd !== 0) return pd;
      return a.filePath !== b.filePath
        ? a.filePath.localeCompare(b.filePath)
        : a.note.line - b.note.line;
    });

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: placeHolder ?? `${items.length} notes in workspace`,
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!picked) return undefined;

    return {
      filePath: picked.filePath,
      fileName: path.basename(picked.filePath),
      note: picked.note,
    };
  }

  async openNote(item: {
    filePath: string;
    fileName: string;
    note: NoteEntry;
  }): Promise<void> {
    const root = this.getWorkspaceRoot();
    const absPath = path.isAbsolute(item.filePath)
      ? item.filePath
      : path.join(root, item.filePath);
    const cleanPath = absPath.includes("|")
      ? absPath.split("|").pop()!
      : absPath;

    try {
      const doc = await vscode.workspace.openTextDocument(cleanPath);
      const editor = await vscode.window.showTextDocument(doc, {
        preserveFocus: false,
        preview: false,
        viewColumn: vscode.ViewColumn.One,
      });
      const p = new vscode.Position(item.note.line, item.note.character);
      if (item.note.textSel) {
        const s = item.note.textSel;
        const start = new vscode.Position(s.startLine, s.startChar);
        const end = new vscode.Position(s.endLine, s.endChar);
        editor.selection = new vscode.Selection(start, end);
        editor.revealRange(
          new vscode.Range(start, end),
          vscode.TextEditorRevealType.InCenter,
        );
      } else {
        editor.selection = new vscode.Selection(p, p);
        editor.revealRange(
          new vscode.Range(p, p),
          vscode.TextEditorRevealType.InCenter,
        );
      }

      /**
        ISSUE: if the user adds a new note in the same session after this 
        injection `saveNotes()` gets called and `this.notes` at that 
        point still contains the injected items...
        
        FIXME: Mark items __transient so saveNotes() strips it before writing to disk.

        Ensure remote note is visible — merge into local store temporarily.
        <a1exnd3r 2026-05-02 p:2>
      */
      const rel = this.getRelativeFilePath(cleanPath);
      if (!this.notes[rel]) this.notes[rel] = [];
      if (
        !this.notes[rel].some(
          (n) =>
            n.line === item.note.line && n.machineId === item.note.machineId,
        )
      ) {
        this.notes[rel].push(item.note);
        // Mark as transient — strip before any save
        (item.note as any).__transient = true;
      }

      this.updateDecorations(editor);
    } catch (e) {
      this.log(`Failed to open file: ${item.filePath}`);
      const action = await vscode.window.showErrorMessage(
        `NoteStack: File not found — ${path.basename(item.filePath)}`,
        "Re-anchor",
        "Dismiss",
      );
      if (action !== "Re-anchor") return;

      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFolders: false,
        openLabel: "Re-anchor",
        title: `Re-anchor: ${path.basename(item.filePath)}`,
      });
      if (!uris?.length) return;

      const newAbsPath = uris[0].fsPath;
      const newRel = this.getRelativeFilePath(newAbsPath);
      const oldRel = this.getRelativeFilePath(cleanPath);

      this.log(`Old path: ${oldRel}`);
      this.log(`New path: ${newRel}`);

      const globalStore = this.readMyGlobalStore();
      // Remove old note by id from everywhere
      for (const wsStore of Object.values(globalStore)) {
        for (const key of Object.keys(wsStore)) {
          wsStore[key] = wsStore[key].filter((n) => n.id !== item.note.id);
          if (!wsStore[key].length) delete wsStore[key];
        }
      }

      // Add under new path in current workspace
      const wsKey = this.getWorkspaceKey();
      if (!globalStore[wsKey]) globalStore[wsKey] = {};
      if (!globalStore[wsKey][newRel]) globalStore[wsKey][newRel] = [];
      globalStore[wsKey][newRel].push({ ...item.note });

      // Sync this.notes to match
      this.notes = globalStore[wsKey];

      // Write once
      fs.writeFileSync(
        this.globalNotesFilePath,
        JSON.stringify(globalStore, null, 2),
      );
      this.log(`Re-anchored note ${oldRel} → ${newRel}`);

      this.treeDataProvider.refresh();

      const editor = vscode.window.activeTextEditor;
      if (editor) this.updateDecorations(editor);
      if (this.browserPanel) {
        try {
          this.browserPanel.update(this);
        } catch {
          /* disposing */
        }
      }

      // Open the newly anchored file
      await this.openNote({
        ...item,
        filePath: newRel,
        fileName: path.basename(newRel),
      });
    }
  }

  async sendNoteToAi(item?: {
    filePath: string;
    fileName: string;
    note: NoteEntry;
  }): Promise<void> {
    let filePath: string;
    let note: NoteEntry | undefined;

    if (item) {
      filePath = item.filePath;
      note = item.note;
    } else {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active editor");
        return;
      }
      filePath = this.getRelativeFilePath(editor.document.fileName);
      const pos = editor.selection.active;
      note = this.notes[filePath]?.find((n) => n.line === pos.line);
      if (!note) {
        vscode.window.showWarningMessage("No note on this line");
        return;
      }
    }

    const provider = await getBrowserBridgeProvider();
    if (!provider) {
      vscode.window.showWarningMessage(
        "Browser Bridge extension is not installed. Install it to send notes to Claude or ChatGPT.",
      );
      return;
    }

    const root = this.getWorkspaceRoot();
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(root, filePath);
    const relPath = this.getRelativeFilePath(absPath);
    const uri = vscode.Uri.file(absPath);

    try {
      await provider.sendContext(noteToRequestContext(uri, relPath, note));
      this.log(`Sent note ${note.id} to Browser Bridge.`);
      vscode.window.showInformationMessage("Note sent to the browser.");
    } catch (error) {
      vscode.window.showErrorMessage(`Unable to send note: ${String(error)}`);
    }
  }

  async sendCodeTagToAi(item?: {
    kind: "codeTag";
    entry: CodeTagEntry;
  }): Promise<void> {
    let entry: CodeTagEntry | undefined;

    if (item) {
      entry = item.entry;
    } else {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active editor");
        return;
      }
      const filePath = this.getRelativeFilePath(editor.document.fileName);
      const pos = editor.selection.active;
      const tags = this.codeTagScanner.getStore()[filePath];
      entry = tags?.find((t) => t.line === pos.line);
      if (!entry) {
        vscode.window.showWarningMessage("No code tag on this line");
        return;
      }
    }

    const provider = await getBrowserBridgeProvider();
    if (!provider) {
      vscode.window.showWarningMessage(
        "Browser Bridge extension is not installed. Install it to send code tags to Claude or ChatGPT.",
      );
      return;
    }

    const root = this.getWorkspaceRoot();
    const absPath = path.isAbsolute(entry.filePath)
      ? entry.filePath
      : path.join(root, entry.filePath);
    const relPath = this.getRelativeFilePath(absPath);
    const uri = vscode.Uri.file(absPath);

    try {
      await provider.sendContext(codeTagToRequestContext(uri, relPath, entry));
      this.log(
        `Sent code tag at ${relPath}:${entry.line + 1} to Browser Bridge.`,
      );
      vscode.window.showInformationMessage("Code tag sent to the browser.");
    } catch (error) {
      vscode.window.showErrorMessage(
        `Unable to send code tag: ${String(error)}`,
      );
    }
  }

  async zipProject(uri?: vscode.Uri): Promise<void> {
    const folder = uri
      ? vscode.workspace.getWorkspaceFolder(uri)
      : vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      vscode.window.showWarningMessage("No workspace folder found.");
      return;
    }

    try {
      const maxMb = vscode.workspace
        .getConfiguration("noteStack")
        .get<number>("maxProjectSizeForZip", 30);

      const zipPath = await zipProjectRoot(
        folder.uri.fsPath,
        maxMb * 1024 * 1024,
      );

      this.log(`Zipped project root to ${zipPath}`);

      const action = await vscode.window.showInformationMessage(
        `Project zipped to ${zipPath}`,
        "Open Folder",
      );
      if (action === "Open Folder") {
        await vscode.commands.executeCommand(
          "revealFileInOS",
          vscode.Uri.file(zipPath),
        );
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to zip project: ${String(error)}`);
    }
  }

  async editNote(itemArg?: {
    filePath: string;
    fileName: string;
    note: NoteEntry;
  }): Promise<void> {
    const item = itemArg ?? (await this.pickNote("Select a note to edit"));
    if (!item) return;

    const locationLabel = `${item.fileName} · Line ${item.note.line + 1}, Col ${item.note.character + 1}`;

    const result = await openNoteEditor(
      this.context,
      item.note.note,
      locationLabel,
      item.note.priority,
      item.note.private,
      item.note.refUrl,
    );

    if (result === undefined) return;

    // Try local workspace first
    const localRel =
      this.notes[item.filePath] !== undefined
        ? item.filePath
        : this.getRelativeFilePath(item.filePath);

    if (this.notes[localRel]) {
      const idx = this.notes[localRel].findIndex(
        (n) =>
          n.id === item.note.id ||
          (n.line === item.note.line && n.character === item.note.character),
      );
      if (idx === -1) {
        vscode.window.showWarningMessage("Note not found");
        return;
      }
      this.notes[localRel][idx] = {
        ...this.notes[localRel][idx],
        note: result.text,
        priority: result.priority,
        private: result.private,
        refUrl: result.refUrl,
        timestamp: new Date().toLocaleString(),
      };
      await this.saveNotes();
      const editor = vscode.window.activeTextEditor;
      if (editor) this.updateDecorations(editor);
      return;
    }

    // Note belongs to a different workspace — update global store directly
    const store = this.readMyGlobalStore();
    for (const [wsKey, wsStore] of Object.entries(store)) {
      for (const [filePath, notes] of Object.entries(wsStore)) {
        const idx = notes.findIndex(
          (n) =>
            n.id === item.note.id ||
            (n.line === item.note.line &&
              n.character === item.note.character &&
              filePath === item.filePath),
        );
        if (idx !== -1) {
          store[wsKey][filePath][idx] = {
            ...store[wsKey][filePath][idx],
            note: result.text,
            priority: result.priority,
            private: result.private,
            refUrl: result.refUrl,
            timestamp: new Date().toLocaleString(),
          };
          fs.writeFileSync(
            this.globalNotesFilePath,
            JSON.stringify(store, null, 2),
          );
          this.log(`Saved cross-workspace edit (${wsKey} / ${filePath})`);
          if (this.browserPanel) {
            try {
              this.browserPanel.update(this);
            } catch {
              /* disposing */
            }
          }
          return;
        }
      }
    }

    vscode.window.showWarningMessage("Note not found");
  }

  async editNote_deprecated(item: {
    filePath: string;
    fileName: string;
    note: NoteEntry;
  }): Promise<void> {
    const rel =
      this.notes[item.filePath] !== undefined
        ? item.filePath
        : this.getRelativeFilePath(item.filePath);
    const locationLabel = `${item.fileName} · Line ${item.note.line + 1}, Col ${item.note.character + 1}`;

    this.log(`editNote — item.filePath: ${item.filePath}`);
    this.log(`editNote — rel: ${rel}`);
    this.log(`editNote — notes keys: ${Object.keys(this.notes).join(", ")}`);

    const result = await openNoteEditor(
      this.context,
      item.note.note,
      locationLabel,
      item.note.priority,
      item.note.private,
      item.note.refUrl,
    );

    if (result === undefined) {
      return;
    }

    if (!this.notes[rel]) {
      vscode.window.showWarningMessage("Note not found");
      return;
    }

    const idx = this.notes[rel].findIndex(
      (n) =>
        n.id === item.note.id ||
        (n.line === item.note.line && n.character === item.note.character),
    );
    if (idx === -1) {
      vscode.window.showWarningMessage("Note not found");
      return;
    }

    this.notes[rel][idx] = {
      ...this.notes[rel][idx],
      note: result.text,
      priority: result.priority,
      private: result.private,
      refUrl: result.refUrl,
      timestamp: new Date().toLocaleString(),
    };

    await this.saveNotes();
    const editor = vscode.window.activeTextEditor;
    if (editor) this.updateDecorations(editor);
  }

  async moveNote(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor");
      return;
    }

    const pos = editor.selection.active;
    const rel = this.getRelativeFilePath(editor.document.fileName);
    const note = this.notes[rel]?.find((n) => n.line === pos.line);
    if (!note) {
      vscode.window.showWarningMessage("No note on this line");
      return;
    }

    this.noteInFlight = { filePath: rel, note };
    await vscode.commands.executeCommand(
      "setContext",
      "noteStack.noteInFlight",
      true,
    );
    vscode.window
      .showInformationMessage(
        `NoteStack: note picked up — move cursor to target line and right-click → Place Note Here`,
        "Cancel",
      )
      .then((action) => {
        if (action === "Cancel") this.cancelMove();
      });
  }

  async reanchorNote(noteId: string, newLine: number): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const newAnchor = editor.document.lineAt(newLine).text.trim();
    const store = this.readMyGlobalStore();
    let updatedNote: NoteEntry | undefined;

    for (const wsStore of Object.values(store)) {
      for (const notes of Object.values(wsStore)) {
        const n = notes.find((n) => n.id === noteId);
        if (n) {
          const lineDelta = newLine - n.line;

          n.line = newLine;
          n.anchor = newAnchor || undefined;
          n.commitHash = getGitCommitHash(this.getWorkspaceRoot()) || undefined;

          if (n.textSel) {
            const newStartLine = newLine;
            const newEndLine = n.textSel.endLine + lineDelta;
            const safeEndLine = Math.min(
              newEndLine,
              editor.document.lineCount - 1,
            );
            n.textSel = {
              startLine: newStartLine,
              endLine: safeEndLine,
              startChar: n.textSel.startChar,
              endChar: n.textSel.endChar,
            };
          }

          updatedNote = n;
          break;
        }
      }
      if (updatedNote) {
        break;
      }
    }

    if (!updatedNote) {
      vscode.window.showWarningMessage(
        "NoteStack: Note not found for re-anchor",
      );
      return;
    }

    // Write the whole store directly — don't use saveNotes which is workspace-scoped
    fs.writeFileSync(this.globalNotesFilePath, JSON.stringify(store, null, 2));

    // Only sync this.notes if the note belonged to current workspace
    const wsKey = this.getWorkspaceKey();
    if (store[wsKey]) this.notes = store[wsKey];

    // openNote() injects a transient copy of cross-workspace notes into
    // this.notes (keyed by absolute path) so decorations render without
    // switching workspace. That copy is a different object than the one
    // just mutated above, so patch it in place too — otherwise the hover
    // keeps showing the note as drifted until the window reloads.
    for (const notes of Object.values(this.notes)) {
      const idx = notes.findIndex((n) => n.id === noteId);
      if (idx !== -1) notes[idx] = { ...notes[idx], ...updatedNote };
    }

    this.log(`Re-anchored ${noteId} → line ${newLine + 1}: ${newAnchor}`);

    this.treeDataProvider.refresh();
    this.updateDecorations(editor);

    if (this.browserPanel)
      try {
        this.browserPanel.update(this);
      } catch {
        /* disposing */
      }
  }

  async placeNote(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    if (!this.noteInFlight) {
      vscode.window.showWarningMessage("No note in flight");
      return;
    }

    const pos = editor.selection.active;
    const targetRel = this.getRelativeFilePath(editor.document.fileName);
    const { filePath: srcPath, note: srcNote } = this.noteInFlight;

    // Remove from source
    if (this.notes[srcPath]) {
      this.notes[srcPath] = this.notes[srcPath].filter(
        (n) => !(n.line === srcNote.line && n.character === srcNote.character),
      );
    }

    // Place at target
    if (!this.notes[targetRel]) this.notes[targetRel] = [];

    // Remove any existing note at target line
    this.notes[targetRel] = this.notes[targetRel].filter(
      (n) => n.line !== pos.line,
    );

    this.notes[targetRel].push({
      ...srcNote,
      id: srcNote.id ?? generateUUID(),
      line: !editor.selection.isEmpty ? editor.selection.start.line : pos.line,
      character: pos.character,
      anchor:
        editor.document
          .lineAt(
            !editor.selection.isEmpty ? editor.selection.start.line : pos.line,
          )
          .text.trim() || undefined,
      textSel: !editor.selection.isEmpty
        ? {
            startLine: editor.selection.start.line,
            endLine: editor.selection.end.line,
            startChar: editor.selection.start.character,
            endChar: editor.selection.end.character,
          }
        : undefined,
      commitHash: getGitCommitHash(this.getWorkspaceRoot()) || undefined,
    });

    this.noteInFlight = undefined;
    await vscode.commands.executeCommand(
      "setContext",
      "noteStack.noteInFlight",
      false,
    );
    await this.saveNotes();
    this.lastCursorPosition = undefined;
    this.updateContextMenuState(editor);
    this.updateDecorations(editor);
    vscode.window.showInformationMessage("NoteStack: note moved.");
  }

  private cancelMove(): void {
    this.noteInFlight = undefined;
    vscode.commands.executeCommand(
      "setContext",
      "noteStack.noteInFlight",
      false,
    );
  }

  async deleteNote(itemArg?: {
    filePath: string;
    fileName: string;
    note: NoteEntry;
  }): Promise<void> {
    const item = itemArg ?? (await this.pickNote("Select a note to delete"));
    if (!item) return;

    const answer = await vscode.window.showWarningMessage(
      `Delete note on line ${item.note.line + 1} of ${item.fileName}?`,
      { modal: true },
      "Delete",
    );
    if (answer !== "Delete") return;

    const rel =
      this.notes[item.filePath] !== undefined
        ? item.filePath
        : this.getRelativeFilePath(item.filePath);

    if (!this.notes[rel]) {
      vscode.window.showWarningMessage("No notes for this file");
      return;
    }

    const before = this.notes[rel].length;
    this.notes[rel] = this.notes[rel].filter((n) => n.id !== item.note.id);
    if (this.notes[rel].length === before) {
      vscode.window.showWarningMessage("Note not found");
      return;
    }

    await this.saveNotes();
    const editor = vscode.window.activeTextEditor;
    if (editor) this.updateDecorations(editor);
  }

  async toggleNote(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const pos = editor.selection.active;
    const rel = this.getRelativeFilePath(editor.document.fileName);
    const existing = this.notes[rel]?.find((n) => n.line === pos.line);
    if (existing) {
      await this.removeNote();
    } else {
      await this.addNote();
    }
  }

  async clearAllNotes(): Promise<void> {
    const answer = await vscode.window.showWarningMessage(
      "Clear ALL notes in workspace?",
      { modal: true },
      "Yes, Clear All",
      "Cancel",
    );
    if (answer !== "Yes, Clear All") return;
    this.notes = {};
    await this.saveNotes();
    const editor = vscode.window.activeTextEditor;
    if (editor) this.updateDecorations(editor);
  }

  async getStats(): Promise<{
    notes: number;
    files: number;
  }> {
    let totalNotes = 0;
    let totalFiles = 0;
    for (const notes of Object.values(this.notes)) {
      if (notes?.length) {
        totalFiles++;
        totalNotes += notes.length;
      }
    }

    updateWorkspaceStats({ 
      notes: {
        total: totalNotes,
        files: totalFiles
      }
    });

    return { notes: totalNotes, files: totalFiles };
  }

  async getCodeTagScannerStats(): Promise<CodeTagStats> {
    return this.codeTagScanner.getStats();
  }

  getCodeTagsStore(): CodeTagsStore {
    return this.codeTagScanner.getStore();
  }

  getDocsStore(): DocsStore {
    return this.docsScanner.getStore();
  }

  openRefUrl(item: {
    filePath: string;
    fileName: string;
    note: NoteEntry;
  }): void {
    vscode.env.openExternal(vscode.Uri.parse(item.note.refUrl!));
  }

  openNotesBrowser(context: vscode.ExtensionContext): void {
    this.browserPanel = NotesBrowserPanel.createOrShow(context, this);
  }

  openCodeTagBrowser(context: vscode.ExtensionContext): void {
    this.codeTagBrowserPanel = CodeTagsBrowserPanel.createOrShow(context, this);
  }

  openDocsBrowser(context: vscode.ExtensionContext): void {
    this.docsBrowserPanel = DocsBrowserPanel.createOrShow(context, this);
  }

  // ── Import / Export ────────────────────────────────────────────────────────────────

  async importNotes(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { "NoteStack Export": ["json"] },
      title: "Import NoteStack Notes",
    });
    if (!uris?.length) return;

    let incoming: GlobalNotesStore;
    try {
      incoming = this.sanitizeStore(
        JSON.parse(fs.readFileSync(uris[0].fsPath, "utf8")),
      );
    } catch (e) {
      vscode.window.showErrorMessage(
        `NoteStack: Failed to parse import file: ${e}`,
      );
      return;
    }

    const store = this.readMyGlobalStore();
    let imported = 0;

    for (const [wsKey, wsStore] of Object.entries(incoming)) {
      if (!store[wsKey]) store[wsKey] = {};
      for (const [filePath, notes] of Object.entries(wsStore)) {
        if (!store[wsKey][filePath]) store[wsKey][filePath] = [];
        // Merge by id — skip duplicates
        const existingIds = new Set(store[wsKey][filePath].map((n) => n.id));
        const newNotes = notes.filter((n) => !existingIds.has(n.id));
        store[wsKey][filePath].push(...newNotes);
        imported += newNotes.length;
      }
    }

    this.notes = store[this.getWorkspaceKey()] ?? {};
    fs.writeFileSync(this.globalNotesFilePath, JSON.stringify(store, null, 2));
    this.treeDataProvider.refresh();
    if (this.browserPanel)
      try {
        this.browserPanel.update(this);
      } catch {
        /* disposing */
      }
    vscode.window.showInformationMessage(
      `NoteStack: Imported ${imported} note(s).`,
    );
  }

  async exportNotes(): Promise<void> {
    // Let user pick which workspaces/files to export
    const store = this.readMyGlobalStore();
    const wsKeys = Object.keys(store);

    const picked = await vscode.window.showQuickPick(
      wsKeys.map((k) => ({
        label: path.basename(decodeURIComponent(k.replace("file://", ""))),
        detail: k,
        picked: true,
      })),
      { canPickMany: true, placeHolder: "Select workspaces to export" },
    );
    if (!picked?.length) return;

    const exportStore: GlobalNotesStore = {};
    for (const item of picked) {
      exportStore[item.detail] = store[item.detail];
    }

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(
        path.join(this.getWorkspaceRoot() || "", "notestack-export.json"),
      ),
      filters: { "NoteStack Export": ["json"] },
      title: "Export NoteStack Notes",
    });
    if (!uri) return;

    fs.writeFileSync(uri.fsPath, JSON.stringify(exportStore, null, 2));
    vscode.window.showInformationMessage(
      `NoteStack: Exported ${Object.keys(exportStore).length} workspace(s) to ${path.basename(uri.fsPath)}`,
    );
  }

  async exportToMarkdown(): Promise<void> {
    const global = this.readGlobalStore();
    const lines: string[] = [];

    lines.push("# NoteStack Export");
    lines.push(`*Generated: ${new Date().toLocaleString()}*`);
    lines.push("");

    let totalExported = 0;

    for (const [wsKey, store] of Object.entries(global)) {
      const wsName = wsKey.startsWith("file://")
        ? path.basename(decodeURIComponent(wsKey.slice("file://".length)))
        : wsKey;

      lines.push(`## ${wsName}`);
      lines.push(`*${wsKey}*`);
      lines.push("");

      for (const [filePath, notes] of Object.entries(store)) {
        if (!notes?.length) continue;
        const cleanPath = filePath.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
        lines.push(`### ${cleanPath}`);
        lines.push("");

        const sorted = [...notes].sort(
          (a, b) => prioritySort(a.priority, b.priority) || a.line - b.line,
        );

        for (const n of sorted) {
          const badge = priorityBadge(n.priority) || "⚪";
          const label = n.priority ? PRIORITY_LABEL[n.priority] : "No Priority";
          const age = timeAgo(n.timestamp);
          lines.push(`#### ${badge} Line ${n.line + 1} — ${label}`);
          lines.push(`*${n.timestamp} · ${age}*`);
          lines.push("");
          lines.push(n.note);
          lines.push("");
          lines.push("---");
          lines.push("");
          totalExported++;
        }
      }
    }

    if (totalExported === 0) {
      vscode.window.showInformationMessage("NoteStack: no notes to export.");
      return;
    }

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

    const defaultUri = vscode.Uri.file(
      path.join(
        this.getWorkspaceRoot() || process.env.HOME || "",
        `note-stack-export_${dateStr}_${APP_ID}.md`,
      ),
    );

    const saveUri = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { Markdown: ["md"] },
      title: "Export NoteStack",
    });
    if (!saveUri) return;

    try {
      fs.writeFileSync(saveUri.fsPath, lines.join("\n"), "utf8");
      const action = await vscode.window.showInformationMessage(
        `NoteStack: exported ${totalExported} notes to ${path.basename(saveUri.fsPath)}`,
        "Open File",
      );
      if (action === "Open File") {
        const doc = await vscode.workspace.openTextDocument(saveUri);
        await vscode.window.showTextDocument(doc);
      }
    } catch (e) {
      this.log(`Export failed: ${e}`);
      vscode.window.showErrorMessage(
        `NoteStack: Export failed: ${saveUri.fsPath}`,
      );
    }
  }

  rescanCodeTags(): void {
    this.codeTagScanner.scanWorkspace();
  }

  rescanDocs(): void {
    this.docsScanner.scanWorkspace();
  }

  async openCodeTag(entry: CodeTagEntry): Promise<void> {
    try {
      const doc = await vscode.workspace.openTextDocument(entry.filePath);
      const editor = await vscode.window.showTextDocument(doc, {
        preserveFocus: false,
        preview: false,
        viewColumn: vscode.ViewColumn.One,
      });
      const p = new vscode.Position(entry.line, entry.column);
      editor.selection = new vscode.Selection(p, p);
      editor.revealRange(
        new vscode.Range(p, p),
        vscode.TextEditorRevealType.InCenter,
      );
    } catch {
      vscode.window.showErrorMessage(
        `NoteStack: File not found — ${entry.filePath}`,
      );
    }
  }

  async openDoc(entry: DocEntry): Promise<void> {
    try {
      const uri = vscode.Uri.file(entry.filePath);
      await vscode.commands.executeCommand(
        "vscode.openWith",
        uri,
        "vscode.markdown.preview.editor",
        vscode.ViewColumn.One,
      );
    } catch {
      vscode.window.showErrorMessage(
        `NoteStack: File not found — ${entry.filePath}`,
      );
    }
  }

  dispose(): void {
    this.decorationType?.dispose();
    this.gutterDecorationType?.dispose();
    this.outputChannel?.dispose();
    this.statusBarItem?.dispose();
    this.codeTagScanner?.dispose();
    this.codeTagBrowserPanel?.dispose();
    this.docsScanner?.dispose();
    this.docsBrowserPanel?.dispose();
  }
}
