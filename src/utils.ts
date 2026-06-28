/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/


import * as fs from "fs";
import * as path from "path";
import * as vscode from 'vscode';

import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { PRIORITY_ICON } from './constants';
import { AnchorMatch, NotePriority, UrlKind } from './types';

export const DEFAULT_KEYWORDS = [
  "IDEA", "NOTE", "SEE", "REF",
  "ISSUE", "BUG", "TODO", "FIXME",
  "FIX", "HACK", "PORT", "REFACTOR",
  "TEMPORARY", "DEPRECATED", 
  "REVIEW",
];


export function priorityBadge(priority: NotePriority): string {
  if (!priority) return '';
  return PRIORITY_ICON[priority] ?? '';
}

export function prioritySort(a: NotePriority, b: NotePriority): number {
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const oa = a ? (order[a] ?? 3) : 3;
  const ob = b ? (order[b] ?? 3) : 3;
  return oa - ob;
}

export function timeAgo(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffM  = Math.floor(diffMs / 60000);
  const diffH  = Math.floor(diffMs / 3600000);
  const diffD  = Math.floor(diffMs / 86400000);
  return diffM < 1   ? 'just now'
    : diffM < 60     ? `${diffM}m ago`
    : diffH < 24     ? `${diffH}h ago`
    : diffD < 30     ? `${diffD}d ago`
    : diffD < 365    ? `${Math.floor(diffD / 30)}mo ago`
    : `${Math.floor(diffD / 365)}y ago`;
}

export function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return (
    d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0')
  );
} 

export function getItemAge(date?: string, short = false): string {
  if (!date) return "[?]";

  let then;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    then = new Date(`${date}T00:00:00`);
  } else {
    then = new Date(date);
  }
  const now = new Date();

  let seconds = Math.max(
    0,
    Math.floor((now.getTime() - then.getTime()) / 1000),
  );

  const y = Math.floor(seconds / 31536000);
  seconds %= 31536000;

  const mo = Math.floor(seconds / 2592000);
  seconds %= 2592000;

  const d = Math.floor(seconds / 86400);
  seconds %= 86400;

  const h = Math.floor(seconds / 3600);
  seconds %= 3600;

  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  if (y > 0) return short ? `[+${y}y]` : `[${y}y, ${mo}m]`;
  if (mo > 0) return short ? `[+${mo}m]` : `[${mo}m, ${d}d]`;
  if (d > 0) return short ? `[+${d}d]` : `[${d}d, ${h}h]`;
  if (h > 0) return short ? `[+${h}h]` : `[${h}h, ${m}m]`;
  if (m > 0) return short ? `[+${m}m]` : `[${m}m, ${s}s]`;
  return `[${s}s]`;
}


export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|]/g, '\\$&');
}

export function codeBlockMarkdown(text: string, lang = ''): string {
  return `\`\`\`${lang}\n${text}\n\`\`\`\n`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function detectUrlKind(url: string): UrlKind {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('aws.') || host.includes('awsapps'))          return 'aws';
    if (host.includes('atlassian.net') || host.includes('jira.'))   return 'jira';
    if (host === 'app.slack.com' || host.includes('slack.com'))     return 'slack';
    if (host === 'linear.app')                                      return 'linear';
    if (host === 'github.com' || host === 'app.github.com')         return 'github';
    if (host === 'notion.so' || host.includes('notion.site'))       return 'notion';
    if (host.includes('azure.com') || host.includes('dev.azure'))   return 'azure';
    if (host === 'trello.com')                                      return 'trello';
    if (host.includes('asana.com'))                                 return 'asana';
    if (host.includes('app.clickup.com'))                           return 'clickup';
    if (host.includes('cloudflare.com'))                            return 'cloudflare';
    if (host.includes('outlook.'))                                  return 'outlook';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function urlKindLabel(kind: UrlKind): string {
  const labels: Record<UrlKind, string> = {
    aws:        'AWS',
    jira:       'Jira',
    slack:      'Slack',
    linear:     'Linear',
    github:     'GitHub',
    notion:     'Notion',
    azure:      'Azure DevOps',
    trello:     'Trello',
    asana:      'Asana',
    clickup:    'ClickUp',
    cloudflare: 'Cloudflare',
    outlook:    'Outlook',
    unknown:    'Browser',
  };
  return labels[kind];
}

export function urlKindIcon(kind: UrlKind): string {
  const icons: Record<UrlKind, string> = {
    aws:        '$(cloud)',
    jira:       '$(link-external)',
    slack:      '$(comment-discussion)',
    linear:     '$(issues)',
    github:     '$(github)',
    notion:     '$(note)',
    azure:      '$(azure-devops)',
    trello:     '$(tasklist)',
    asana:      '$(checklist)',
    clickup:    '$(check-all)',
    cloudflare: '$(shield)',
    outlook:    '$(mail)',
    unknown:    '$(globe)',
  };
  return icons[kind];
}

export function getGitUserName(): string | undefined {
  try {
    console.log(`Running command: git config user.name`);
    return execSync('git config user.name', { encoding: 'utf8' }).trim() || undefined;
  } catch {
    return undefined;
  }
}

export function getGitCommitHash(cwd: string): string | undefined {
  try {
    console.log(`Running command: cd ${cwd} && git rev-parse HEAD`);
    return execSync('git rev-parse HEAD', { cwd, encoding: 'utf8', stdio: 'pipe' }).trim() || undefined;
  } catch {
    return undefined;
  }
}

export function generateUUID(): string {
  return randomUUID();
}

/**
 * Jaccard similarity on word-level tokens — fast, language-agnostic,
 * handles insertions/deletions better than Levenshtein for code lines.
 */
function lineSimilarity(a: string, b: string): number {
  const tokenize = (s: string) => new Set(s.trim().split(/\W+/).filter(Boolean));
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  return intersection / (ta.size + tb.size - intersection);
}

/**
 * Scan document for the anchor string.
 * Returns exact match if found, otherwise top fuzzy candidates above threshold.
 */
export function findAnchorCandidates(doc: vscode.TextDocument, anchor: string, threshold = 0.5): AnchorMatch[] {
  const results: AnchorMatch[] = [];

  for (let i = 0; i < doc.lineCount; i++) {
    const text = doc.lineAt(i).text;
    
    // Exact match — return immediately, nothing better exists
    if (text.trim() === anchor.trim()) {
      return [{ line: i, text, exactMatch: true, similarity: 1 }];
    }

    const similarity = lineSimilarity(anchor, text);
    if (similarity >= threshold) {
      results.push({ line: i, text, exactMatch: false, similarity });
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity).slice(0, 3);
}


function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getKeywordRe(flags: string = ''): RegExp {
  const raw = vscode.workspace
    .getConfiguration('noteStack')
    .get<string[]>('codeTagKeywords', DEFAULT_KEYWORDS);

  const words = (raw.length ? raw : DEFAULT_KEYWORDS)
    .map(k => k.trim())
    .filter(k => k.length > 0);

  if (words.length === 0) {
    return /a^/g; // never matches
  }

  // Escape special regex characters
  const escaped = words.map(k => escapeRegExp(k)).join('|');

  return new RegExp(`\\b(${escaped})\\b`, flags);
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function updateWorkspaceStats(stats: object, outputDir?: string) {
  if (!outputDir) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;
    outputDir = path.join(folders[0].uri.fsPath, '.vscode');
  }
  ensureDir(outputDir);

  const jsonPath = path.join(outputDir, `note-stack.stats.json`);

  // Read existing stats if present, merge new fields in
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(jsonPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    } catch {
      // corrupt file — start fresh
    }
  }

  const merged = {
    ts: new Date().toISOString(),
    ...existing,
    ...stats,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(merged, null, 2), "utf8");
  console.log(`Saved → ${jsonPath}`);
}

export async function showJsonFile(filePath: string, fileName: string, json: object, autoDelete: number = 0) {
  const ts = new Date().toISOString();
  const tsCompact = ts.replace(/[-:T]/g, "").slice(0, 12);
 
  const jsonPath = path.join(filePath, `${fileName}-${tsCompact}.json`);
  const jsonText = JSON.stringify({
      ts,
      ...json
    }, null, 2);

  fs.writeFileSync(jsonPath, jsonText, "utf8");
  console.log(`Saved → ${jsonPath}`);

  const doc = await vscode.workspace.openTextDocument(
    vscode.Uri.file(jsonPath),
  );

  await vscode.window.showTextDocument(doc, {
    preview: false,
    viewColumn: vscode.ViewColumn.One,
  });

  if (autoDelete) {
    setTimeout(() => {
      try {
        fs.unlinkSync(jsonPath);
        console.log(`Cleaned up temporary file: ${jsonPath}`);
      } catch (err) {
        console.warn("Could not delete temp file", err);
      }
    }, autoDelete);
  }
}

/**
 * Checks if a position in the line is inside a string literal.
 * Handles ', ", and ` with basic escaping awareness.
 */
export function isInsideString(line: string, position: number): boolean {
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;

  for (let i = 0; i < position; i++) {
    const char = line[i];
    const prev = i > 0 ? line[i - 1] : '';

    // Skip escaped quotes
    if (prev === '\\') continue;

    if (char === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
    else if (char === '"' && !inSingle && !inBacktick) inDouble = !inDouble;
    else if (char === '`' && !inSingle && !inDouble) inBacktick = !inBacktick;
  }

  return inSingle || inDouble || inBacktick;
}