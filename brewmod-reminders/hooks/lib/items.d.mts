// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

// Types of items.mjs for register.ts (tsc without allowJs).
export type Item = { id: string; name: string; due: number | null; dueRaw: string; someday: boolean; kind: Kind; status: string; created: string; done: string; cancelled: string; result: string; title: string }
export type Kind = 'action' | 'note'
export type Claim = { session: string; at: number }
export type State = 'due' | 'pending' | 'running' | 'someday' | 'done' | 'cancelled' | 'unparseable' | 'ignored'
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
export const itemName: (dueMs: number | null, slug: string) => string
export const isSomedayName: (name: string) => boolean
export const buildItem: (a: { dueMs: number | null; text: string; now: number; kind?: Kind }) => string
export const bodyOf: (text: string) => string
export const patchBody: (text: string, body: string) => string
export const editText: (text: string, change: { text?: string; kind?: Kind; dueMs?: number | null }) => string
export const datePatch: (ms: number) => Record<string, string>
export const somedayPatch: () => Record<string, string>
export const reopenPatch: (ms?: number | null) => Record<string, string | null>
export const closedLabel: (item: Item) => 'shown' | 'done' | 'cancelled' | ''
export type Row = { item: Item; state: State }
export const sections: <R extends Row>(rows: R[]) => { fired: R[]; running: R[]; waiting: R[]; someday: R[]; history: R[] }
export const expiredIds: (items: Item[], now: number, keepDays: number) => string[]
export const patchHeader: (text: string, patch: Record<string, string | null>) => string
export const parseItem: (name: string, text: string) => Item
export const parseWhenNatural: (input: string, now: number, tz: string) => When
export const windowOf: (input: string, now: number, tz: string) => { from: number; to: number } | null
export const rangeOf: (from: string | undefined, to: string | undefined, now: number, tz: string) => { ok: true; from: number; to: number } | { ok: false; error: string }
export const formatWhen: (ms: number, tz: string, now: number) => string
export const relative: (ms: number, now: number) => string
export const systemTz: () => string
export const matchId: (ids: string[], query: string) => Match
