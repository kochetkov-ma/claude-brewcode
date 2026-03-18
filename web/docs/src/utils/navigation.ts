export interface NavItem {
  title: string;
  slug: string;
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
      { title: 'Skills', slug: 'brewcode/skills' },
      { title: 'Agents', slug: 'brewcode/agents' },
      { title: 'Hooks', slug: 'brewcode/hooks' },
      { title: 'Workflow', slug: 'brewcode/workflow' },
    ],
  },
  {
    title: 'Brewdoc',
    items: [
      { title: 'Overview', slug: 'brewdoc/overview' },
      { title: 'Auto-Sync', slug: 'brewdoc/auto-sync' },
      { title: 'Memory', slug: 'brewdoc/memory' },
      { title: 'md-to-pdf', slug: 'brewdoc/md-to-pdf' },
    ],
  },
];

