// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

// One band row: its text and whether the item is due now.
export type ReminderRow = { text: string; isDue: boolean }

// What the band draws: counts and at most 3 rows of the open items, `more` = the rows cut.
export type ReminderView = { due: number; open: number; rows: ReminderRow[]; more: number }

declare module 'claude-code' {
  interface PluginState {
    'brewmod-reminders': {
      view: ReminderView
    }
  }
}
