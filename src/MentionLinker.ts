/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

/**
 * Converts Slack profile URLs into @mention-style links.
 *
 *   1. Labeled:  [Alex](https://workspace.slack.com/team/U0ATJSRKMLN)
 *                → <a href="...U0ATJSRKMLN" class="mention">@Alex</a>
 *
 *   2. Bare URL on its own: https://workspace.slack.com/team/U04TCCVB2
 *                → <a href="..." class="mention">@U04TCCVB2</a>
 *
 * Slack user IDs: U... (regular) or W... (Enterprise Grid), 8+ uppercase alphanumerics.
 */
export class MentionLinker {
  constructor(private readonly slackTeamId?: string) {}

  /** 
    Keep for later use... 
    <a1exnd3r 2026-05-21 p:1>
  */
  hasConfig(): boolean {
    return !!this.slackTeamId && this.slackTeamId.length > 0;
  }

  linkify(html: string): string {
    html = this.replaceLabeled(html);
    html = this.replaceBareUrls(html);
    return html;
  }

  /**
   * [Label](https://*.slack.com/team/Uxxxx) — escapeHtml leaves [ ] ( ) intact,
   * so this regex runs on text that hasn't been touched yet.
   * Label charset is conservative: letters, digits, dot, underscore, hyphen, space.
   */
  private replaceLabeled(html: string): string {
    return html.replace(
      /\[([A-Za-z0-9._\- ]{1,40})\]\((https:\/\/[a-z0-9-]+\.slack\.com\/team\/[UW][A-Z0-9]{7,})\)/g,
      (_m, label, url) =>
        `<a href="${url}" class="mention" target="_blank" rel="noopener" title="${url}">@${label.trim()}</a>`
    );
  }

  /**
   * Defensive: bare URL outside any anchor. Skips text inside <a> and <code>/<pre>.
   */
  private replaceBareUrls(html: string): string {
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
        /(^|[\s(])(https:\/\/[a-z0-9-]+\.slack\.com\/team\/([UW][A-Z0-9]{7,}))(?=[\s)<]|$)/g,
        (_m, lead, url, userId) =>
          `${lead}<a href="${url}" class="mention" target="_blank" rel="noopener" title="${url}">@${userId}</a>`
      );
    }
    return parts.join('');
  }
}