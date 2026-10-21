// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

// Types of items.mjs for register.ts (tsc without allowJs).
export type Item = { id: string; name: string; due: number | null; dueRaw: string; status: string; created: string; done: string; cancelled: string; result: string; title: string }
export type Claim = { session: string; at: number }
export type State = 'due' | 'pending' | 'running' | 'done' | 'cancelled' | 'unparseable' | 'ignored'
export type When = { ok: true; ms: number; iso: string } | { ok: false; error: string }
export type Match = { id: string } | { error: 'none' | 'ambiguous'; candidates: string[] }

export const CLAIMS_DIR: string
export const HANDOFF_MARK: string
export const validSid: (sid: unknown) => boolean
export const sessionStateName: (sid: string) => string
export const claimName: (id: string) => string
export const itemKey: (item: { global?: boolean; id: string; dueRaw: string }) => string
export const isItemName: (name: string) => boolean
export const isoZ: (ms: number) => string
export const sessionStateJson: (isInteractive: boolean, now: number) => string
export const parseConfig: (text: string) => { git: 'off' | 'commit' | 'commit-push' }
export const claimJson: (session: string, now: number) => string
export const parseClaim: (text: string) => Claim | null
export const claimLive: (claim: Claim | null | undefined, now: number) => boolean
export const classify: (item: Item, claim: Claim | null, now: number) => State
export const slugify: (s: string) => string
export const itemName: (dueMs: number, slug: string) => string
export const buildItem: (a: { dueMs: number; text: string; now: number }) => string
export const patchHeader: (text: string, patch: Record<string, string | null>) => string
export const parseItem: (name: string, text: string) => Item
export const parseWhenNatural: (input: string, now: number, tz: string) => When
export const formatWhen: (ms: number, tz: string, now: number) => string
export const relative: (ms: number, now: number) => string
export const systemTz: () => string
export const matchId: (ids: string[], query: string) => Match
