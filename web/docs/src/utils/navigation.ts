export interface NavItem {
  title: string;
  slug: string;
  children?: NavItem[];
  hidden?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
  kind?: 'start' | 'mod' | 'plugin' | 'meta';
  slug?: string;
  eyebrow?: string;
  collapsible?: boolean;
}

export const navigation: NavSection[] = [
  {
    title: 'Getting Started',
    kind: 'start',
    items: [
      { title: 'Introduction', slug: 'getting-started' },
      { title: 'Recommended flow', slug: 'recommended-flow' },
      { title: 'Installation', slug: 'installation' },
      { title: 'Quick Start', slug: 'quickstart' },
      { title: 'Full Setup', slug: 'full-setup' },
      { title: 'FAQ', slug: 'faq' },
    ],
  },
  {
    title: 'Mods',
    kind: 'mod',
    items: [
      { title: 'All mods', slug: 'mods/overview' },
      { title: 'Prompt placeholders', slug: 'mods/placeholders' },
      { title: 'Plan-mode effort', slug: 'mods/plan-effort' },
      { title: 'Codewords', slug: 'brewtools/prompt-injection' },
    ],
  },
  {
    title: 'Brewcode',
    kind: 'plugin',
    slug: 'brewcode/overview',
    collapsible: true,
    eyebrow: 'Plugins',
    items: [
      {
        title: 'Skills',
        slug: 'brewcode/skills',
        children: [
          { title: 'setup-status', slug: 'brewcode/skills/setup-status' },
          { title: 'superreview-setup', slug: 'brewcode/skills/superreview-setup' },
          { title: 'teams-setup', slug: 'brewcode/skills/teams-setup' },
          { title: 'convention-setup', slug: 'brewcode/skills/convention-setup' },
          { title: 'rules', slug: 'brewcode/skills/rules' },
          { title: 'review (dynamic)', slug: 'brewcode/skills/review' },
          { title: 'skills', slug: 'brewcode/skills/skills' },
          { title: 'agents', slug: 'brewcode/skills/agents' },
          { title: 'e2e', slug: 'brewcode/skills/e2e' },
          { title: 'semble-setup', slug: 'brewcode/skills/semble-setup' },
        ],
      },
      {
        title: 'Agents',
        slug: 'brewcode/agents',
        children: [
          { title: 'skill-creator', slug: 'brewcode/agents/skill-creator' },
          { title: 'agent-creator', slug: 'brewcode/agents/agent-creator' },
          { title: 'hook-creator', slug: 'brewcode/agents/hook-creator' },
          { title: 'bash-expert', slug: 'brewcode/agents/bash-expert' },
          { title: 'mod-creator', slug: 'brewcode/agents/mod-creator' },
          { title: 'bc-rules-organizer', slug: 'brewcode/agents/bc-rules-organizer' },
        ],
      },
      { title: 'Hooks', slug: 'brewcode/hooks' },
    ],
  },
  {
    title: 'Brewtools',
    kind: 'plugin',
    slug: 'brewtools/overview',
    collapsible: true,
    items: [
      {
        title: 'Skills',
        slug: 'brewtools/skills',
        children: [
          { title: 'agent-deadline-setup', slug: 'brewtools/skills/agent-deadline-setup' },
          { title: 'agent-return-setup', slug: 'brewtools/skills/agent-return-setup' },
          { title: 'agent-router-setup', slug: 'brewtools/skills/agent-router-setup' },
          { title: 'context-slim', slug: 'brewtools/skills/context-slim' },
          { title: 'deploy', slug: 'brewtools/skills/deploy' },
          { title: 'manager-setup', slug: 'brewtools/skills/manager-setup' },
          { title: 'plugin-update', slug: 'brewtools/skills/plugin-update' },
          { title: 'provider-switch', slug: 'brewtools/skills/provider-switch' },
          { title: 'secrets-scan', slug: 'brewtools/skills/secrets-scan' },
          { title: 'task-board-setup', slug: 'brewtools/skills/task-board-setup' },
          { title: 'ssh', slug: 'brewtools/skills/ssh' },
          { title: 'text-human', slug: 'brewtools/skills/text-human' },
          { title: 'text-optimize', slug: 'brewtools/skills/text-optimize' },
        ],
      },
      {
        title: 'Agents',
        slug: 'brewtools/agents',
        children: [
          { title: 'text-optimizer', slug: 'brewtools/agents/text-optimizer' },
          { title: 'ssh-admin', slug: 'brewtools/agents/ssh-admin' },
          { title: 'deploy-admin', slug: 'brewtools/agents/deploy-admin' },
        ],
      },
    ],
  },
  {
    title: 'Brewdoc',
    kind: 'plugin',
    slug: 'brewdoc/overview',
    collapsible: true,
    items: [
      {
        title: 'Skills',
        slug: 'brewdoc/skills',
        children: [
          { title: 'docsync-setup', slug: 'brewdoc/skills/docsync-setup' },
          { title: 'my-claude', slug: 'brewdoc/skills/my-claude' },
          { title: 'memory-sync-setup', slug: 'brewdoc/skills/memory-sync-setup' },
          { title: 'md-to-pdf', slug: 'brewdoc/skills/md-to-pdf' },
          { title: 'publish', slug: 'brewdoc/skills/publish' },
        ],
      },
    ],
  },
  {
    title: 'Brewui',
    kind: 'plugin',
    slug: 'brewui/overview',
    collapsible: true,
    items: [
      { title: 'Skills', slug: 'brewui/skills', hidden: true },
      { title: 'Agents', slug: 'brewui/agents', hidden: true },
    ],
  },
  {
    title: 'Legal',
    kind: 'meta',
    items: [
      { title: 'License', slug: 'license' },
    ],
  },
];
