/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import type { BrowserBridgeProvider, RequestContext } from "@bb/provider";
import * as vscode from "vscode";
import { CodeTagEntry, NoteEntry } from "./types";
import { generateUUID } from "./utils";

const BROWSER_BRIDGE_EXTENSION_ID = "node42.browser-bridge-vscode";

const PRIORITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };

export async function getBrowserBridgeProvider(): Promise<
  BrowserBridgeProvider | undefined
> {
  const ext = vscode.extensions.getExtension<BrowserBridgeProvider>(
    BROWSER_BRIDGE_EXTENSION_ID,
  );
  if (!ext) return undefined;
  return ext.isActive ? ext.exports : await ext.activate();
}

export function noteToRequestContext(
  uri: vscode.Uri,
  relativePath: string,
  note: NoteEntry,
): RequestContext {
  const firstLine = note.note.split("\n")[0]?.slice(0, 80) ?? "";
  const range = note.textSel
    ? {
        startLine: note.textSel.startLine,
        startCharacter: note.textSel.startChar,
        endLine: note.textSel.endLine,
        endCharacter: note.textSel.endChar,
      }
    : {
        startLine: note.line,
        startCharacter: note.character,
        endLine: note.line,
        endCharacter: note.character,
      };

  return {
    id: note.id,
    kind: "note",
    prompt: note.note,
    source: {
      uri: uri.toString(),
      relativePath,
      range,
    },
    note: {
      noteId: note.id,
      title: firstLine,
      body: note.note,
      ...(note.priority && { priority: PRIORITY_WEIGHT[note.priority] }),
    },
  };
}

export function codeTagToRequestContext(
  uri: vscode.Uri,
  relativePath: string,
  entry: CodeTagEntry,
): RequestContext {
  return {
    id: generateUUID(),
    kind: "selection",
    prompt: entry.text,
    source: {
      uri: uri.toString(),
      relativePath,
      range: {
        startLine: entry.line,
        startCharacter: entry.column,
        endLine: entry.line,
        endCharacter: entry.column + entry.text.length,
      },
      content: entry.text,
    },
  };
}

export function selectionToRequestContext(
  document: vscode.TextDocument,
  selection: vscode.Selection,
  relativePath: string,
  prompt: string,
): RequestContext {
  return {
    id: generateUUID(),
    kind: "selection",
    prompt,
    source: {
      uri: document.uri.toString(),
      relativePath,
      languageId: document.languageId,
      range: {
        startLine: selection.start.line,
        startCharacter: selection.start.character,
        endLine: selection.end.line,
        endCharacter: selection.end.character,
      },
      content: document.getText(selection),
    },
  };
}
