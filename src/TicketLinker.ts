/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

export type TicketSystem = 'jira' | 'linear' | 'github' | 'custom';

export interface TicketTrackerConfig {
  /** Ticket key prefixes this rule applies to e.g. ['N42', 'FEAT'] */
  prefixes: string[];
  system:   TicketSystem;
  /**
   * For jira:   https://yourco.atlassian.net
   * For linear: https://linear.app/yourworkspace   (or omit for short-form)
   * For github: https://github.com/org/repo
   * For custom: full URL template — use {key} placeholder e.g. https://tracker.io/issues/{key}
   */
  baseUrl:  string;
}

export interface TicketMatch {
  key:   string;   // e.g. "N42-123"
  url:   string;   // resolved direct link
  start: number;   // index in original text
  end:   number;
}

// ── Default regex — matches UPPER-1 through UPPER-99999 ────────────────────

const TICKET_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/g;

// ── URL builders ───────────────────────────────────────────────────────────

function buildUrl(key: string, config: TicketTrackerConfig): string {
  const base = config.baseUrl.replace(/\/$/, '');
  switch (config.system) {
    case 'jira': {
      return `${base}/browse/${key}`;
    }
    
    case 'linear': {
      return base
        ? `${base}/issue/${key}`
        : `https://linear.app/issue/${key}`;
    }

    case 'github': {
      // GitHub issues use numeric IDs — extract number from key
      return `${base}/issues/${key.split('-')[1]}`;
    }

    case 'custom': {
      return config.baseUrl.replace('{key}', key);
    }
  }
}

// ── Main class ─────────────────────────────────────────────────────────────

export class TicketLinker {
  private prefixMap = new Map<string, TicketTrackerConfig>();

  constructor(configs: TicketTrackerConfig[] = []) {
    for (const config of configs) {
      for (const prefix of config.prefixes) {
        this.prefixMap.set(prefix.toUpperCase(), config);
      }
    }
  }

  /**
   * Add or replace tracker configs at runtime (e.g. from settings change)
   */
  configure(configs: TicketTrackerConfig[]): void {
    this.prefixMap.clear();
    for (const config of configs) {
      for (const prefix of config.prefixes) {
        this.prefixMap.set(prefix.toUpperCase(), config);
      }
    }
  }

  /**
   * Extract all recognized ticket references from a block of text.
   * Returns only tickets whose prefix is registered.
   */
  extract(text: string): TicketMatch[] {
    const matches: TicketMatch[] = [];
    const re = new RegExp(TICKET_PATTERN.source, 'g');
    let m: RegExpExecArray | null;

    while ((m = re.exec(text)) !== null) {
      const key    = m[1];
      const prefix = key.split('-')[0];
      const config = this.prefixMap.get(prefix);
      if (!config) continue;

      matches.push({
        key,
        url:   buildUrl(key, config),
        start: m.index,
        end:   m.index + key.length,
      });
    }

    return matches;
  }

  /**
   * Replace ticket references in HTML-escaped text with <a> tags.
   * Input must already be HTML-escaped (call escapeHtml first).
   * Returns the modified string.
   */
  linkify(escapedText: string): string {
    if (this.prefixMap.size === 0) return escapedText;

    const re = new RegExp(TICKET_PATTERN.source, 'g');
    return escapedText.replace(re, (match, _key, offset, str) => {
      // Skip if already inside an <a> tag
      const before = str.slice(0, offset);
      const openTags  = (before.match(/<a\b/g)  ?? []).length;
      const closeTags = (before.match(/<\/a>/g) ?? []).length;
      if (openTags > closeTags) return match;

      const prefix = match.split('-')[0];
      const config = this.prefixMap.get(prefix);
      if (!config) return match;
      const url = buildUrl(match, config);
      return `<a href="${url}" title="Open ${match}" class="ticket-link">${match}</a>`;
    });
  }

  hasConfig(): boolean {
    return this.prefixMap.size > 0;
  }
}

// ── Settings parser ────────────────────────────────────────────────────────

/**
 * Parse ticket tracker configs from VS Code settings value.
 *
 * Settings format (array of objects):
 * [
 *   { "prefixes": ["N42", "FEAT"], "system": "jira",   "baseUrl": "https://qvalia.atlassian.net" },
 *   { "prefixes": ["LIN"],         "system": "linear",  "baseUrl": "https://linear.app/qvalia"   }
 * ]
 */
export function parseTicketConfigs(raw: unknown): TicketTrackerConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is TicketTrackerConfig =>
      typeof item === 'object' &&
      item !== null &&
      Array.isArray(item.prefixes) &&
      typeof item.system  === 'string' &&
      typeof item.baseUrl === 'string'
  );
}
