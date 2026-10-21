// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

// What the band draws: the fired count and at most 3 row texts; `**N` numbers come from a fresh fired list, not from here.
export type ReminderView = { due: number; rows: string[] }

declare module 'claude-code' {
  interface PluginState {
    'brewmod-reminders': {
      view: ReminderView
    }
  }
}
