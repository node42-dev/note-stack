/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import { execFileSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export class AwsStorage {
  private readonly bucket:  string;
  private readonly prefix:  string;
  private readonly region:  string;
  private readonly appId: string;

  constructor(machineId: string, region: string, bucket: string, prefix: string) {
    this.appId   = machineId.slice(0, 8);
    this.region  = region;
    this.bucket  = bucket;
    this.prefix  = prefix.replace(/^\/|\/$/g, ''); // strip leading/trailing slashes
  }

  // ── Check ──────────────────────────────────────────────────────────────────

  static checkAwsCli(): boolean {
    try {
      execSync('aws --version', { encoding: 'utf8', stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  static assertAwsCli(): void {
    if (!AwsStorage.checkAwsCli()) {
      vscode.window.showErrorMessage('NoteStack: AWS CLI not found. Install it from https://aws.amazon.com/cli/ to use S3 sync.', 'Open Docs').then(action => {
        if (action === 'Open Docs') {
          vscode.env.openExternal(vscode.Uri.parse('https://aws.amazon.com/cli/'));
        }
      });
      throw new Error('AWS CLI not available');
    }
  }

  // ── S3 key for this machine ────────────────────────────────────────────────

  private get s3Key(): string {
    return this.prefix
      ? `${this.prefix}/note-stack-${this.appId}.json`
      : `note-stack-${this.appId}.json`;
  }

  private get s3Uri(): string {
    return `s3://${this.bucket}/${this.s3Key}`;
  }

  private prefixUri(): string {
    return this.prefix
      ? `s3://${this.bucket}/${this.prefix}/`
      : `s3://${this.bucket}/`;
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async save(data: object): Promise<void> {
    AwsStorage.assertAwsCli();

    const tmp = path.join(os.tmpdir(), `note-stack-${this.appId}.json`);
    try {
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      execFileSync('aws', [
        's3', 'cp', tmp, this.s3Uri,
        '--region', this.region,
        '--no-progress',
      ], { encoding: 'utf8', stdio: 'pipe' });
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    }
  }

  // ── Get (own machine file) ─────────────────────────────────────────────────

  async get<T>(): Promise<T | null> {
    AwsStorage.assertAwsCli();

    const tmp = path.join(os.tmpdir(), `note-stack-${this.appId}.json`);
    try {
      execFileSync('aws', [
        's3', 'cp', this.s3Uri, tmp,
        '--region', this.region,
        '--no-progress',
      ], { encoding: 'utf8', stdio: 'pipe' });

      if (!fs.existsSync(tmp)) return null;
      const raw = fs.readFileSync(tmp, 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      // File doesn't exist on S3 yet — not an error
      return null;
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    }
  }

  // ── Get all machine files (for browser panel / global view) ───────────────

  async getAll<T>(): Promise<T[]> {
    AwsStorage.assertAwsCli();

    // List all note-stack-*.json files in the prefix
    let listing: string;
    try {
      listing = execFileSync('aws', [
        's3', 'ls', this.prefixUri(),
        '--region', this.region,
      ], { encoding: 'utf8', stdio: 'pipe' });
    } catch {
      return [];
    }

    const keys = listing
      .split('\n')
      .map(line => line.trim().split(/\s+/).pop() ?? '')
      .filter(name => name.startsWith('note-stack-') && name.endsWith('.json'));

    const results: T[] = [];

    for (const key of keys) {
      const s3Uri = this.prefix
        ? `s3://${this.bucket}/${this.prefix}/${key}`
        : `s3://${this.bucket}/${key}`;
      const tmp = path.join(os.tmpdir(), key);
      try {
        execFileSync('aws', [
          's3', 'cp', s3Uri, tmp,
          '--region', this.region,
          '--no-progress',
        ], { encoding: 'utf8', stdio: 'pipe' });

        if (fs.existsSync(tmp)) {
          const raw = fs.readFileSync(tmp, 'utf8');
          results.push(JSON.parse(raw) as T);
        }
      } catch { /* skip unreadable file */ }
      finally {
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      }
    }

    return results;
  }
}