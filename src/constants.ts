/*
  Author: Alex Olsson
  Copyright (C) 2026 Node42 (www.node42.dev)
  Email: a1exnd3r@node42.dev
  GitHub: https://github.com/node42-dev
  SPDX-License-Identifier: MIT
*/

import { env } from 'vscode';
import * as os from 'os';

export const MACHINE_ID = env.machineId; // stable unique ID per machine
export const APP_ID = MACHINE_ID.slice(0, 8);
export const HOST_NAME = os.hostname();

export const PRIORITY_ICON: Record<string, string> = {
  high:      '🔴',
  medium:    '🟡',
  low:       '🟢',
  completed: '✅',
};

export const PRIORITY_LABEL: Record<string, string> = {
  high:      'High',
  medium:    'Medium',
  low:       'Low',
  completed: 'Completed',
};