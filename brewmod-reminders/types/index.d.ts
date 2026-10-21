// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

// What the band draws: the due count and at most 3 row texts (due items only).
export type ReminderView = { due: number; rows: string[] }

declare module 'claude-code' {
  interface PluginState {
    'brewmod-reminders': {
      view: ReminderView
    }
  }
}
