/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import { MentionLinker } from './MentionLinker';
import { TicketLinker } from './TicketLinker';
import { escapeHtml } from './utils';

/**
 * Renders note body text to safe HTML.
 *
 * Pipeline (order matters):
 *   1. escapeHtml   — sanitize raw input, must be first
 *   2. newlines     — \n → <br>
 *   3. inline code  — `code` → <code class="inline-code">code</code>
 *   4. URLs         — http / https / ftp / mailto → <a>
 *   5. tickets      — QD-123 etc → <a>  (only if TicketLinker configured)
 *
 * Steps 3–5 operate on already-escaped text — no XSS risk from user input.
 */
export class NoteRenderer {

  constructor(
    private readonly ticketLinker?: TicketLinker,
    private readonly mentionLinker?: MentionLinker
  ) {}

  render(rawText: string): string {
    let html = escapeHtml(rawText);
    html = this.applyNewlines(html);
    html = this.applyInlineCode(html);
    html = this.applyMentions(html);
    html = this.applyUrls(html);
    html = this.applyTags(html);  
    html = this.applyTickets(html);
    return html;
  }

  // ── Pipeline ───────────────────────────────────────────────────────────────

  private applyNewlines(html: string): string {
    return html.replace(/\n/g, '<br>');
  }

  private applyInlineCode(html: string): string {
    // Multi-line code block — ```...``` (must come first)
    html = html.replace(/```([\s\S]{1,1000})```/g, (_, inner) =>
      `<pre class="code-block"><code>${inner.replace(/^<br>|<br>$/g, '')}</code></pre>`
    );
    // Inline code — `...`
    html = html.replace(/`([^`\n<>]{1,200})`/g, (_, inner) =>
      `<code class="inline-code">${inner}</code>`
    );
    return html;
  }

  private applyUrls(html: string): string {
    /**
     * Match http / https / ftp / mailto URLs.
     * Stops at whitespace or HTML-unsafe chars.
     * Runs after inline code so URLs inside backticks get wrapped in <code> not <a>.
     *
     * Tag-aware: skip URLs already inside <a> 
     * (e.g. wrapped by applyMentions) or <code>/<pre>.
     */
    const parts = html.split(/(<[^>]+>)/g);
    let inAnchor = 0;
    let inCode = 0;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith('<')) {
        if (/^<a\b/i.test(part)) inAnchor++;
        else if (/^<\/a>/i.test(part)) inAnchor = Math.max(0, inAnchor - 1);
        else if (/^<(code|pre)\b/i.test(part)) inCode++;
        else if (/^<\/(code|pre)>/i.test(part)) inCode = Math.max(0, inCode - 1);
        continue;
      }
      if (inAnchor > 0 || inCode > 0) continue;
      parts[i] = part.replace(
        /(https?:\/\/|ftp:\/\/|mailto:)[^\s<>"'`]+/g,
        url => `<a href="${url}" title="${url}">${url}</a>`
      );
    }
    return parts.join('');
  }

  private applyTags(html: string): string {
    return html.replace(
      /#(?![a-fA-F0-9]{3,8}\b)([a-zA-Z][a-zA-Z0-9_-]{2,})(?=[\s<]|$)/g,
      (match, tag, offset, str) => {
        const before = str[offset - 1];
        if (before === '"' || before === "'" || (before && !/[\s>]/.test(before))) return match;
        return `<span class="note-tag" data-tag="#${tag}">#${tag}</span>`;
      }
    );
  }

  private applyMentions(html: string): string {
    return this.mentionLinker!.linkify(html);
  }

  private applyTickets(html: string): string {
    if (!this.ticketLinker?.hasConfig()) return html;
    /**
     * Runs last — after URLs so ticket IDs inside URLs are not double-linked.
     * TicketLinker.linkify() skips matches already inside an <a> tag.
     */
    return this.ticketLinker.linkify(html);
  }
}