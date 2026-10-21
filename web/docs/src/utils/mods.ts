// Single source for mod promo copy; ModPromo and mods/overview.mdx read it. Edit text here, never in MDX.
export interface ModInfo {
  name: string;
  slug: string;
  pitch: string;
  try: string;
  requires: string;
  icon: string;
}

export const mods: ModInfo[] = [
  {
    name: 'Prompt placeholders',
    slug: 'placeholders',
    pitch: 'Type ++r, get a whole instruction block.',
    try: '++r',
    requires: 'Claude Code 2.1.301+',
    icon: 'puzzle',
  },
  {
    name: 'Plan-mode effort',
    slug: 'plan-effort',
    pitch: 'xhigh while Claude plans, your session effort everywhere else.',
    try: '/plan-effort max',
    requires: 'Claude Code 2.1.301+',
    icon: 'brain',
  },
  {
    name: 'Reminders',
    slug: 'reminders',
    pitch: 'Remind me tomorrow 9:00: a file in your repo, offered next session.',
    try: '/remind tomorrow 9:00 check prod',
    requires: 'Claude Code 2.1.301+',
    icon: 'clock',
  },
];

// Build-time guard: every mod slug must have a docs page.
export function assertModPages(ids: string[]): void {
  const known = new Set(ids);
  for (const m of mods) {
    if (!known.has(`mods/${m.slug}`)) {
      throw new Error(`[mods.ts] no docs page for mod slug "${m.slug}" (expected mods/${m.slug}.mdx)`);
    }
  }
}
