/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import { execFile } from "child_process";
import * as fs from "fs";
import ignore, { Ignore } from "ignore";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function loadIgnoreFilter(root: string): Ignore {
  const ig = ignore();
  ig.add(".git");
  try {
    const content = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
    ig.add(content);
  } catch {
    // no .gitignore at the project root — only .git itself is excluded
  }
  return ig;
}

function copyFiltered(
  root: string,
  dest: string,
  ig: Ignore,
  relDir = "",
): void {
  fs.mkdirSync(path.join(dest, relDir), { recursive: true });

  for (const entry of fs.readdirSync(path.join(root, relDir), {
    withFileTypes: true,
  })) {
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (ig.ignores(relPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      copyFiltered(root, dest, ig, relPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(path.join(root, relPath), path.join(dest, relPath));
    }
  }
}

async function compressDirectory(
  sourceDir: string,
  zipPath: string,
): Promise<void> {
  if (process.platform === "win32") {
    const escape = (p: string) => p.replace(/'/g, "''");
    await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${escape(sourceDir)}\\*' -DestinationPath '${escape(zipPath)}' -Force`,
    ]);
  } else {
    await execFileAsync("zip", ["-r", "-q", zipPath, "."], {
      cwd: sourceDir,
    });
  }
}

/**
 * Copies `root` to a staging dir under the OS temp dir, skipping anything
 * matched by the project's .gitignore (plus .git itself), zips it, and
 * removes the staging dir. Returns the path to the resulting zip file.
 *
 * Throws if the resulting zip exceeds `maxBytes` — most AI chat upload
 * pickers reject files past their own cap (e.g. Claude.ai's 30MB), so a zip
 * over the limit can't be attached anyway and is deleted instead of kept.
 */
export async function zipProjectRoot(
  root: string,
  maxBytes: number,
): Promise<string> {
  const projectName = path.basename(root);
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;

  const stagingDir = path.join(
    os.tmpdir(),
    `${projectName}-${dateStr}`,
  );
  const zipPath = `${stagingDir}.zip`;

  const ig = loadIgnoreFilter(root);
  copyFiltered(root, stagingDir, ig);

  try {
    await compressDirectory(stagingDir, zipPath);
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  const { size } = fs.statSync(zipPath);
  if (size > maxBytes) {
    fs.rmSync(zipPath, { force: true });
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Zipped project is ${mb(size)}MB, which exceeds the ${mb(maxBytes)}MB limit.`,
    );
  }

  return zipPath;
}
