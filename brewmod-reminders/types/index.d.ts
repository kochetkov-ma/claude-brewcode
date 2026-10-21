// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

// What the band draws: the fired count, at most 3 row texts, and every fired id in band order (the numbers 1.. of `**N`).
export type ReminderView = { due: number; rows: string[]; fired: { id: string; global: boolean }[] }

declare module 'claude-code' {
  interface PluginState {
    'brewmod-reminders': {
      view: ReminderView
    }
  }
}
