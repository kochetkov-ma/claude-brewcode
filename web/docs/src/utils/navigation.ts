export interface NavItem {
  title: string;
  slug: string;
  children?: NavItem[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Introduction', slug: 'getting-started' },
      { title: 'Installation', slug: 'installation' },
      { title: 'Quick Start', slug: 'quickstart' },
    ],
  },
  {
    title: 'Brewcode',
    items: [
      { title: 'Overview', slug: 'brewcode/overview' },
      {
        title: 'Skills',
        slug: 'brewcode/skills',
        children: [
          { title: 'setup', slug: 'brewcode/skills/setup' },
          { title: 'spec', slug: 'brewcode/skills/spec' },
          { title: 'plan', slug: 'brewcode/skills/plan' },
          { title: 'start', slug: 'brewcode/skills/start' },
          { title: 'teams', slug: 'brewcode/skills/teams' },
          { title: 'convention', slug: 'brewcode/skills/convention' },
          { title: 'rules', slug: 'brewcode/skills/rules' },
          { title: 'grepai', slug: 'brewcode/skills/grepai' },
          { title: 'teardown', slug: 'brewcode/skills/teardown' },
          { title: 'standards-review', slug: 'brewcode/skills/standards-review' },
          { title: 'skills', slug: 'brewcode/skills/skills' },
          { title: 'agents', slug: 'brewcode/skills/agents' },
          { title: 'e2e', slug: 'brewcode/skills/e2e' },
          { title: 'glm-design-to-code', slug: 'brewcode/skills/glm-design-to-code' },
          { title: 'debate', slug: 'brewcode/skills/debate' },
        ],
      },
      {
        title: 'Agents',
        slug: 'brewcode/agents',
        children: [
          { title: 'developer', slug: 'brewcode/agents/developer' },
          { title: 'tester', slug: 'brewcode/agents/tester' },
          { title: 'reviewer', slug: 'brewcode/agents/reviewer' },
          { title: 'architect', slug: 'brewcode/agents/architect' },
          { title: 'skill-creator', slug: 'brewcode/agents/skill-creator' },
          { title: 'agent-creator', slug: 'brewcode/agents/agent-creator' },
          { title: 'hook-creator', slug: 'brewcode/agents/hook-creator' },
          { title: 'bash-expert', slug: 'brewcode/agents/bash-expert' },
          { title: 'bc-coordinator', slug: 'brewcode/agents/bc-coordinator' },
          { title: 'bc-knowledge-manager', slug: 'brewcode/agents/bc-knowledge-manager' },
          { title: 'bc-grepai-configurator', slug: 'brewcode/agents/bc-grepai-configurator' },
          { title: 'bc-rules-organizer', slug: 'brewcode/agents/bc-rules-organizer' },
        ],
      },
      { title: 'Hooks', slug: 'brewcode/hooks' },
      { title: 'Workflow', slug: 'brewcode/workflow' },
    ],
  },
  {
    title: 'Brewtools',
    items: [
      { title: 'Overview', slug: 'brewtools/overview' },
      {
        title: 'Skills',
        slug: 'brewtools/skills',
        children: [
          { title: 'text-optimize', slug: 'brewtools/skills/text-optimize' },
          { title: 'text-human', slug: 'brewtools/skills/text-human' },
          { title: 'secrets-scan', slug: 'brewtools/skills/secrets-scan' },
        ],
      },
      {
        title: 'Agents',
        slug: 'brewtools/agents',
        children: [
          { title: 'text-optimizer', slug: 'brewtools/agents/text-optimizer' },
        ],
      },
    ],
  },
  {
    title: 'Brewui',
    items: [
      { title: 'Overview', slug: 'brewui/overview' },
      {
        title: 'Skills',
        slug: 'brewui/skills',
        children: [
          { title: 'image-gen', slug: 'brewui/skills/image-gen' },
        ],
      },
    ],
  },
  {
    title: 'Brewdoc',
    items: [
      { title: 'Overview', slug: 'brewdoc/overview' },
      { title: 'Auto-Sync', slug: 'brewdoc/auto-sync' },
      { title: 'My-Claude', slug: 'brewdoc/my-claude' },
      { title: 'Memory', slug: 'brewdoc/memory' },
      { title: 'md-to-pdf', slug: 'brewdoc/md-to-pdf' },
      { title: 'Publish', slug: 'brewdoc/publish' },
      { title: 'Guide', slug: 'brewdoc/guide' },
    ],
  },
  {
    title: 'Legal',
    items: [
      { title: 'License', slug: 'license' },
    ],
  },
];
