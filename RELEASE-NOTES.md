# Release Notes

---

## v3.4.80 (2026-04-12)

> Docs: [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Changed
- **provider-switch docs:** complete page redesign — marketing-first structure. Problem/solution hero, weekly timeline visualization, cost comparison cards, prominent alias showcase, 3-step setup, provider cards with sign-up links. Technical details collapsed in Spoiler. Mobile-optimized, 102 lines vs 163 before.

---

## v3.4.79 (2026-04-12)

> Docs: [brewtools overview](https://doc-claude.brewcode.app/brewtools/overview/) | [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Fixed
- **docs audit:** added missing provider-switch to CLAUDE.md skills table, overview.mdx (card + command + architecture tree), fixed stale README version (3.4.73 → 3.4.78). All 5 doc levels now consistent: 8 skills, 3 agents across filesystem, README, navigation.ts, MDX, guide catalog.

---

## v3.4.78 (2026-04-12)

> Docs: [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Changed
- **provider-switch:** removed claude-max alias (unnecessary — open new terminal instead), no-dash alias names (claudeglm, claudeqwen, claudeminimax, claudeor), aliases launch claude automatically (one command), alias name customizable via AskUserQuestion during setup.
- **docs:** updated README and MDX to reflect all alias changes across all doc levels.

---

## v3.4.77 (2026-04-12)

> Docs: [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Changed
- **docs:** provider-switch — single top model for all roles, updated OpenRouter model list (removed stale free models, added validated custom ID flow), corrected provider tables in README and MDX.

---

## v3.4.76 (2026-04-12)

### brewtools
#### Fixed
- **provider-switch:** single top model for all 3 Claude Code roles (opus/sonnet/haiku). Never split across weaker models. GLM = glm-5.1 everywhere, Qwen = qwen3.6-plus[1m] everywhere, OpenRouter = one user-selected model everywhere.

---

## v3.4.75 (2026-04-12)

### brewtools
#### Added
- **provider-switch:** hidden `update` mode for maintainer — spawns per-provider research agents, fetches latest models/pricing from official sources, diffs against current references, applies updates. Auto-sync frontmatter on all 5 provider reference files. Update protocol reference with per-provider sources and live test templates.

---

## v3.4.74 (2026-04-12)

> Docs: [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Added
- **docs:** full documentation for `/brewtools:provider-switch` — skill README, Astro MDX page, navigation.ts entry, plugin README row, guide catalog row. Quorum-reviewed (3 agents, 11 findings, 4 confirmed + fixed).

---

## v3.4.73 (2026-04-12)

> Docs: [brewtools:provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

### brewtools
#### Added
- **provider-switch skill:** new skill `/brewtools:provider-switch` — configure Claude Code alternative API providers (Z.ai/GLM, Qwen/DashScope, MiniMax, OpenRouter). Interactive setup via AskUserQuestion: language selection (EN/RU/PT), provider selection, API key input, model selection for OpenRouter. Creates isolated shell aliases in ~/.zshrc with backup. Modes: status, setup, help, provider-specific. 6 reference files + 3 scripts.

### brewcode
#### Changed
- **agents:** added protected-path v3.4.70 warnings to agent-creator, hook-creator, skill-creator agents — document Write restrictions for `~/.claude/*` paths.

---

## v3.4.72 (2026-04-11)

> Docs: [getting-started](https://doc-claude.brewcode.app/) | [installation](https://doc-claude.brewcode.app/installation/) | [quickstart](https://doc-claude.brewcode.app/quickstart/)

### docs
#### Fixed
- **external link targeting:** Added `rehype-external-links` plugin to `astro.config.mjs` — all markdown/MDX links with absolute `http(s)://` URLs now automatically get `target="_blank" rel="noopener noreferrer"`. Internal relative links (`/path/`) open in the same tab.
- **Card.astro link targeting:** Overlay (`absolute inset-0`) and title `<a>` now detect external hrefs via `/^https?:\/\//` and apply `target="_blank" rel="noopener noreferrer"` only when the href points to a different domain. Internal hrefs open in the same tab.

---

## v3.4.71 (2026-04-11)

> Docs: [getting-started](https://doc-claude.brewcode.app/) | [installation](https://doc-claude.brewcode.app/installation/)

### docs
#### Fixed
- **Card broken layout:** `Card.astro` rendered as `<a>` when `href` is set, causing nested `<a>` tags when slot content contained markdown links. Browser closed outer anchor early — card icon/title separated from description and content leaked outside the card. Fixed with stretched-link overlay pattern: card is now always a `div`; an `absolute inset-0 z-0` anchor covers the full card surface; slot content gets `relative z-[1]` so inner links intercept clicks correctly.
- **getting-started, installation:** restored inline links (`setup`, `spec`, `plan`, `start`) inside Quick Start card — they were the trigger for the layout bug but are correct content; fix is in the component, not the content.

---

## v3.4.70 (2026-04-11)

> Docs: [brewdoc:my-claude](https://doc-claude.brewcode.app/brewdoc/skills/my-claude/) | [brewdoc:guide](https://doc-claude.brewcode.app/brewdoc/skills/guide/) | [brewdoc:auto-sync](https://doc-claude.brewcode.app/brewdoc/skills/auto-sync/)

### brewdoc
#### Fixed
- **hook parity:** `brewdoc/hooks/pre-task.mjs` now injects `BD_PLUGIN_DATA=${CLAUDE_PLUGIN_DATA}` into subagent prompts, matching the pattern already used by brewcode/brewtools/brewui hooks. Previously brewdoc only exposed `BD_PLUGIN_ROOT`, breaking parity.
- **skill outputs migrated to project-relative paths:** `/brewdoc:my-claude`, `/brewdoc:guide`, and `/brewdoc:auto-sync` now write to `.claude/brewdoc/` and `.claude/auto-sync/` inside the target project instead of `~/.claude/brewdoc/` / `~/.claude/auto-sync/`. Reason: Claude Code's protected-path policy blocks Write to `~/.claude/*` in every permission mode, including `bypassPermissions`. The hook-based permission layer runs AFTER the protected-path check, so no whitelist can override it. Verified empirically in headless `claude -p`.
- **legacy read-only fallback:** my-claude documents a one-shot merge from `~/.claude/brewdoc/INDEX.jsonl` into the new project INDEX when the new location is empty. Legacy file is never written.
- **guide progress path:** `brewdoc/skills/guide/scripts/progress.sh` now prefers `${CLAUDE_PROJECT_DIR:-.}/.claude/brewdoc/guide-progress.json` and falls back to `${BD_PLUGIN_DATA:-$HOME/.claude/brewdoc}/guide-progress.json` only when the project dir is not writable.

### brewcode
#### Changed
- **permission-guard.sh whitelist:** project-local `.claude/brewdoc/` and `.claude/auto-sync/` added to both the `is_allowed_path()` helper (Bash tool) and the Edit/Write/MultiEdit case statement, mirroring the existing pattern for `.claude/tasks/`, `.claude/reports/`, etc.

### Known limitation
- `$CLAUDE_PLUGIN_DATA` (persistent plugin-state directory, `~/.claude/plugins/data/<plugin-id>/`) is **not usable as a Write target in headless `claude -p`** due to the harness protected-path policy. PermissionRequest hooks cannot override — the check happens earlier in the pipeline. Until Anthropic relaxes this for `~/.claude/plugins/data/`, all skill outputs must target project-relative paths. Workaround documented per-skill; feedback filed upstream.

---

## v3.4.69 (2026-04-11)

> Docs: [brewdoc:my-claude](https://doc-claude.brewcode.app/brewdoc/skills/my-claude/)

### brewdoc
#### Changed
- **my-claude:** repositioned as extended alternative to built-in `/team-onboarding` (new in Claude Code 2.1.101). Added "vs /team-onboarding" section, updated description to emphasize web research, EXTERNAL/RESEARCH modes, and citation tracking.

### Compatibility
- **Claude Code 2.1.101:** verified — subagent MCP tool inheritance fix benefits `bc-coordinator` and other Task-spawned agents (none of our agents currently reference MCP tools directly, so no silent regressions). `context: fork` skills (`brewcode:setup`, `brewcode:teardown`) confirmed — neither declares an `agent:` field, so the 2.1.101 frontmatter fix is a no-op for us. Settings resilience to unknown hook events benefits users running older vs newer Claude Code versions.
- **Claude Code 2.1.98:** Bash permission hardening verified compatible — all skills use plain compound patterns (`cmd && echo "✅" || echo "❌"`), no env-var prefix bypasses, no `/dev/tcp/` redirects, no backslash-escaped flags.
- **Monitor tool (2.1.98):** evaluated as simplification opportunity for `brewcode:start` polling loop. Deferred — current flow uses single-pass `bc-coordinator` delegation, not polling, so Monitor doesn't cleanly replace existing logic.

---

## v3.4.68 (2026-04-11)

> Docs: [review (dynamic)](https://doc-claude.brewcode.app/brewcode/skills/review/) | [setup](https://doc-claude.brewcode.app/brewcode/skills/setup/) | [debate](https://doc-claude.brewcode.app/brewtools/skills/debate/)

### docs
#### Added
- **New page: `/brewcode/skills/review/` — the dynamic per-project review skill.** Until now this skill was mentioned but undocumented on the site (because it's generated into each target project by `/brewcode:setup`, not shipped with the plugin). New page covers: overview and clean distinction vs `/brewcode:standards-review`; full 7-phase pipeline (codebase study → group formation → parallel review → quorum collection → DoubleCheck → optional Critic + DoubleCheck-Critic → report); parameter reference (`-q N-M`, `-q G-N-M`, `-c/--critic`, default `-q 3-2`); quorum semantics (±5 line tolerance, ≥0.6 semantic similarity, merge rules); generation flow (Phase 3.5 of setup, 8 template placeholders, output in `.claude/skills/brewcode-review/`); tech-specific check tabs for Java/Spring, Node/TS, Python, Go; cross-links to setup, standards-review, reviewer agent, and brewtools/debate `--review` flag.
- **Navigation:** `review (dynamic)` added to the Brewcode → Skills sidebar as a 14th entry under standards-review.
- **Cross-links added:** quickstart.mdx (Project setup Result list → `/brewcode/skills/review/`), brewcode/skills/setup.mdx (Phase 4 Templates table + Verification table row), brewcode/skills.mdx (summary table adds a ★ "review (dynamic)" row + card + description paragraph), brewtools/skills/debate.mdx (Phase 8 bullet and `--review` flag table entry now link to the new page).

---

## v3.4.67 (2026-04-11)

> Docs: [doc site](https://doc-claude.brewcode.app/)

### docs
#### Added
- **Cross-entity linking across the whole site.** Ran five parallel agents over the MDX content to convert plain-text skill/agent mentions into active Markdown links, including cross-plugin references (e.g. brewdoc `my-claude` → brewcode `reviewer` agent, brewtools `deploy` → `deploy-admin` agent + `ssh` skill, brewui `glm-design-to-code` reviews → agents). Roughly **80 new links across 37 MDX files**, covering every plugin's overview/skills/agents pages plus Getting Started / Installation / Quickstart / FAQ. Rules: first occurrence per H2 section, never inside code fences, never self-linking. Link style is plain Markdown — Tailwind prose handles hover underline, no custom classes or colors.
- **Broken-link sweep:** full dist HTML scanned — 0 broken internal links out of 63 unique URLs.

#### Fixed
- **`/brewcode:review` vs `/brewcode:standards-review` disambiguation.** `/brewcode:review` is a **per-project dynamic skill** created by `/brewcode:setup`, not a static page. One sub-agent incorrectly linked it to a non-existent `/brewcode/skills/review/` URL. Reverted all `/brewcode:review` mentions to plain inline code (no link) in `brewtools/skills/debate.mdx` and `brewcode/skills/setup.mdx`.

---

## v3.4.66 (2026-04-11)

### docs
#### Changed
- **Search ranking — body downweighted to 0.2.** v3.4.65 boosted titles via weight 10 + 30× duplication, but BM25 TF-saturation capped the score so pages with dozens of body mentions of common words ("start", "spec") still out-ranked the actual skill pages. Added a `data-pagefind-weight="0.2"` wrapper around the whole article slot (via `display: contents` div so prose layout is unchanged). Net effect: title boost is ~50× stronger than body prose, which lets `/brewcode/skills/start/`, `/brewcode/skills/spec/` etc. beat pages that mention those words many times.

---

## v3.4.65 (2026-04-11)

### docs
#### Fixed
- **Search result labels corrupted by title-boost span.** v3.4.63's title boost used `data-pagefind-meta="title"` on the duplicated span, which told Pagefind "this element IS the page title" — so result labels showed as `"Agent Creator Agent Creator Agent Creator …"` 10×. Removed the `meta` attribute; Pagefind now falls back to the `<h1>` heading for the real title. Bumped title duplicates from 10× to 30× to further push BM25 term-frequency on title-matching queries.

---

## v3.4.64 (2026-04-11)

> Docs: [Quickstart](https://doc-claude.brewcode.app/quickstart/) | [Brewdoc Skills](https://doc-claude.brewcode.app/brewdoc/skills/)

### docs
#### Fixed
- **Steps component — nested list numbering corruption.** `Steps.astro` used `.steps-timeline :global(li)` which matched **every** descendant `<li>`, so any `<ul>`/`<ol>` inside a step body (e.g. the "Result: file list" in Quickstart Step 1) was treated as a continuation step — complete with circle counter, timeline bar, and broken grid layout. Rewrote the selector to direct-child only (`:global(.steps-timeline > li)`), explicitly restored `list-style: disc/decimal` + `display: list-item` for nested `ul`/`ol`/`li`, and added counter-reset so only top-level steps increment. Quickstart timeline now renders cleanly: "1 Project setup" with a bulleted file list inside, no fake steps 2–5.
- **Steps grid layout** — title and body paragraph selectors tightened to direct children so nested prose keeps normal prose styling.

#### Changed
- **Brewdoc sidebar structure aligned with other plugins.** Brewdoc skill pages previously lived flat under `/brewdoc/<skill>/` (auto-sync, my-claude, memory, md-to-pdf, publish, guide), while brewcode/brewtools/brewui use `/<plugin>/skills/<skill>/` with a dedicated **Skills** sidebar group. Moved all 6 brewdoc skill pages into `content/docs/brewdoc/skills/`, added `brewdoc/skills.mdx` index page, updated `navigation.ts` to use a `Skills` children group, fixed 15+ internal links in `brewdoc/overview.mdx` and cross-page cards. All 65 pages build clean.

### rules
#### Added
- `.claude/rules/astro-avoid.md` — four new rules (#8–#10) covering Steps component nesting semantics, the direct-child selector fix history, and the plugin-skills directory convention. Agents editing MDX will pick them up via the `web/**/*.mdx` path glob.

---

## v3.4.63 (2026-04-11)

> Docs: [Introduction](https://doc-claude.brewcode.app/getting-started/)

### docs
#### Changed
- **Search ranking — title boost amplified to ~100×:** v3.4.62 added `data-pagefind-weight="10"` on a single sr-only title element, but Pagefind's max weight (10) + one heading match still lost to pages with many body mentions of the same word. Verified on live site: `"start"` put the actual `/brewcode:start` skill page at rank 7, behind Agent Creator, Hook Creator, Guide, etc. Fix: duplicate the page title 10× inside the weighted sr-only element (`{Array(10).fill(title).join(' ')}`), yielding an effective ~100× BM25 boost. Title-matching pages should now consistently rank first.

## v3.4.62 (2026-04-11)

> Docs: [Introduction](https://doc-claude.brewcode.app/getting-started/)

### docs
#### Changed
- **Search ranking — titles boosted 10×:** Pagefind previously ranked pages by raw BM25 across body content, so typing `"start"` surfaced every page that mentioned "start" in prose before the actual `/brewcode:start` skill page. Added an `sr-only` element inside `<article data-pagefind-body>` in `DocsLayout.astro` with `data-pagefind-weight="10"` and `data-pagefind-meta="title"` holding the page title. Result: page whose title matches the query ranks above body-only hits. Verified test cases: `start`, `plan`, `debate`, `image` all surface their respective skill/agent pages first.

---

## v3.4.61 (2026-04-11)

> Docs: [Introduction](https://doc-claude.brewcode.app/getting-started/) | [Quickstart](https://doc-claude.brewcode.app/quickstart/)

### docs
#### Fixed
- **Card icons:** `<Card icon="image">`, `<Card icon="plus">`, and `<Card icon="warning">` rendered the literal words "image", "plus", "warning" in the UI (visible on the Introduction page for `brewui`), because `Card.astro`'s `iconMap` was a strict whitelist that fell through to `rawIcon` on miss. Root cause + remediation:
  - Extended `iconMap` to 65 entries — added `image 🖼️`, `plus ➕`, `warning ⚠️`, plus 30 more common icons (bell, bolt, bug, calendar, clock, cloud, database, gear, globe, graph, hammer, key, label, magic, megaphone, note, phone, pin, refresh, robot, scroll, shieldCheck, ship, target, test, tool, trophy, zap, …) so future pages have breathing room.
  - Unknown icon names now render a **deterministic fallback** (hash → stable pick from the map) **and** log `console.warn` in build + browser, instead of leaking raw text into prose. A missing icon is visible and noisy without breaking the page.
  - Verified by independent re-scan: 38/38 icon names used across content are now present in `iconMap` — zero missing.

### rules
#### Added
- `.claude/rules/astro-avoid.md#5,#6,#7` — new path-scoped rules (now covering `web/**/*.mdx`) that explicitly forbid unlisted `Card` icons and raw exotic emoji in MDX, and require adding to `iconMap` before use. Agents touching Astro/MDX pages will pick this up automatically via the glob.

---

## v3.4.60 (2026-04-11)

> Docs: [doc site](https://doc-claude.brewcode.app/)

### docs
#### Changed
- **Search highlights:** Pagefind default `<mark>` background was saturated browser-yellow, visually harsh against the dark theme. Overridden in `<style is:global>` to `oklch(var(--p) / 0.22)` — soft DaisyUI primary tint, inherit text color, 2px padding + radius. Stays on-brand and legible without shouting.

---

## v3.4.59 (2026-04-11)

> Docs: [Introduction](https://doc-claude.brewcode.app/getting-started/)

### docs
#### Changed
- **Introduction page:** restructured to lead with the pitch, not the install command. Install prompt moved into a prominent `<Spoiler title="📦 How to install Brewcode — click to expand install instructions">` block below the feature cards and plugin matrix, so first-time readers see "what is this" before "how to set it up". Added a "Four plugins, one suite" card grid as the headline section; refreshed counts to 28 skills / 18 agents.

---

## v3.4.58 (2026-04-11)

> Docs: [doc site](https://doc-claude.brewcode.app/)

### docs
#### Fixed
- **Search styling:** Pagefind UI was rendering raw/unstyled (browser-default input outline, bare "Clear" button, no result separators) because `@pagefind/default-ui/css/ui.css` was never imported. Added explicit `import '@pagefind/default-ui/css/ui.css'` in `Search.astro` script so Vite bundles the stylesheet; DaisyUI token overrides in `<style is:global>` still apply on top.
- **Header logo wrap on mobile:** DaisyUI `.btn` defaults to `flex-wrap: wrap`, so "Brewcode Docs" text wrapped under the logo image on narrow viewports, pushing the whole header onto two rows. Added `flex-nowrap whitespace-nowrap min-w-0` + `shrink-0` on logo img + `truncate` on label; also `min-w-0` on the flex-1 Logo wrapper in `Header.astro` so child can shrink.

---

## v3.4.57 (2026-04-11)

> Docs: [doc site](https://doc-claude.brewcode.app/)

### docs
#### Fixed
- **Search:** docs search was completely non-functional — `Search.astro` listened only to `astro:page-load`, but the project does not enable Astro ViewTransitions, so neither PagefindUI nor button/shortcut handlers ever initialized. Rewrote client init to use `DOMContentLoaded`/immediate branch, split button listeners from the lazy `@pagefind/default-ui` import so clicks work before Pagefind loads, and added a `processTerm` query normalizer (lowercase, strip diacritics, strip punctuation, collapse whitespace) so `"GLM-design, to code!"` matches `"glm design to code"`. Cmd/Ctrl+K toggle and Escape close restored.
- **Search CSS:** switched Pagefind CSS variables to DaisyUI `oklch(var(--p/--bc/--b2/--b3))` tokens and added `--pagefind-ui-scale: 0.9` below 640px for mobile modal sizing.
- **GitHubBadge mobile:** star badge was hidden entirely on `<640px` (`hidden sm:inline-flex`). Added a compact mobile variant (`inline-flex sm:hidden`) with the GitHub Octocat icon + star count, tappable to the repo. A single `fetch` now updates both desktop and mobile counters.

---

## v3.4.56 (2026-04-10)

> Docs: [FAQ](https://doc-claude.brewcode.app/faq/)

### docs
#### Fixed
- **FAQ:** restored right-side Table of Contents for spoiler-only layout. New `tocItems` frontmatter field on docs schema lets pages declare TOC entries explicitly when content uses components instead of markdown headings; merged into `[...id].astro` heading list. FAQ now lists 8 questions in TOC, each anchor opens the matching `<Spoiler>` automatically.

#### Changed
- **Spoiler component:** accepts `id` prop, rendered on the `<details>` element. Auto-open script simplified — hash directly targets the spoiler element, scrolls into view smoothly, works via `DOMContentLoaded` fallback (project does not enable Astro ViewTransitions).
- **TableOfContents:** IntersectionObserver now also watches `details.spoiler[id]` so the active TOC item highlights as users scroll past spoilers.
- **FAQ:** removed `## Question` markdown headings — questions live solely in `<Spoiler title="...">`. Cleaner layout, no duplicated text above each spoiler.

---

## v3.4.55 (2026-04-10)

> Docs: [FAQ](https://doc-claude.brewcode.app/faq/) | [installation](https://doc-claude.brewcode.app/installation/) | [brewcode overview](https://doc-claude.brewcode.app/brewcode/overview/) | [brewcode skills](https://doc-claude.brewcode.app/brewcode/skills/) | [brewdoc overview](https://doc-claude.brewcode.app/brewdoc/overview/) | [brewtools overview](https://doc-claude.brewcode.app/brewtools/overview/) | [brewui overview](https://doc-claude.brewcode.app/brewui/overview/)

### docs
#### Added
- **FAQ:** new spoiler "My install is too old — the skill isn't available" with bootstrap prompt for very old installs. First question now leads with the skill (Callout) and falls back to the prompt block. Every skill mention is an active link to its doc page.

#### Changed
- **FAQ:** "Shortcut" prose lines extracted into green `<Callout type="tip">` blocks pointing to `/brewtools:plugin-update`. Install/update prompts now have explanatory intro and post-install Callout pointing to the skill.
- **installation:** `/brewcode:setup` and `/brewtools:plugin-update` mentions converted to active links to their skill pages.
- **brewcode/overview:** Card and Tab content links `/brewcode:setup`, `/brewcode:start`, `/brewcode:standards-review`, `/brewcode:teams` to skill pages.
- **brewcode/skills:** summary table — both the `Skill` and `Command` columns are now links to the per-skill page.
- **brewdoc/overview, brewtools/overview, brewui/overview:** Commands tables — every skill cell is an active link.

---

## v3.4.54 (2026-04-10)

> Docs: [guide](https://doc-claude.brewcode.app/brewdoc/guide/) | [FAQ](https://doc-claude.brewcode.app/faq/)

### brewdoc
#### Changed
- **guide:** refresh reference topics to current suite state — 4 plugins, 28 skills, 18 agents. Added `/brewtools:plugin-update` row to skills catalog, hooks subsection listing all 12 shipped hooks in `topic-customization.md`, renamed "Three Plugins Overview" → "Four Plugins Overview" across SKILL.md, welcome menu, overview/installation/agents-catalog/skills-catalog topic files. Fixed stale counts: Brewtools Skills (6 → 7), Plugin Agents (17 → 18), Skills Catalog menu (27 → 28).
- **guide README:** updated descriptions to include brewui, corrected skill/agent counts.

### docs
#### Added
- **Spoiler component:** collapsible `<details>`-based spoiler with animated chevron, hover state, and accessible focus outline — usable in any MDX page.
- **FAQ page:** all 7 questions wrapped in collapsed spoilers so users can scan titles and expand only what they need. Added intro hint "Click any question to expand the answer."

#### Changed
- **brewdoc/guide page:** synced with skill changes — "Four Plugins Overview", all 4 plugins, all 28 skills, all 18 agents.

---

## v3.4.53 (2026-04-10)

> Docs: [plugin-update](https://doc-claude.brewcode.app/brewtools/skills/plugin-update/) | [brewtools overview](https://doc-claude.brewcode.app/brewtools/overview/)

### brewtools
#### Added
- **plugin-update:** skill-level `README.md` with Quick Start, Modes, Examples, Discovery Method, Tips.

#### Changed
- **README.md:** refresh skills table (3 → 7 entries), agents table (1 → 3), architecture tree, quick start, docs links, header tagline, stats.

### docs
#### Changed
- **brewtools/skills/plugin-update:** expanded page — accurate 6-phase Steps flow, full `Quick reference`, status-table example, Troubleshooting table, embedded `InstallPrompt` update prompt, explicit reload Callout, warning about non-existent `claude plugin list` CLI.
- **brewtools/overview:** add plugin-update card to skills grid, Commands table row, architecture tree entry.

---

## v3.4.52 (2026-04-10)

> Docs: [plugin-update](https://doc-claude.brewcode.app/brewtools/skills/plugin-update/) | [FAQ](https://doc-claude.brewcode.app/faq/) | [installation](https://doc-claude.brewcode.app/installation/) | [guide](https://doc-claude.brewcode.app/brewdoc/skills/guide/)

### brewtools
#### Added
- **plugin-update:** new skill — checks installed plugins, installs missing brewcode plugins, updates outdated ones, reports versions. Interactive (default) or args `check|update|all`. Uses filesystem discovery (not `claude plugin list`, which does not exist).

### brewdoc
#### Changed
- **guide:** Phase 0.5 plugin freshness check — offers to update outdated/missing brewcode plugins before starting the guide.

### docs
#### Added
- **FAQ:** new page answering top install/update questions with copy-paste prompts
- **Header:** FAQ button between Search and GitHub badge
- **InstallPrompt component:** shared MDX component rendering coercive install/update prompts on every plugin overview and installation page
- **UpdateNotice component:** footer callout on every skill page pointing to `/brewtools:plugin-update`

#### Changed
- **installation:** promote Updating section, add Callouts, tag `--plugin-dir` as developers-only

### README
#### Added
- **Install in 30 seconds:** copyable install/update prompts at top of root README and each per-plugin README
- Fix missing `brewui` row and update skill counts

### 🔄 How to update brewcode plugins

Paste this prompt into a Claude Code session (it forces Claude to run the full command chain):

~~~
Execute these commands in this session, one by one, show full output for each, do not skip any:

1. claude plugin marketplace update claude-brewcode
2. claude plugin update brewcode@claude-brewcode
3. claude plugin update brewdoc@claude-brewcode
4. claude plugin update brewtools@claude-brewcode
5. claude plugin update brewui@claude-brewcode

After all 5 commands succeed, run `/reload-plugins` (or type `exit` then `claude` to restart). Do not summarize — run the commands now.
~~~

Or, if brewtools is already installed, just run `/brewtools:plugin-update`.

---

## v3.4.51 (2026-04-09)

> Docs: [e2e](https://doc-claude.brewcode.app/brewcode/skills/e2e/)

### docs
#### Fixed
- **e2e page:** timeline (Steps) broken — replaced markdown numbered lists with explicit JSX `<li>` elements

---

## v3.4.50 (2026-04-09)

> Docs: [debate](https://doc-claude.brewcode.app/brewtools/skills/debate/) | [brewtools](https://doc-claude.brewcode.app/brewtools/overview/) | [brewcode skills](https://doc-claude.brewcode.app/brewcode/skills/)

### brewcode
#### Changed
- **skills:** moved debate to brewtools plugin (13 skills remaining)
- **docs:** removed all "moved" stub pages (10 files deleted)

### brewtools
#### Added
- **skills:** debate — multi-agent evidence-based debate orchestrator (moved from brewcode, now 6 skills)

### docs
#### Added
- **all pages:** GitHub link cards on all 60 doc pages (Latest Release + View on GitHub)
- **overview pages:** installation guide quick-reference cards
#### Changed
- **navigation:** cleaned up all "(Moved)" entries
- **all pages:** updated plugin counts to 4 plugins, 27 skills, 17 agents
- **guide:** updated to cover all 4 plugins including brewui
#### Fixed
- **license:** corrected author name to Maksim Kochetkov
- **debate:** fixed /brewtools:review → /brewcode:review references
- **imports:** removed all unused MDX component imports

---

## v3.4.49 (2026-04-08)

> Docs: [brewui image-gen](https://doc-claude.brewcode.app/brewui/skills/image-gen/)

### brewui
#### Changed
- **image-gen:** unified anti-slop strategy — merged forbidden patterns, story-first methodology, and style constraints into a single `anti-slop.md` reference

---

## v3.4.48 (2026-04-07)

> Docs: [brewcode](https://doc-claude.brewcode.app/plugin/brewcode/)

### brewui
#### Changed
- **docs:** added copyright notice © 2026 to docs site footer

---

## v3.4.47 (2026-04-07)

> Docs: [brewtools ssh](https://doc-claude.brewcode.app/brewtools/skills/ssh/) | [brewtools deploy](https://doc-claude.brewcode.app/brewtools/skills/deploy/) | [brewui glm-design-to-code](https://doc-claude.brewcode.app/brewui/skills/glm-design-to-code/) | [brewtools ssh-admin](https://doc-claude.brewcode.app/brewtools/agents/ssh-admin/) | [brewtools deploy-admin](https://doc-claude.brewcode.app/brewtools/agents/deploy-admin/) | [brewui glm-openrouter-specialist](https://doc-claude.brewcode.app/brewui/agents/glm-openrouter-specialist/) | [brewui glm-zai-specialist](https://doc-claude.brewcode.app/brewui/agents/glm-zai-specialist/)

### brewcode
#### Changed
- **skills:** moved `glm-design-to-code` to brewui plugin (visual/creative tools)
- **skills:** moved `ssh` and `deploy` to brewtools plugin (universal utilities)
- **agents:** moved `glm-openrouter-specialist` and `glm-zai-specialist` to brewui
- **agents:** moved `ssh-admin` and `deploy-admin` to brewtools
- **docs:** old brewcode pages replaced with redirect stubs pointing to new locations

### brewtools
#### Added
- **skills:** `ssh` -- SSH server management (moved from brewcode)
- **skills:** `deploy` -- GitHub Actions deployment (moved from brewcode)
- **agents:** `ssh-admin` -- SSH server administrator (moved from brewcode)
- **agents:** `deploy-admin` -- GitHub Actions administrator (moved from brewcode)
- **hooks:** `pre-task.mjs` -- injects `BT_PLUGIN_ROOT` into subagent prompts

### brewui
#### Added
- **skills:** `glm-design-to-code` -- GLM vision design-to-code (moved from brewcode)
- **agents:** `glm-openrouter-specialist` -- OpenRouter API routing (moved from brewcode)
- **agents:** `glm-zai-specialist` -- Z.ai GLM API expert (moved from brewcode)
- **hooks:** `pre-task.mjs` -- injects `BU_PLUGIN_ROOT` into subagent prompts

---

## v3.4.46 (2026-04-07)

> Docs: [deploy skill](https://doc-claude.brewcode.app/brewcode/skills/deploy/) | [deploy-admin agent](https://doc-claude.brewcode.app/brewcode/agents/deploy-admin/)

### brewcode
#### Added
- **deploy skill:** GitHub Actions deployment -- workflows, releases, GHCR, CI/CD with safety gates
- **deploy skill:** 6 modes: setup, create, release, deploy, monitor, update-agent
- **deploy skill:** 4 scripts: detect-mode, gh-env-check, workflow-discover, deploy-local-ops (CLAUDE.local.md CRUD)
- **deploy skill:** Safety classification: READ/CREATE (free), MODIFY/SERVICE (confirm), DELETE/PRIVILEGE (always confirm)
- **deploy skill:** 4 workflow templates: Build+Push GHCR, Deploy VPS, Release, Security Scan
- **deploy skill:** CLAUDE.local.md GitHub Config + Workflows sections (coexists with SSH sections)
- **deploy skill:** Dynamic deploy-admin agent generation from template with live workflow data
- **deploy skill:** SSH skill integration for VPS deploy targets and health checks
- **deploy-admin agent:** GitHub Actions and deployment agent with live workflow inventory, release flow, Docker/GHCR patterns

---

## v3.4.45 (2026-04-07)

> Docs: [image-gen](https://doc-claude.brewcode.app/brewui/skills/image-gen/)

### brewui
#### Changed
- **image-gen:** Z.ai provider upgraded from CogView-4 to GLM-image (flagship model, top-tier quality, same $0.015/image)
- **image-gen:** Z.ai endpoint migrated from `open.bigmodel.cn` to `api.z.ai`
- **image-gen:** Default Z.ai size updated to 1280x1280 with custom size support (512-2048px, multiples of 32)
- **image-gen:** Docs page updated with GLM-image promotional badge and Z.ai docs link

---

## v3.4.44 (2026-04-07)

> Docs: [ssh skill](https://doc-claude.brewcode.app/brewcode/skills/ssh/) | [ssh-admin agent](https://doc-claude.brewcode.app/brewcode/agents/ssh-admin/) | [image-gen](https://doc-claude.brewcode.app/brewui/skills/image-gen/)

### brewcode
#### Added
- **ssh skill:** Remote server management -- connect, configure, deploy, administer Linux servers with safety gates
- **ssh skill:** 5 modes: setup, connect, configure, execute, update-agent
- **ssh skill:** 4 scripts: detect-mode, ssh-env-check, server-discover, claude-local-ops (CLAUDE.local.md CRUD)
- **ssh skill:** Safety classification: READ/CREATE (free), MODIFY/SERVICE (confirm), DELETE/PRIVILEGE (always confirm)
- **ssh skill:** Server auto-discovery: OS, kernel, Docker, containers, disks, services, ports
- **ssh skill:** CLAUDE.local.md persistent config (gitignored) with server inventory
- **ssh skill:** Dynamic ssh-admin agent generation from template with live server data
- **ssh skill:** Robustness: fail-fast, loop protection (max retries), timeouts, manual fallback strategy
- **ssh-admin agent:** Linux server administrator -- SSH, Docker, Compose, systemd, Caddy/Nginx, security hardening

### brewui
#### Changed
- **image-gen:** Added Brewpage publish tip for remote/headless image viewing

---

## v3.4.43 (2026-04-07)

> Docs: [brewui overview](https://doc-claude.brewcode.app/brewui/overview/) | [image-gen](https://doc-claude.brewcode.app/brewui/skills/image-gen/)

### brewui (NEW PLUGIN)
#### Added
- **brewui plugin:** New plugin for UI/visual/creative tools
- **image-gen:** AI image generation via 5 providers (Gemini Imagen 4, OpenRouter Gemini 2.5 Flash, OpenRouter GPT-5, Z.ai CogView-4, OpenAI DALL-E 3)
- **anti-slop:** Style-aware prompt engineering (photo, illustration, art)
- **multi-mode:** generate, edit, config, update

---

## v3.4.42 (2026-04-06)

> Docs: [publish](https://doc-claude.brewcode.app/brewdoc/publish/)

### brewdoc
#### Added
- **publish:** Multi-file site upload support — directories and ZIP archives via `/api/sites` endpoint
- **publish:** `--entry <filename>` argument for custom entry point override
- **publish:** SITE content type with auto-detection (directory → ZIP + upload, `.zip` → direct upload)
- **publish:** Entry file auto-detection: `--entry` flag > `index.html` > first `.html` alphabetically
- **publish:** Site pre-publish stats showing file count, total size, and detected entry file
- **publish:** History table extended with Type column (`html`, `json`, `file`, `site (N files)`)

---

## v3.4.41 (2026-04-06)

> Docs: [publish](https://doc-claude.brewcode.app/brewdoc/publish/)

### brewdoc
#### Changed
- **publish:** Reverted model from sonnet back to haiku for publish skill

---

## v3.4.39 (2026-04-06)

> Docs: [publish](https://doc-claude.brewcode.app/brewdoc/publish/)

### brewdoc
#### Changed
- **publish:** Atomic token handling — ownerToken never in conversation output, saved directly to history file
- **publish:** Namespace auto-suggestion generates meaningful slugs from content context (e.g. `api-docs`, `pricing`)

---

## v3.4.37 (2026-04-06)

> Docs: [teams](https://doc-claude.brewcode.app/brewcode/skills/teams/) | [hooks](https://doc-claude.brewcode.app/brewcode/hooks/) | [agents](https://doc-claude.brewcode.app/brewcode/agents/) | [auto-sync](https://doc-claude.brewcode.app/brewdoc/auto-sync/)

### brewcode
#### Fixed
- **agents:** Added `*_PLUGIN_ROOT` guard to `glm-zai-specialist`, `glm-openrouter-specialist`, `bc-coordinator` — stop with clear error if plugin root missing from prompt context
- **docs:** CLAUDE.md Architecture table — matcher updated to `PreToolUse:Task|Agent`

#### Changed
- **rules:** `best-practice.md` — added release docs links requirement (#8), autonomous release flow (#9), plugin root guard pattern (#10)
- **release process:** CLAUDE.md Version Sync — autonomous commit/push/deploy, mandatory `> Docs:` links in RELEASE-NOTES.md

### brewdoc
#### Fixed
- **agents:** Added `BD_PLUGIN_ROOT` guard to `bd-auto-sync-processor` — stop with clear error if plugin root missing

---

## v3.4.36 (2026-04-06)

> Docs: [teams](https://doc-claude.brewcode.app/brewcode/skills/teams/) | [hooks](https://doc-claude.brewcode.app/brewcode/hooks/)

### brewcode
#### Fixed
- **hooks:** `hooks.json` matcher `"Task"` changed to `"Task|Agent"` — pre-task.mjs and post-task.mjs now fire on Agent tool calls (renamed from Task in Claude Code ~v2.1.63)
- **teams:** Agent template `agent-template.md` — trace-ops.sh calls made optional (1 attempt max, skip silently on failure). Agents no longer hang when `BC_PLUGIN_ROOT` is unavailable as shell env var
- **teams:** `BC_PLUGIN_ROOT` usage clarified as prompt-injected plain text, not shell env var — agents instructed to read value from prompt context and substitute literally

---

## v3.4.35 (2026-04-06)

> Docs: [teams](https://doc-claude.brewcode.app/brewcode/skills/teams/) | [skills](https://doc-claude.brewcode.app/brewcode/skills/) | [skill-creator](https://doc-claude.brewcode.app/brewcode/agents/skill-creator/) | [guide](https://doc-claude.brewcode.app/brewdoc/guide/)

### brewcode
#### Changed
- **teams:** Added Review and Fix Pipeline (C5-C9) after agent creation — 3 parallel quorum reviewers, 2/3 consensus filter, verification, fix critical/important issues, re-verify with max 2 retry cycles. Flags: `--skip-review`, `--review`

### docs
#### Changed
- **skills overview:** Added Lifecycle timeline, Skill Management cross-refs, Independent Skills cards
- **skills skill:** Removed large bash scripts, added Cards for modes, Steps for 7-phase workflow, Tabs for details
- **skill-creator:** Added CardGrid for Skill Anatomy and Design Patterns, Steps for creation process, See Also cross-refs
- **guide:** Fixed Steps div wrappers, added domain CardGrid, Steps for How It Works flow
- **publish:** Fixed Steps div wrappers
- **Card component:** Extended iconMap with heart, money, library, fire, handshake, rocket, package
- **all pages:** Replaced raw emoji hex codes with named icons across getting-started, quickstart, installation, debate

#### Added
- **README sync:** All 28 README files synced with docs site (root, 3 plugins, 21 skills)

### chore
- `.gitignore`: ignore `*.png` and `.playwright-mcp/`, untracked stale screenshots

---

## v3.4.29 (2026-04-06)

> Docs: [skills](https://doc-claude.brewcode.app/brewcode/skills/skills/) | [skill-creator](https://doc-claude.brewcode.app/brewcode/agents/skill-creator/)

### brewcode
#### Changed
- **skills:** Unified create/up flow with 7-phase pipeline (Discovery → User Interaction → Create/Improve → Validate → Review → E2E Testing → Summary). Added testing depth selection (Quick/Standard/Deep), review orchestration (Simple/Quorum with DoubleCheck verification), E2E testing via `claude -p`, and structured summary reports
- **skill-creator:** Added Step 5.7 (unit test generation for scripts/), Step 5.8 (README generation from template), pre-filled values support, Bash tool in agent toolset
- **permission-guard:** Added `.claude/teams/` and `.claude/memory/` to auto-allowed directories

#### Added
- **skills/references:** 4 new templates — `review-prompt.md` (quality review checklist), `e2e-template.md` (E2E test scenarios), `readme-template.md` (skill README with auto-sync), `summary-template.md` (Phase 6 report)

---

## v3.4.28 (2026-04-05)

> Docs: [debate](https://doc-claude.brewcode.app/brewcode/skills/debate/)

### brewcode
#### Added
- **debate:** New `/brewcode:debate` skill — evidence-based multi-agent debate orchestration with Discovery phase (parallel codebase + web research before every debate), 3 modes (Challenge, Strategy, Critic), dynamic agent generation (2-5 agents), mandatory source citations for all arguments, sequential debates with JSONL logging, secretary summaries, and judge decisions

---

## v3.4.26 (2026-04-04)

> Docs: [glm-design-to-code](https://doc-claude.brewcode.app/brewcode/skills/glm-design-to-code/)

### brewcode
#### Added
- **glm-design-to-code-trial:** Standalone trial skill for `npx skills` distribution (README.md + SKILL.md)
- **gitignore:** `d2c-output/` excluded from repo (generated test artifact)

---

## v3.4.25 (2026-04-04)

> Docs: [glm-design-to-code](https://doc-claude.brewcode.app/brewcode/skills/glm-design-to-code/)

### brewcode
#### Added
- **glm-design-to-code:** Smart intent detection — Opus auto-classifies user intent (reproduce, creative, enhance, modify, convert) from prompt text
- **glm-design-to-code:** Dual input for HTML — screenshots HTML file and sends both image + HTML source to GLM for better conversion
- **glm-design-to-code:** Custom instruction support — `GLM_INSTRUCTION` passed to scripts as param 8, replaces hardcoded prompts

#### Changed
- **glm-design-to-code:** Profile prompts are now quality-only (no intent coupling) — `profile-max.md`, `profile-optimal.md`, `profile-efficient.md`
- **glm-design-to-code:** `glm-build-request.sh` — params 8 (instruction) + 9 (html_source), rawfile for user_text, dual jq template
- **glm-design-to-code:** `glm-build-text-request.sh` — param 8 (instruction), rawfile for user_text (ARG_MAX safety)
- **glm-design-to-code:** Resolved Configuration table shows Intent, Instruction, Dual Input rows
- **glm-design-to-code:** Step 3 payload routing: 5-way table (image/html-dual/html-text/text/url)

---

## v3.4.24 (2026-04-03)

> Docs: [glm-design-to-code](https://doc-claude.brewcode.app/brewcode/skills/glm-design-to-code/)

### brewcode
#### Changed
- **glm-design-to-code:** Removed `disable-model-invocation` — skill now auto-triggers on natural phrases ("convert screenshot to code", "turn design into React")
- **glm-design-to-code:** Optimized description for LLM auto-invocation (3 natural examples, explicit "external GLM API" signal)
- **glm-design-to-code:** Mandatory resolved configuration output before every API call (all modes: CREATE, REVIEW, FIX)
- **glm-design-to-code:** Parameter priority: prompt flags > inline text > `.env` > defaults; raw text scanning for inline keys and model names
- **glm-design-to-code:** `--model` auto-prefix `z-ai/` for OpenRouter, auto-strip for Z.ai

---

## v3.4.23 (2026-04-03)

> Docs: [glm-design-to-code](https://doc-claude.brewcode.app/brewcode/skills/glm-design-to-code/)

### brewcode
#### Fixed
- **glm-design-to-code:** Context window corrected to 202K (was 128K) across SKILL.md, README, docs
- **glm-design-to-code:** Replaced phantom model `glm-4.5-air:free` with `glm-4.6v-flash` in key validation
- **glm-design-to-code:** Standardized pricing across all documentation ($0.01-0.08 range by profile)
- **glm-design-to-code:** API key flow now validates before saving to `.env` (prevents invalid key persistence)
- **glm-design-to-code:** Split API key provider choice and key entry into separate AskUserQuestion steps
- **glm-design-to-code:** Settings dialog now loops for multiple changes before confirming
- **glm-design-to-code:** REVIEW mode uses parsed `RESULT_IMAGE` instead of hardcoded path
- **Scripts:** All 6 scripts now have +x execute permissions
- **Scripts:** `glm-request.sh` curl timeout increased to 600s for large payloads
- **Scripts:** `glm-request.sh` adds `HTTP-Referer` and `X-Title` headers for OpenRouter requests
- **Scripts:** `glm-extract.sh` allows spaces in output directory paths
- **Scripts:** `glm-extract.sh` awk `system()` call now quotes directory paths
- **Scripts:** `glm-verify.sh` background timer PID tracked and cleaned up on `--kill`

### docs
#### Enhanced
- **glm-design-to-code.mdx:** Added Design2Code Benchmark Comparison section (GLM-5V-Turbo 94.8 vs Claude Opus 4.6 77.3)
- **glm-design-to-code.mdx:** Added Our Research Results section with per-framework Tabs (HTML 9.5, React 8.0, Flutter 9.0)
- **glm-design-to-code.mdx:** Added External Resources CardGrid (Z.ai docs, OpenRouter, BenchLM, The Decoder)
- **glm-design-to-code.mdx:** Expanded Pipeline Flow Steps to 7 detailed steps
- **glm-design-to-code.mdx:** Updated GLM Models table context window to 202K

---

## v3.4.22 (2026-04-03)

### brewcode
#### Added
- **New skill:** `glm-design-to-code` — GLM vision model-powered design-to-code generator
  - Three modes: CREATE (any input to code: screenshots, text descriptions, HTML, URLs), REVIEW (compare original vs result), FIX (apply feedback)
  - Supports HTML/CSS, React 18, Flutter Web, custom frameworks
  - Three quality profiles: maximum (pixel-perfect), optimal (balanced), efficient (fast)
  - Dual provider support: Z.ai (direct) and OpenRouter
  - Full pipeline: argument parsing, API key setup, payload build, API request, file extraction, build, verification
  - Scripts: parse-args.sh, glm-build-request.sh, glm-build-text-request.sh, glm-request.sh, glm-extract.sh, glm-verify.sh
- **Updated agents:** `glm-zai-specialist`, `glm-openrouter-specialist` — migrated script paths to plugin directory

---

## v3.4.21 (2026-04-03)

### docs
#### Added
- **`/brewdoc:guide` docs page** — guide.mdx with 9 topics, 3 domains, progress tracking, environment health check
- Updated brewdoc overview.mdx: 6 skills, guide card + command row + directory tree entry
- Updated navigation.ts: guide link in Brewdoc section

---

## v3.4.20 (2026-04-02)

### brewdoc
#### Added
- **`/brewdoc:guide` skill** — interactive teaching skill for the brewcode plugin suite: 9 topics across 3 domains (Getting Started, Core Workflow, Mastery), haiku-powered, progress tracking with JSON persistence, multilingual (EN/RU/PT), environment validation, section-by-section delivery with AskUserQuestion navigation
- **Guide scripts** — `validate.sh` (docs site, GitHub releases, installed versions, auto-update status), `progress.sh` (CRUD for guide progress JSON at `~/.claude/brewdoc/`)
- **11 reference files** — welcome banner + menu, ASCII architecture diagrams, 9 topic files covering all 22+ skills, 14+ agents, 9 hooks, killer flow pipeline, dynamic teams, customization, project integration, and power features

---

## v3.4.19 (2026-04-02)

### brewcode
#### Added
- **`/brewcode:e2e` skill** — full-cycle E2E testing orchestration: 6 modes (setup, create, update, review, rules, status), 5 runtime agents created via agent-creator, BDD scenarios with YAML frontmatter, layered test architecture (stack-agnostic), quorum review (3 reviewers, 2/3 consensus), MAX_CYCLES=3 review loops
- **E2E references** — `e2e-rules.md` (24 rules, 6 categories), `e2e-architecture.md` (layered diagram + 4-stack mapping), `agent-template.md` (Rules Loading + Self-Check protocols), 6 mode flow files
- **`detect-mode.sh`** — POSIX sh argument parser for e2e skill (6 keywords, smart default: status if agents exist, setup otherwise)

### docs
#### Updated
- New `/brewcode/skills/e2e` docs page with modes, agents, architecture, quorum review
- Updated skills.mdx (13 skills), overview.mdx (13 skills, e2e in directory tree + Components), navigation.ts

---

## v3.4.17 (2026-04-02)

### brewpage-publish
#### Fixed
- **Security: W007 Insecure Credential Handling** — ownerToken no longer appears in conversation output; curl + jq parsing + history save now execute atomically inside a single bash block; LLM only sees the published URL; password column removed from history table

---

## v3.4.16 (2026-04-02)

### brewcode
#### Changed
- **Merged `/brewcode:install` into `/brewcode:setup`** — prerequisites check (brew, coreutils, jq, grepai) now runs automatically as Phase 0 before project analysis; if all required tools are present, Phase 0 is skipped silently; interactive prompts via AskUserQuestion for missing components and optional grepai install

#### Removed
- **`/brewcode:install` skill** — deleted; all functionality absorbed by `/brewcode:setup` Phase 0

---

## v3.4.15 (2026-04-02)

### brewcode
#### Changed
- **Teams: session-scoped trace system** — replaced 3 Markdown files (`tracking.md`, `issues.md`, `insights.md`) with single `trace.jsonl`; write via `trace-ops.sh add` (Bash append, ~96% token savings vs Edit); cursor-based incremental reads for `update` mode
- **`trace-ops.sh`** — new POSIX sh utility: `add` (JSONL append), `read` (jq/grep filter), `cursor` (incremental bookmark), `migrate` (Markdown-to-JSONL conversion with `.bak` backup)
- **SID injection in `pre-task.mjs`** — session ID (8 chars) auto-injected into all agent prompts when `.claude/teams/` exists
- **`verify-team.sh`** — checks `trace.jsonl` instead of 3 MD files; detects legacy files and suggests migration

---

## v3.4.14 (2026-04-02)

### brewcode
#### Added
- **`/brewcode:teams`** — new skill: creates and manages dynamic teams of domain-specific agents; modes: `create`, `update`, `status`, `cleanup`; generates agent roster with tracking framework in `.claude/teams/`
- **Mode Switcher** — skills can toggle persistent session-level behavioral modes via `brewcode.state.json`; hooks inject mode instructions on every event (`forced-eval.mjs`, `session-start.mjs`, `pre-task.mjs`)
- **`getActiveMode()` utility** in `hooks/lib/utils.mjs` — reads active mode and loads instructions from `modes/{name}.md`
- **`brewcode/modes/` directory** — mode instruction files; ships with `manager.md` default
- **Mode Switcher design pattern** added to `skill-creator` agent and `hook-creator` agent
- **Step 2.5** in `/brewcode:skills create` — auto-detects mode-switching intent and suggests Mode Switcher pattern
- **Dynamic Agent Resolution** in `/brewcode:plan` — checks `.claude/teams/` roster before plugin agents; priority: team > project > plugin > system

#### Changed
- `hook-creator` agent: updated to Claude Code v2.1.89+ — added `PermissionDenied` event (26 events total), `defer` support in PreToolUse, `retry` response for PermissionDenied

### brewtools
#### Added
- **NEW plugin** — universal text utilities extracted from brewcode
- Skills: `text-optimize`, `text-human`, `secrets-scan`
- Agent: `text-optimizer`
- `BT_PLUGIN_ROOT` injected by SessionStart hook
- Install: `claude plugin install brewtools@claude-brewcode`

### brewcode (removed)
- `text-optimize`, `text-human`, `secrets-scan` skills — moved to brewtools
- `text-optimizer` agent — moved to brewtools
- Fallback added to `convention/SKILL.md` P5 when brewtools not installed

---

## v3.4.13 (2026-04-01)

### docs
#### Fixed
- Steps timeline layout on publish docs page

---

## v3.4.12 (2026-03-31)

### docs
#### Fixed
- Steps alignment on brewpage/publish page — removed Badge tags and div wrappers

---

## v3.4.11 (2026-03-31)

### brewdoc
#### Added
- **brewpage skill** — publish text, markdown, JSON, or files to brewpage.app; interactive namespace + password selection; owner token saved to `.claude/brewpage-history.md`; model: haiku

### skills (marketplace)
#### Added
- **brewpage skill** — standalone marketplace skill with advertising footer; same functionality as brewdoc:brewpage

### docs
#### Added
- **brewdoc/brewpage** docs page — full documentation with Steps, content-type table, namespace/password sections, owner token & history
- **brewpage.app** link and Callout on the brewpage docs page

#### Changed
- brewdoc overview updated: 5 skills, brewpage card, command row

---

## v3.4.10 (2026-03-31)

### brewcode
#### Added
- **15 individual skill pages** -- full content from SKILL.md sources (setup, spec, plan, start, convention, rules, grepai, install, teardown, text-optimize, text-human, standards-review, skills, agents, secrets-scan)
- **13 individual agent pages** -- full system prompt content (developer, tester, reviewer, architect, skill-creator, agent-creator, hook-creator, text-optimizer, bash-expert, bc-coordinator, bc-knowledge-manager, bc-grepai-configurator, bc-rules-organizer)
- **permission-guard hook** documented in hooks page (9th hook)

### brewdoc
#### Added
- **my-claude dedicated page** -- moved from inline section in overview to standalone page

### docs
#### Changed
- **Collapsible sidebar** -- Skills (15) and Agents (13) groups with `<details>/<summary>`, auto-expand on current page
- **Index pages** -- skills.mdx and agents.mdx converted from Tabs to CardGrid links
- **Site expanded** from 12 to 41 content pages (29 new)

---

## v3.4.9 (2026-03-31)

### brewcode
#### Changed
- **hook-creator agent** -- synced with HOOKS-REFERENCE: 14 to 25 events, version history, lifecycle diagrams, channel reliability matrix, expanded matcher patterns, output schemas, async recommendations
- **agent-creator agent** -- synced with AGENT-REFERENCE: added `initialPrompt`, `isolation`, `mcpServers`, `color`, `memory` fields; 10 bugs table; version history; architectural limitations; expanded validation checklist (6 to 12 items); debugging section
- **skill-creator agent** -- synced with SKILL-REFERENCE: 10 bugs table; version history; `effort` max value; `CLAUDE_SKILL_DIR` version fix (v2.1.69 to v2.1.71); 250-char description truncation; `once` field; architectural limitations
- **permission-guard hook** -- added Bash tool to PermissionRequest matcher; network/dangerous command blocklist; restricted `rm` to safe dirs; added `.claude/tmp/`, `/tmp/`, `/private/tmp/` to allowed paths

#### Added
- **Reference auto-sync dependents** -- `dependents` field in reference frontmatter for cascading updates to creator agents
- **Downstream tracking** -- each reference document now lists dependent plugin artifacts

---

## v3.4.8 (2026-03-30)

### brewcode
#### Added
- **permission-guard hook** -- PermissionRequest hook auto-allows Edit/Write for project `.claude/` subdirectories (tasks, reports, rules, skills, scripts, agents, hooks, private, convention, plans, settings, TASK.md, CLAUDE.md). Global `~/.claude/` excluded
- **forced-eval hook** -- added `[DELEGATE]` manager reminder to UserPromptSubmit alongside existing skill check

---

## v3.4.6 (2026-03-13)

### brewdoc
#### Changed
- **memory skill** — support for `autoMemoryDirectory` from `.claude/settings.json` instead of hardcoded legacy path

### Other
- `.gitignore` — added `.claude/memory/`

---

## v3.4.5 (2026-03-12)

### brewcode
#### Changed
- **skill-creator agent** — added Skill Design Patterns section: Progressive Disclosure, Reference Splitting, Agents-as-References, Dynamic Context, Context Fork, Executable Bash, Skill Chaining, Background Knowledge, Pushy Description, Preloaded Skills

---

## v3.4.4 (2026-03-06)

### brewcode
#### Fixed
- **Silent remote version check failure** -- no message shown when GitHub API check times out (previously showed "(remote check failed)")

---

## v3.4.2 (2026-03-05)

Main changes in [v3.4.0](https://github.com/kochetkov-ma/claude-brewcode/releases/tag/v3.4.0).

### brewcode
#### Added
- **Claude Code version check** -- session-start hook also checks npm registry for newer Claude Code CLI version
- **Version notifications in UI** -- update messages now shown in `systemMessage` (visible to user), not just `additionalContext`

#### Changed
- **Version checks run in parallel** -- brewcode + Claude Code checks via `Promise.all` for minimal latency
- **Regex version parsing** -- `claude -v` output parsed with `\d+\.\d+\.\d+` regex instead of split

---

## v3.4.1 (2026-03-05)

Patch release. Main changes in [v3.4.0](https://github.com/kochetkov-ma/claude-brewcode/releases/tag/v3.4.0).

### brewcode
#### Fixed
- **CI workflows** -- codeql, semgrep, gitleaks now run only on branch push/PR, not on version tags

---

## v3.4.0 (2026-03-05)

### brewcode
#### Added
- **Version check on session start** -- `session-start.mjs` checks GitHub latest release; shows update notification if newer version available, fallback link on timeout/error

#### Changed
- **Skills migrated to `${CLAUDE_SKILL_DIR}`** -- convention, grepai, install, rules, teardown skills now use `${CLAUDE_SKILL_DIR}/scripts/...` instead of relative `scripts/...` paths
- **skill-creator agent** -- documented `${CLAUDE_SKILL_DIR}` variable, updated resource path resolution section, added common mistakes
- **bash-expert agent** -- updated plugin path guidance to distinguish `${CLAUDE_SKILL_DIR}` (skills) vs `$BC_PLUGIN_ROOT` (agents)
- **hooks.md** -- updated path resolution table with `${CLAUDE_SKILL_DIR}` context

#### Fixed
- **pre-task.mjs** -- grepai detection now checks `index.gob` existence, not just `.grepai/` directory

---

## v3.3.2 (2026-03-05)

### brewcode
#### Added
- **brewcode:convention skill** -- Deep project analyzer that extracts etalon classes, patterns, and architecture by layer
  - 4 modes: `full`, `conventions`, `rules`, `paths <p1,p2>`
  - 20-layer analysis framework (14 main + 6 test) with multi-stack support
  - 10 parallel agents for layer analysis → etalon selection → 3 convention docs generation
  - Interactive rules extraction with batched AskUserQuestion flow
  - CLAUDE.md update with etalon quick-reference table
  - POSIX-compliant `convention.sh` script for stack detection, scanning, validation
- **brewcode:agents skill** -- Interactive agent creation and improvement orchestrator
  - Create mode: 3-question interactive setup (scope, model, CLAUDE.md update)
  - Improve mode: improve existing agent by name or path
  - Delegates to `agent-creator` agent for quality agent generation
  - Applies `text-optimize` after creation/improvement
  - Optional CLAUDE.md agents table update
- **bump-version.sh** -- Single command to bump version across all 4 JSON files

#### Changed
- Updated CLAUDE.md: Version Sync section now uses `bump-version.sh`, Update flow includes CLI commands

#### Fixed
- **release.yml** -- `git branch --contains` unreliable on detached HEAD; replaced with `git merge-base --is-ancestor`
- **gitleaks.yml** -- SARIF upload/artifact steps now skip when `results.sarif` not produced
- `convention.sh`: dotnet monorepo module detection (`.sln`/`.csproj` in `has_build_file()`)

### brewdoc
#### Changed
- **session-start hook removed** -- brewdoc no longer injects `BD_PLUGIN_ROOT` at session start
- **pre-task hook retained** -- `BD_PLUGIN_ROOT` still injected into subagent prompts for `bd-auto-sync-processor`
- **Skills use relative paths** -- `my-claude` uses plain relative paths; `md-to-pdf` and `auto-sync` bash commands use `${CLAUDE_SKILL_DIR}`
- Updated `docs/hooks.md`: rewritten to reflect 1 hook (was 2)
- Updated `README.md`, `docs/commands.md`: removed stale `BD_PLUGIN_ROOT` references
- Version unified with brewcode suite (was 1.1.1)

#### Fixed
- **AskUserQuestion compliance** -- `skills/my-claude/SKILL.md`: added `AskUserQuestion` to `allowed-tools`, INDEX update prompt rewritten with explicit header/question/options

---

## v3.0.2 (2026-02-28)

### brewcode
#### Fixed
- **AskUserQuestion compliance** -- Added `AskUserQuestion` to `allowed-tools` / `tools` in all files that require user interaction
  - `skills/text-human/SKILL.md` -- missing tool + explicit instructions at lines 31, 35
  - `skills/grepai/SKILL.md` -- missing tool + Mode: prompt rewritten with 4-option AskUserQuestion
  - `skills/start/SKILL.md` -- missing tool in escalation path (3 fails)
  - `skills/skills/SKILL.md` -- `create` mode now asks invocation type before spawning skill-creator
  - `agents/skill-creator.md` -- clarified foreground-only context for AskUserQuestion
  - `agents/agent-creator.md` -- missing tool added to `tools:`

---

## v3.0.1 (2026-02-28) -- Failure Path & Deadlock Fixes

### brewcode
#### Fixed

- **post-task.mjs** -- branched success/failure messages: on failure, instructs retry/escalate instead of "write report + call coordinator" (P1-1 critical)
- **start/SKILL.md** -- failure cascade to transitive dependents when escalation exhausted; deadlock detection safety net in execution loop (P1-2 critical)
- **start/SKILL.md** -- persist failure to KNOWLEDGE.jsonl before retry for post-compact context (P1-3 critical)
- **start/SKILL.md** -- fixed "ISSUES_TABLE from coordinator output" -> "from verification report" (P1-4)
- **stop.mjs** -- catch block no longer deletes lock on transient error; preserves lock for recovery (P1-5)
- **bc-coordinator.md, PLAN.md.template** -- documented Task API as source of truth; fixed misleading terminal status docs (P1-6)
- **start/SKILL.md** -- added is_error guard for coordinator call: log warning, proceed to TaskUpdate (P1-7)
- **start/SKILL.md** -- moved phase-to-TaskID mapping from NOTE to explicit Sub-step 4a (P1-8)
- **stop.mjs** -- added defense-in-depth comment for redundant validateTaskPath (P1-9)
- **pre-compact.mjs** -- changed artifact validation log level from warn -> debug with "(agent may still be executing)" (P1-10)
- **pre-compact.mjs** -- fixed terminal status check: `=== 'finished'` -> `TERMINAL_STATUSES.has()` (regression fix from review)
- **bc-coordinator.md** -- finalize mode now accepts `status` parameter ("finished" default, "failed" for deadlock/cascade)

#### Updated Files

- `brewcode/hooks/post-task.mjs`
- `brewcode/hooks/stop.mjs`
- `brewcode/hooks/pre-compact.mjs`
- `brewcode/agents/bc-coordinator.md`
- `brewcode/skills/start/SKILL.md`
- `brewcode/skills/setup/templates/PLAN.md.template`

---

## v3.0.0 (2026-02-28) -- Task API Architecture

### brewcode
#### Breaking Changes

- **PLAN.md format** -- new 3-line header (status, current_phase, total_phases)
- **Phase details** -- moved from inline PLAN.md to `phases/` directory
- **Re-run `/brewcode:setup`** to get new templates

#### Added

- **Task API integration** -- TaskCreate/TaskUpdate/TaskList for phase management
- **`phases/` directory** -- individual phase files for agents (`1-research.md`, `1V-verify-research.md`, `FR-final-review.md`, etc.)
- **Phase Registry table** -- slim overview in PLAN.md for manager (replaces inline phase details)
- **Parallel execution** -- tasks in same Parallel group spawn simultaneously via multiple TaskCreate calls
- **Lighter coordinator** -- bc-coordinator now handles knowledge extraction + report verification only
- **Fix phase protocol** -- automatic `{N}F-fix-{name}.md` file generation on verification failure
- **`phase.md.template`** -- execution phase template
- **`phase-verify.md.template`** -- verification phase template
- **`phase-fix.md.template`** -- fix phase template (dynamic)
- **`phase-final-review.md.template`** -- final review template

#### Changed

- **pre-task.mjs** -- v3 task context injection (phase file reminder for agents)
- **post-task.mjs** -- Task API instructions for manager
- **pre-compact.mjs** -- v3-aware handoff message
- **session-start.mjs** -- Task API reminder on active v3 task
- **plan/SKILL.md** -- generates `phases/` directory alongside slim PLAN.md
- **start/SKILL.md** -- uses Task API instead of reading phases inline; manager never reads `phases/` files
- **docs/commands.md** -- updated plan and start sections for v3
- **docs/file-tree.md** -- added `phases/` directory to task structure
- **README.md** -- v3 flow description, updated task structure

#### Backward Compatibility

- v2 tasks continue working (parseTask fallback, hooks detect v3 via `phases/` directory presence)
- No changes to: SPEC skill, KNOWLEDGE format, grepai hooks, review skill, teardown skill

---

## v2.16.4 (2026-02-28)

### brewcode
#### Added

- **bc-knowledge-manager** -- new `prune-rules` mode: removes avoids/best-practice entries from KNOWLEDGE.jsonl after export to rules, leaves only info entries
- **start/SKILL.md** -- Step 5 (Complete): added mandatory `bc-knowledge-manager` call with `prune-rules` mode after `brewcode:rules`

#### Changed

- **docs/flow.md** -- added section g) KNOWLEDGE Pipeline with full lifecycle diagram
- **docs/commands.md** -- `/brewcode:start` section supplemented with "KNOWLEDGE -> Rules (automatic)" subsection
- **skills/start/README.md** -- steps 7-8 describe actualization and cleanup of KNOWLEDGE
- **README.md** (root) -- "Knowledge lifecycle" section describes accumulation and conversion of KNOWLEDGE

---

## v2.16.3 (2026-02-28)

### brewcode
#### Added

- **standards-review SKILL.md** -- Phase 0: asks user via `AskUserQuestion` before analysis -- whether to run `/simplify` at the end or not
- **standards-review SKILL.md** -- Phase 7: conditional `Skill(simplify)` invocation after report if user chose "Yes"
- **standards-review SKILL.md** -- added `AskUserQuestion` and `Skill` to `allowed-tools`

---

## v2.16.2 (2026-02-28)

### brewcode
#### Fixed

- **spec SKILL.md** -- Feature Splitting Check now numbered as step 2.5 in the ordered workflow instead of a floating section
- **spec SKILL.md** -- reviewer loop capped at MAX 3 iterations with user escalation
- **SPEC-creation.md** -- added Scope row to Consolidation Rules table
- **SPEC-creation.md** -- fixed timing estimate from "3 turns" to "5-8 turns depending on review iterations"
- **SPEC-creation.md** -- fixed `Task(agent=...)` to `Task(subagent_type=...)` for Claude Code Task tool API consistency
- **plan SKILL.md** -- fixed `subagent_type="reviewer"` to `subagent_type="brewcode:reviewer"` in traceability check (Step 7)
- **plan SKILL.md** -- added Lightweight Plan Review step (2 agents, 2/2 consensus) to Plan Mode workflow
- **plan SKILL.md** -- clarified KNOWLEDGE.jsonl creation as 0-byte empty file with explicit `touch` command
- **plan SKILL.md** -- added gap remediation instruction after traceability check (Step 7)

---

## v2.16.1 (2026-02-28)

### brewcode
#### Added

- **SPEC.md.template** -- added Success Metrics, Non-Functional Requirements, and Acceptance Criteria sections
  - Success Metrics: measurable targets with how-to-measure column
  - NFR: Performance, Security, Scalability, Reliability with specific targets
  - Acceptance Criteria: Given/When/Then format for verifiable conditions
- **spec SKILL.md** -- enhanced requirements gathering and feature splitting
  - Expanded from 1-4 to 3-7 questions, batched up to 4 per AskUserQuestion call
  - 5 mandatory question categories: Scope, NFR, Acceptance Criteria, Constraints, Edge cases
  - Feature Splitting Check: auto-suggests task split when scope >3 areas or >12 phases
  - Added NFR/Quality row to partition research areas table
- **SPEC-creation.md** -- added NFR category, AC consolidation guidance, updated example partition
- **PLAN.md.template** -- added Technology Choices section (decision, rationale, alternatives)
- **plan SKILL.md** -- improved quorum review and traceability
  - Mixed quorum: Plan + architect + reviewer (replaces 3x Plan agents)
  - Technology Choices substep (5.5) for documenting non-trivial decisions
  - Traceability check: Scope items, Acceptance Criteria, NFR all mapped to phases

#### Updated Files

| File | Change |
|------|--------|
| `skills/setup/templates/SPEC.md.template` | +3 sections: Success Metrics, NFR, Acceptance Criteria |
| `skills/spec/SKILL.md` | Enhanced questions, feature splitting, NFR/Quality area |
| `skills/spec/references/SPEC-creation.md` | NFR category, AC guidance, updated example |
| `skills/plan/SKILL.md` | Mixed quorum, tech choices step, traceability |
| `skills/setup/templates/PLAN.md.template` | +Technology Choices section |
| `plugin.json` | Version 2.16.0 -> 2.16.1 |

---

## v2.16.0 (2026-02-28)

### brewcode
#### Removed

- **`brewcode:auto-sync` skill** -- moved to dedicated `brewdoc` plugin
- **`bd-auto-sync-processor` agent** -- moved to `brewdoc` plugin

#### Notes

- Users of `/brewcode:auto-sync` should install `brewdoc` plugin and use `/brewdoc:auto-sync`

### brewdoc
#### New Skills
- `brewdoc:md-to-pdf` -- Markdown to PDF converter with dual engine support (reportlab/weasyprint), style customization, test mode, dependency management

#### Initial Release (v1.0.0)

- `brewdoc:auto-sync` -- Universal documentation sync (moved from brewcode)
- `brewdoc:my-claude` -- Generate Claude Code installation docs
- `brewdoc:memory` -- Optimize Claude Code memory files interactively

---

## v2.15.7 (2026-02-26)

### brewcode
#### Fixed

- **plugin.json** -- removed explicit `"hooks": "./hooks/hooks.json"` from manifest
  - `hooks/hooks.json` is auto-discovered by Claude Code, explicit declaration caused duplicate loading error
  - Error: "Duplicate hooks file detected: ./hooks/hooks.json resolves to already-loaded file"

#### Updated Files

| File | Change |
|------|--------|
| `plugin.json` | Removed `hooks` field (auto-discovered) |

---

## v2.15.6 (2026-02-21)

### brewcode
#### Changed

- **agent-creator agent** -- added "Reference-Aware Skills" section
  - Guidance for agents spawned from skills with `references/` directories
  - Size-based approach: <50 lines inline into prompt, >50 lines use `$BC_PLUGIN_ROOT` path
- **skill-creator agent** -- added "Reference Splitting Strategy" section
  - When to split references into per-mode files (criteria & thresholds)
  - Loading patterns: conditional (lazy), unconditional single, unconditional multi
  - 3-step pattern template (detect -> read -> validate)
  - New anti-pattern: "All references loaded unconditionally in multi-mode skill"

#### Updated Files

| File | Change |
|------|--------|
| `agents/agent-creator.md` | Reference-Aware Skills section |
| `agents/skill-creator.md` | Reference Splitting Strategy section, loading patterns, anti-pattern |

---

## v2.15.5 (2026-02-20)

### brewcode
#### Changed

- **auto-sync** -- `<auto-sync-override>` body block replaced with frontmatter field `auto-sync-override:` (multiline YAML)
- **bd-auto-sync-processor** -- reads override from frontmatter; optionally synthesizes and writes `auto-sync-override:` to frontmatter when not defined by prompt or file body
- **sync-doc/agent/skill/rule** -- `preserve:` references updated to frontmatter field
- **skills skill** -- renamed from `skillsup` to `skills` for naming consistency

---

## [2.15.4] - 2026-02-19

### brewcode
#### Added

- **spec/plan SKILL.md** -- `-n`/`--noask` flag to skip all user questions and auto-approve defaults
  - `spec`: skips AskUserQuestion in requirements gathering and SPEC validation steps
  - `plan`: skips phase-split presentation and review result confirmation
  - Argument hint updated: `[-n] <description>` for spec, `[-n] [task-dir|SPEC.md|plan-file]` for plan

#### Fixed

- **auto-sync review fixes** -- 11 issues resolved from code review
  - C10: Removed dead code in `index-ops.sh` (macOS date detection, both branches identical)
  - C3: Agent description "sub-agents" -> "direct tool calls" in `bd-auto-sync-processor.md`
  - C16: Override wording "augment (not replace)" -> "augment or selectively override"
  - C18: Fixed misleading coordinator comment (post-task.mjs skip note)
  - C7: Removed NEXT ACTION section (no task directory for standalone auto-sync)
  - C4: Replaced unreachable `claude-code-guide` references with `Grep` across 6 files
  - C5: INDEX update now conditional on error status (errors skip update for retry)
  - C17: Added `preserve:` override guidance to all 5 instruction files
  - C2: Wired optimize flag end-to-end (SKILL.md -> agent -> instructions)
  - PLUGIN_ROOT: Fixed input format -- `{plugin_root}` -> `$BC_PLUGIN_ROOT` (hook-injected)
  - Tool column: Removed stale `Explore (...)` wrapper from 5 instruction files

#### Updated Files

| File | Change |
|------|--------|
| `agents/bd-auto-sync-processor.md` | 7 fixes: description, trust table, override, coordinator, NEXT ACTION, optimize, PLUGIN_ROOT |
| `skills/auto-sync/SKILL.md` | Error-conditional INDEX update, optimize flag pass-through |
| `skills/auto-sync/scripts/index-ops.sh` | Dead code removal |
| `skills/auto-sync/instructions/sync-skill.md` | Tool names, preserve guidance |
| `skills/auto-sync/instructions/sync-agent.md` | Tool names, preserve guidance |
| `skills/auto-sync/instructions/sync-config.md` | Tool names, preserve guidance |
| `skills/auto-sync/instructions/sync-doc.md` | Tool names, preserve guidance |
| `skills/auto-sync/instructions/sync-rule.md` | Tool names, preserve guidance |

---

## [2.15.3] - 2026-02-18

### brewcode
#### Fixed

- **update-plugin.sh** -- `claude plugin` commands reset stdout in non-TTY
  - Output buffered to `/tmp/brewcode-update.log` via `tee`
  - Uninstall+install flow when cache is missing (`update` skips reinstall)
  - Version match check (plugin.json <-> marketplace.json) before start
  - Filesystem verification after install (cache dir + file count)
  - `jq` for JSON parsing instead of fragile `grep+sed`
- **clean-plugin-cache.sh** -- added `--all` flag for full cache wipe
  - Fixed `${@}` crash with `set -u` when no arguments passed

#### Updated Files

| File | Change |
|------|--------|
| `.claude/scripts/update-plugin.sh` | Log buffering, uninstall+install, jq, verification |
| `.claude/scripts/clean-plugin-cache.sh` | `--all` flag, `set -euo pipefail`, ERR trap |

---

## [2.15.2] - 2026-02-18

### brewcode
#### Changed

- **Documentation** -- translated all docs from Russian to English
  - `INSTALL.md`, `README.md`, `grepai.md` -- full translation
  - `docs/commands.md`, `docs/file-tree.md`, `docs/flow.md`, `docs/hooks.md` -- full translation
- **README.md** -- added 6 missing skills to commands table
  - `mcp-config`, `secrets-scan`, `skillsup`, `standards-review`, `text-optimize`, `text-human`

#### Updated Files

| File | Change |
|------|--------|
| `README.md` | Added missing skills, fixed doc link text |
| `brewcode/INSTALL.md` | RU -> EN |
| `brewcode/README.md` | RU -> EN |
| `brewcode/docs/commands.md` | RU -> EN |
| `brewcode/docs/file-tree.md` | RU -> EN |
| `brewcode/docs/flow.md` | RU -> EN |
| `brewcode/docs/hooks.md` | RU -> EN |
| `brewcode/grepai.md` | RU -> EN |

---

## [2.15.1] - 2026-02-16

### brewcode
#### Added

- **forced-eval hook** -- auto-skill activation via plugin hooks
  - `hooks/forced-eval.mjs` -- UserPromptSubmit hook (84% skill activation rate)
  - Reminder: `[SKILL?] Check available skills. If one matches this request, use Skill tool before responding.`
  - No manual installation required -- works automatically with plugin

#### Changed

- **skillsup skill** -- removed `setup` mode (hook now in plugin)
  - Modes: `list`, `up`, `create` (was: `list`, `setup`, `up`, `create`)

#### Removed

- `skillsup/scripts/install-hook.sh` -- moved to plugin hooks
- `skillsup/references/forced-eval-hook.mjs` -- moved to plugin hooks
- `setup/references/forced-eval-hook.mjs` -- not needed (plugin hook)
- Phase 5 from setup skill -- hook installation not needed

---

## [2.15.0] - 2026-02-15

### brewcode
#### Changed

- **Distribution** -- plugin renamed `focus-task` -> `brewcode`, marketplace re-registered
  - `repository` URL fixed: `user/` -> `kochetkov-ma/`
  - Added `homepage`, `author.url`, `tags`, `metadata` block to marketplace.json
  - Removed placeholder `owner.email`
- **CLAUDE.md** -- added Distribution section, fixed skills count (10 -> 15)
- **update-plugin.sh** -- fixed path `plugins/brewcode/` -> `brewcode/`
- **claude-plugin-guide skill** -- major update (v2.0.0)
  - Fixed: `agents` field IS supported in plugin.json
  - Added: all 14 hook events, hook types (command/prompt/agent)
  - Added: auto-update, team config, marketplace restrictions
  - Updated: official docs URLs (code.claude.com)

#### Files

- `.claude-plugin/marketplace.json` -- full metadata, correct URLs
- `brewcode/.claude-plugin/plugin.json` -- added homepage, author.url
- `.claude/scripts/update-plugin.sh` -- fixed version path
- `.claude/skills/claude-plugin-guide/SKILL.md` -- v2.0.0
- `CLAUDE.md` -- Distribution section

---

## [2.14.3] - 2026-02-13

### brewcode
#### Changed

- **auto-sync skill** -- excluded managed directories from auto-scan
  - `rules/`, `agents/`, `skills/` no longer scanned in PROJECT/GLOBAL modes
  - Explicit path required: `/brewcode:auto-sync .claude/rules`
  - Prevents unintended mass updates to structured content

#### Files

- `skills/auto-sync/SKILL.md` -- added managed directories documentation
- `skills/auto-sync/scripts/discover.sh` -- added exclusion logic

---

## [2.14.2] - 2026-02-13

### brewcode
#### Changed

- **text-optimize skill** -- description converted to one-line format
  - Matches agent description style: `"Optimizes text/docs for LLM efficiency. Triggers: ..."`
  - Removed multi-line `|` YAML block, replaced with single quoted string

#### Files

- `skills/text-optimize/SKILL.md` -- description field

---

## [2.14.1] - 2026-02-13

### brewcode
#### Changed

- **skill-creator agent** -- description rules tightened
  - ONE line only (no multiline `|` in YAML)
  - 150-300 chars limit (was 1024)
  - Template: `[What it does]. Use when - [scenarios]. Trigger keywords - [keywords].`
  - `Triggers -` section dropped (saves ~80 chars)
  - All examples updated to single-line format
  - Validation checklists updated

#### Files

- `agents/skill-creator.md` -- 10 edits across description rules, template, examples, validation

---

## [2.14.0] - 2026-02-13

### brewcode
#### Added

- **text-optimize rules** -- 4 new rules from multi-agent research (8 parallel agents)
  - S.7: Consistent Terminology -- one term per concept, no synonyms. Source: agent-skills best-practices (official)
  - S.8: One-Level Reference Depth -- no ref chaining A->B->C. Source: agent-skills best-practices (official)
  - P.5: Instruction Order (Anchoring) -- critical constraints first. Source: ACM FAT 2025 (peer-reviewed)
  - P.6: Default Over Options -- recommend one default, exceptions only. Source: agent-skills best-practices (official)
  - 2 new anti-patterns: overloading single prompts, over-focusing on wording
  - Total rules: 27 -> 31 (27 verified, 4 conditional)

#### Changed

- **text-optimizer agent** -- Step 0 validation rewritten
  - Removed Bash `test -f` (agent doesn't have Bash tool)
  - Now uses Read tool + header verification (`## C - Claude Behavior`, `## Summary`)
  - Explicit stop condition if read fails or headers missing
- **text-optimizer agent** -- Step 2 rule ranges updated (S.1-S.8, P.1-P.6)
- **text-optimize SKILL.md** -- Rule ID Quick Reference, ID-to-Rule Mapping, Mode-to-Rules updated for new rules

#### Files

- `skills/text-optimize/references/rules-review.md` -- +4 rules, +2 anti-patterns, +1 source
- `skills/text-optimize/SKILL.md` -- updated tables and mappings
- `agents/text-optimizer.md` -- Step 0 rewrite, Step 2 range update

---

## [2.13.2] - 2026-02-13

### brewcode
#### Fixed

- **skill-creator agent** -- path resolution rules clarified
  - Added `CRITICAL: USE RELATIVE PATHS!` warning
  - Direct calls (Read, Bash in SKILL.md) -> relative paths (`scripts/foo.sh`)
  - Exception: passing path to agent via Task tool -> use `$BC_PLUGIN_ROOT`
  - Table with NEVER / ALWAYS examples

- **skillsup skill** -- fixed absolute paths bug
  - Changed `$BC_PLUGIN_ROOT/skills/skillsup/scripts/...` -> `scripts/...`
  - 3 bash commands now use relative paths

#### Files

- `agents/skill-creator.md` -- Resource Path Resolution section rewritten
- `skills/skillsup/SKILL.md` -- relative paths for bash commands

---

## [2.13.1] - 2026-02-13

### brewcode
#### Changed

- **skill-creator agent** -- invocation type awareness
  - Added `AskUserQuestion` tool for clarifying who invokes skill
  - User-only skills (`disable-model-invocation: true`) get simple one-liner description
  - LLM-invocable skills require full trigger optimization
  - Decision table: user-only vs LLM-only vs both

- **skillsup skill** -- simplified description
  - One-liner description (user-invocable only, no triggers needed)
  - Added `AskUserQuestion` to allowed-tools

#### Files

- `agents/skill-creator.md` -- invocation type section, description optimization split
- `skills/skillsup/SKILL.md` -- simplified frontmatter

---

## [2.13.0] - 2026-02-13

### brewcode
#### Added

- **skillsup skill** -- skill management with 84% activation rate
  - `list` mode: scan global/project/plugin skills as markdown table
  - `setup` mode: install forced-eval hook (UserPromptSubmit) + settings.json
  - `up` mode: improve skills via skill-creator agent (parallel for folders)
  - `create` mode: research (Explore + WebSearch) then create skill
  - Shorthand: `/skillsup <path>` defaults to `up` mode
  - Based on Scott Spence forced-eval technique

#### Files

- `skills/skillsup/SKILL.md` -- main skill with 4 modes
- `skills/skillsup/README.md` -- documentation
- `skills/skillsup/scripts/list-skills.sh` -- scans 3 locations
- `skills/skillsup/scripts/install-hook.sh` -- installs hook + updates settings
- `skills/skillsup/references/forced-eval-hook.mjs` -- UserPromptSubmit hook

---

## [2.12.4] - 2026-02-13

### brewcode
#### Changed

- **skill-creator agent** -- major update for activation reliability
  - Added "Activation Reality" section: 20-50% baseline rate, GitHub issues
  - Added "Criticality Strategy": Critical -> slash command (100%), Important -> optimized (50-72%)
  - Added "Description Optimization": trigger keywords pattern, "Use when:" template
  - Added "Activation Checklist" in validation step
  - Added "Troubleshooting Activation" section with debug steps
  - Updated all examples with optimized descriptions
  - Verified all GitHub issues are OPEN: #10768, #13919, #15136, #9716
  - Removed closed/duplicate issues: #12679, #4182, #17283

#### Sources

- [#10768 - Intent Matching Broken](https://github.com/anthropics/claude-code/issues/10768)
- [#13919 - Context loss](https://github.com/anthropics/claude-code/issues/13919)
- [#15136 - Fails to invoke](https://github.com/anthropics/claude-code/issues/15136)

---

## [2.12.3] - 2026-02-12

### brewcode
#### Changed

- **Skill path normalization** -- all skills now use relative paths
  - Removed unreliable `$FT_PLUGIN` variable (bash isolation issues)
  - Removed non-existent `$CLAUDE_PLUGIN_ROOT` references
  - Removed cache path hacks (`ls -vd ~/.claude/plugins/cache/...`)
  - Skills reference own resources via relative paths: `scripts/`, `references/`

- **Agent path normalization** -- agents use injected `$BC_PLUGIN_ROOT`
  - Removed `{PLUGIN_ROOT}` placeholders from agent docs
  - Agents receive `BC_PLUGIN_ROOT` via pre-task.mjs injection
  - Fixed bc-coordinator.md and bash-expert.md

- **File reorganization** -- templates moved to skill directories
  - `scripts/teardown.sh` -> `skills/teardown/scripts/teardown.sh`
  - `templates/SPEC-creation.md` -> `skills/spec/references/SPEC-creation.md`
  - `templates/*.template` (4 files) -> `skills/setup/templates/`
  - `setup.sh` updated to use new `SETUP_TEMPLATES` path

#### Updated Files

| File | Change |
|------|--------|
| `skills/teardown/SKILL.md` | Relative `scripts/teardown.sh` |
| `skills/text-optimize/SKILL.md` | `$BC_PLUGIN_ROOT` + context instruction |
| `skills/standards-review/SKILL.md` | Relative `references/` paths |
| `skills/grepai/SKILL.md` | Relative paths (13 scripts) + agent context |
| `skills/setup/SKILL.md` | Relative paths (7 scripts) + agent context |
| `skills/spec/SKILL.md` | Agent context instructions |
| `skills/plan/SKILL.md` | Agent context instructions |
| `skills/auto-sync/SKILL.md` | Relative paths + agent context |
| `skills/rules/SKILL.md` | Relative paths + agent context |
| `skills/text-human/SKILL.md` | Agent context instructions |
| `skills/install/SKILL.md` | Relative paths (8 scripts) |
| `skills/setup/scripts/setup.sh` | `SETUP_TEMPLATES` variable |
| `agents/bc-coordinator.md` | `$BC_PLUGIN_ROOT` for templates |
| `agents/bash-expert.md` | `$BC_PLUGIN_ROOT` instructions |

---

## [2.12.2] - 2026-02-12

### brewcode
#### Added

- **skill-creator agent** -- "Resource Path Resolution" section
  - Documents that skills receive base directory at execution
  - Relative paths to resources (references/, scripts/, assets/) resolve automatically

#### Updated Files

| File | Change |
|------|--------|
| `agents/skill-creator.md` | Added Resource Path Resolution section |

---

## [2.12.1] - 2026-02-12

### brewcode
#### Added

- **BC_PLUGIN_ROOT injection** -- plugin root path available to skills and agents
  - `session-start.mjs`: injects `BC_PLUGIN_ROOT` into `additionalContext` for main conversation
  - `pre-task.mjs`: injects `BC_PLUGIN_ROOT` as first injection for ALL subagents
  - Enables skills to reference plugin files: `$BC_PLUGIN_ROOT/skills/text-optimize/references/...`

#### Updated Files

| File | Change |
|------|--------|
| `hooks/session-start.mjs` | `BC_PLUGIN_ROOT` in additionalContext |
| `hooks/pre-task.mjs` | `BC_PLUGIN_ROOT` injection for all agents |
| `docs/hooks.md` | "BC_PLUGIN_ROOT variable" section |
| `CLAUDE.md` | "Plugin Variables" section |

---

## [2.12.0] - 2026-02-11

### brewcode
#### Fixed

- **Skill frontmatter** -- removed invalid `context: session` from 5 skills
  - auto-sync, grepai, spec, plan, start -- now use inline mode (required for Task tool)

- **EXECUTE markers** -- added missing markers to bash blocks
  - auto-sync: 3 blocks in sync phase (Setup INDEX, discover.sh, index-ops.sh)
  - secrets-scan: Phase 1 setup block

- **STOP conditions** -- added after critical bash blocks
  - secrets-scan: `> **STOP if ERROR** -- must run in git repository`

- **text-optimize** -- fixed `subagent_type: "brewcode:text-optimizer"` -> `"text-optimizer"`

#### Added

- **spec/references/SPEC-creation.md** -- parallel research instructions and consolidation rules (125 lines)
- **scripts/teardown.sh** -- restored plugin-level cleanup script

#### Changed

- **spec/SKILL.md** -- references updated to `references/SPEC-creation.md`
- **teardown** -- script moved from skill directory to `brewcode/scripts/`

#### Structure Improvements

| Skill | Before | After |
|-------|--------|-------|
| spec | 78% | 90% |
| auto-sync | 85% | 100% |
| secrets-scan | 71% | 97% |
| teardown | 60% | 90% |

---

## [2.10.0] - 2026-02-11

### brewcode
#### Added

- **Agent documentation enriched** -- 3 agents updated with official plugin-dev content

| Agent | New Sections | Examples |
|-------|--------------|----------|
| `agent-creator.md` | Agent Architect Process (6 steps), System Prompt Patterns (4 archetypes), Color Semantics, Triggering Examples Guide | code-reviewer, test-generator, doc-generator, security-analyzer |
| `skill-creator.md` | Official Six-Step Creation Process, Word Budget (1,500-2,000), Scripts Design guidance | commit, pr-review, codebase-qa, deploy |
| `hook-creator.md` | 10 Hook Patterns (Official), Advanced Techniques (Multi-Stage, State Sharing, Caching), Hook Type Selection, Lifecycle Note | Security Gate, Test Enforcement, Context Injection, Tool Logger |

#### Changed

- **skill-creator.md** -- Creation Process section rewritten to Official Six-Step format
  - Step 2: Plan Reusable Contents (scripts, reference docs, assets)
  - Step 5: Validate and Test with detailed checklist
  - Word budget: 1,500-2,000 words target

#### Sources

- `claude-plugins-official/plugins/plugin-dev/skills/agent-development/`
- `claude-plugins-official/plugins/plugin-dev/skills/skill-development/`
- `claude-plugins-official/plugins/plugin-dev/skills/hook-development/`

---

## [2.9.5] - 2026-02-11

### brewcode
#### Fixed

- **setup SKILL.md Phase 5** -- explicit instructions to use script output verbatim
  - Added CRITICAL warning: DO NOT add agents manually
  - Step 1: clarified output is ready-to-insert content
  - Step 4: must read `/tmp/agents-section.md` and use EXACT content
  - Prevents LLM from ignoring script output and adding internal agents

---

## [2.9.4] - 2026-02-11

### brewcode
#### Changed

- **setup.sh `agents` mode** -- excludes internal plugin agents from listing
  - Internal agents (bc-coordinator, bc-grepai-configurator, bc-knowledge-manager) not shown
  - These agents are only called by the plugin itself, not by users

#### Updated Files

- `skills/setup/scripts/setup.sh` -- INTERNAL_AGENTS filter added

---

## [2.9.2] - 2026-02-11

### brewcode
#### Added

- **setup.sh `agents` mode** -- collects agents for CLAUDE.md update
  - Outputs LLM-optimized table with 3 columns: Name, Scope, Purpose
  - Collects: system agents (hardcoded), global (~/.claude/agents/), plugin (PLUGIN_ROOT/agents/)
  - Purpose truncated to 5 words for token efficiency
- **SKILL.md Phase 5** -- Update Global CLAUDE.md Agents
  - Collects agents via `setup.sh agents`
  - LLM analyzes existing CLAUDE.md to find agent sections
  - User confirmation before replacement
  - Edit-based replacement preserves non-agent content

#### Updated Files

| File | Change |
|------|--------|
| `skills/setup/scripts/setup.sh` | Added `collect_agents()` function, `agents` mode |
| `skills/setup/SKILL.md` | Added Phase 5 with 4 steps |

---

## [2.9.1] - 2026-02-10

### brewcode
#### Fixed

- **hooks.md** -- synchronized handoff entry type documentation
  - `writeHandoffEntry()` uses `"t":"check"` for priority during compactification
  - Documentation incorrectly stated `"t":"info"`

---

## [2.9.0] - 2026-02-10

### brewcode
#### Added

- **bc-rules-organizer agent** -- plugin agent for rules organization
  - Moved from global `~/.claude/agents/rules-organizer.md` to plugin `agents/bc-rules-organizer.md`
  - Added `Bash` tool, `permissionMode: acceptEdits`
  - Aligned table formats with rules skill: `| # | Avoid | Instead | Why |`, `| # | Practice | Context | Source |`
  - Numbered entries, max 20 rows, semantic deduplication, specialized `{prefix}-*.md` files

#### Changed

- **Rules skill -> delegator** -- skill delegates all work to `bc-rules-organizer` agent
  - Removed `context: session` (inline, can spawn agents via Task)
  - `allowed-tools`: `Read, Write, Edit, Glob, Grep, Bash` -> `Read, Bash, Task`
  - Skill handles: mode detection, knowledge preparation, agent spawn
  - Agent handles: extraction, optimization, file creation, validation
- **Removed `rules-organizer` from global agents** -- no longer in system agents list
  - Updated `hooks/lib/utils.mjs`, `templates/brewcode.config.json.template`, `docs/hooks.md`

#### Updated Files

| File | Change |
|------|--------|
| `agents/bc-rules-organizer.md` | NEW -- moved from global, `ft-` prefix, Bash tool |
| `skills/rules/SKILL.md` | Rewrite: thin delegator to bc-rules-organizer |
| `hooks/lib/utils.mjs` | Removed `rules-organizer` from system agents |
| `templates/brewcode.config.json.template` | Removed `rules-organizer` from agents |
| `docs/hooks.md` | Removed `rules-organizer` from default agents |

---

## [2.8.0] - 2026-02-10

### brewcode
#### Added

- **Rules skill enhanced** -- 4 modes for flexible rule management
  - `session` -- Extract from conversation context (default)
  - `file` -- Extract from KNOWLEDGE.jsonl file
  - `prompt` -- Targeted update with instruction (`/brewcode:rules <path> <prompt>`)
  - `list` -- Show all existing rule files
- **Specialized rule files** -- prefix-based rules for domain separation
  - Pattern: `{prefix}-avoid.md`, `{prefix}-best-practice.md`
  - Examples: `test-avoid.md`, `sql-best-practice.md`, `security-avoid.md`
  - Auto-created when prompt mode detects target domain

#### Changed

- **rules.sh** -- added `list_rules()` and `create_specialized()` functions
- **SKILL.md** -- updated `argument_hint: "[mode] [path] [prompt]"`, new mode detection table

#### Updated Files

| File | Change |
|------|--------|
| `skills/rules/SKILL.md` | 4 modes, specialized files docs, prompt mode logic |
| `skills/rules/scripts/rules.sh` | `list_rules()`, `create_specialized()`, updated validation |

---

## [2.7.2] - 2026-02-09

### brewcode
#### Fixed

- **Hook message routing** -- fixed `systemMessage` vs `additionalContext` across 4 hooks
  - `session-start.mjs`: added `systemMessage` with plugin path + session ID for user console
  - `grepai-session.mjs`: moved "USE grepai_search FIRST" from `systemMessage` to `additionalContext`
  - `pre-compact.mjs`: replaced `<ft-handoff>` XML block with short status in `systemMessage`
  - `stop.mjs`: split block `reason` (user) from `additionalContext` (Claude instructions)
- **docs/hooks.md** -- 16 discrepancies fixed via multi-agent verification
  - Removed undocumented session mapping feature (4 references)
  - Fixed post-task timeout: 30s -> 5s (matched hooks.json)
  - Fixed all post-task prompts: `systemMessage` -> `additionalContext`
  - Added PID-file detection for watch/mcp-serve (v2.7.0 feature)
  - Added grepai-reminder 60s throttle documentation
  - Updated role detection patterns (added qa, sdet, auditor, engineer, builder, fixer)
  - Removed `cat` field from KNOWLEDGE.jsonl format (removed in v2.7.0)
  - Fixed TASK.md -> PLAN.md in stop block message and lifecycle diagram

#### Updated Files

| File | Change |
|------|--------|
| `hooks/session-start.mjs` | Added `systemMessage` with plugin path |
| `hooks/grepai-session.mjs` | Reminder -> `additionalContext` |
| `hooks/pre-compact.mjs` | Short status instead of XML block |
| `hooks/stop.mjs` | Split reason/additionalContext |
| `docs/hooks.md` | 16 fixes across all sections |

---

## [2.7.1] - 2026-02-09

### brewcode
#### Fixed

- **Review skill `context: fork` -> `session`** -- review template had `context: fork` which prevents Task tool usage; review is built entirely on parallel agent spawning via Task tool, so `fork` made it non-functional
  - File: `templates/skills/review/SKILL.md.template`

---

## [2.7.0] - 2026-02-09

### brewcode
#### Added

- **docs/ directory** -- 4 comprehensive documentation files extracted from README.md
  - `commands.md`, `file-tree.md`, `flow.md`, `hooks.md` (~166KB total)
- **llm-text-rules.md** -- shared LLM text rules for auto-sync instructions (DRY)
- **HOOKS-REFERENCE.md** -- Claude Code hooks reference (`user/features/`)
- **Security hardening** -- path traversal protection, atomic lock/state writes, bind race detection
  - `validateTaskPath()`, `createLock()` with tmp+rename pattern
  - Lock schema validation with auto-cleanup of corrupted locks
- **Config recursion guard** -- prevents infinite loop in `loadConfig()` via `_loadingConfig` flag
- **Deep merge for nested config** -- `knowledge.validation`, `agents.system` properly merged
- **Grepai reminder throttling** -- max once per 60s via `.grepai/.reminder-ts`
- **PID-file-based process detection** -- `watch.pid`/`mcp-serve.pid` before pgrep fallback
- **Expanded status model** -- `cancelled`, `error` statuses in bc-coordinator; `handoff` at init
- **Handoff-after-compact context** -- session-start injects re-read instruction on compact source
- **Teardown confirmation** -- `AskUserQuestion` prompt for non-dry-run teardown
- **`<instructions>` tags** -- added to spec, plan, start SKILL.md for proper skill boundaries

#### Changed

- **README.md rewritten** -- 836 -> 101 lines; detailed docs moved to `docs/`
- **KNOWLEDGE.jsonl schema simplified** -- removed `cat` (category) and `scope` fields
- **MANIFEST.md eliminated** -- all references removed from coordinator, templates, hooks
- **Scope-aware retention removed** -- flat `maxEntries=100` replaces global:50/task:20 split
- **Compact threshold** -- 50% -> 80% of maxEntries
- **Hook output routing** -- multiple hooks switched to `hookSpecificOutput.additionalContext`
- **SessionStart hooks split** -- session-start.mjs and grepai-session.mjs run independently
- **Phase detection improved** -- h2/h3 support, excludes verification phases, checkbox counting
- **Constraint injection expanded** -- ALL constraints for every non-system agent; expanded role regex
- **Shell script hardening** -- `set -euo pipefail`, `command -v` replacing `which`, curl timeouts
- **bc-coordinator** -- simplified status updates, removed MANIFEST, `cat` field removed
- **bc-knowledge-manager** -- removed scope/categories, dedup key 100 chars, maxEntries 100
- **Config simplified** -- removed `autoCompactThreshold`, `retention`, `stop.maxAttempts`
- **PLAN.md.template** -- simplified metadata, added `r` (R&D) iteration type, removed MANIFEST
- **SPEC.md.template** -- added Scope section, simplified headers
- **Rule templates** -- removed `description:` from YAML frontmatter
- **package.json** -- version synced to 2.7.0, author name corrected
- **install.sh** -- `|| true` for version extractions, `mktemp` for temp files

#### Fixed

- **Config recursion infinite loop** -- `log -> shouldLog -> getLogLevel -> loadConfig -> log`
- **Config cache never populated** -- `cachedConfigCwd` placed after unreachable validation
- **Shallow config merge** -- nested keys (`knowledge.validation`, `agents.system`) lost
- **Lock bind race condition** -- atomic tmp+rename with ownership verification
- **State file corruption** -- `saveState()` now uses atomic writes
- **Path traversal in TASK.md** -- rejects `..`, anchors regex
- **stop.mjs crash** -- `typeof` guard on `session_id`, error handler cleans lock
- **stop.mjs references TASK.md** -- corrected to PLAN.md
- **pre-compact null task** -- added null check for `parseTask()` return
- **install.sh pipeline failures** -- `|| true` prevents silent exits under `set -euo pipefail`
- **grepai index error swallowed** -- now reports "error" and logs warning

#### Removed

- **`templates/hooks/grepai-session.mjs.template`** -- built-in hook replaces template
- **`templates/reports/MANIFEST.md.template`** -- MANIFEST concept removed
- **`templates/review-report.md.template`** -- review reporting simplified
- **6 exported functions** -- `extractStatus`, `findCurrentPhase`, `writeSessionInfo`, `getTaskDirFromSession`, `classifyScope`, `appendKnowledgeValidated`
- **`cat`/`scope` fields** from KNOWLEDGE.jsonl schema
- **Config keys** -- `autoCompactThreshold`, `retention`, `stop.maxAttempts`, `removeOrphansAfterDays`
- **`.claude/tasks/specs/` directory** creation in setup.sh

#### Breaking Changes

- KNOWLEDGE.jsonl: `cat` and `scope` fields no longer written (existing entries tolerated)
- MANIFEST.md no longer created/maintained
- 6 functions removed from public API (validateEntry, classifyScope, etc.)
- `getReportsDir()` signature: `cwd` parameter removed

---

## [2.6.0] - 2026-02-08

### brewcode
#### Added

- **2-stage creation flow** -- `spec` -> `plan` (replaces monolithic `create`)
  - `/brewcode:spec` -- Creates SPEC through research + AskUserQuestion interaction
  - `/brewcode:plan` -- Creates PLAN from SPEC or Plan Mode file with user approval
  - `/brewcode:create` -- **Removed** (use `spec` + `plan` separately)
- **User interaction during creation** -- AskUserQuestion for clarifying scope, validating decisions
- **Task directory structure** -- All task files grouped in `{TS}_{NAME}_task/` directory
- **Session mapping** -- `sessions/{session_id}.info` for O(1) task lookup
- **Per-task lock** -- `.lock` inside task directory (was global `cfg/.brewcode.lock`)

#### Breaking Changes

- Task files moved from flat `.claude/tasks/` to `.claude/tasks/{TS}_{NAME}_task/`
- `TASK.md` renamed to `PLAN.md`
- SPEC moved from `specs/` to task directory
- `KNOWLEDGE.jsonl` moved to task directory
- Reports directory renamed to `artifacts/` inside task directory
- Phase directory naming: `phase_{P}/iter_{N}_{type}/` -> `{P}-{N}{T}/`
- `TASK.md.template` renamed to `PLAN.md.template`

#### Updated Files

| File | Change |
|------|--------|
| `skills/spec/SKILL.md` | NEW -- spec creation skill (7-step workflow) |
| `skills/plan/SKILL.md` | NEW -- plan creation skill (dual input: SPEC/Plan Mode) |
| `skills/create/` | **Removed** (replaced by spec + plan) |
| `templates/PLAN.md.template` | NEW -- renamed from TASK.md.template |
| `templates/SPEC.md.template` | Rewrite: analytical format (91 -> 42 lines) |
| `templates/SPEC-creation.md` | Updated paths and section names |
| `hooks/lib/utils.mjs` | Major refactor: 5 new functions, per-task lock |
| `hooks/pre-compact.mjs` | Compact phase dirs, artifacts/ |
| `hooks/stop.mjs` | Per-task lock path |
| `hooks/session-start.mjs` | Session mapping |
| `hooks/pre-task.mjs` | Absolute path fix for knowledge |
| `agents/bc-coordinator.md` | Artifacts paths, PLAN.md refs |
| `agents/bd-auto-sync-processor.md` | Artifacts path |
| `templates/reports/MANIFEST.md.template` | **Removed** |
| `templates/reports/FINAL.md.template` | Artifacts index |
| `templates/instructions-template.md` | Full path migration |
| `templates/rules/post-agent-protocol.md.template` | Path glob fix |
| `skills/start/SKILL.md` | PLAN.md, artifacts paths |
| `skills/setup/SKILL.md` | PLAN.md.template refs |
| `skills/setup/scripts/setup.sh` | PLAN.md.template sync |
| `skills/teardown/SKILL.md` | Task dir structure |
| `skills/teardown/teardown.sh` | Task dir references |
| `README.md` | Full path migration (20+ refs) |

#### Migration

Existing tasks are not automatically migrated. New tasks use the new structure.
Run `/brewcode:setup` to update adapted templates.

---

## [2.5.0] - 2026-02-08

### brewcode
#### Changed

- **Auto-sync INDEX v2** -- simplified from 8 fields to 4 (`p`, `t`, `u`, `pr`)
  - Removed: `m` (mtime), `h` (hash), `v` (version), `s` (status)
  - Dates: ISO8601 -> `YYYY-MM-DD`
  - Protocol values: `default`/`custom` -> `default`/`override`
  - New type: `config` (for `CLAUDE.md` files)
- **Auto-sync instructions system** -- type-specific sync instructions
  - New: `instructions/sync-{skill,agent,doc,rule,config}.md` -- per-type verification checklists and research directions
  - Processor loads instructions dynamically instead of hardcoded logic
  - `<auto-sync-protocol>` -> `<auto-sync-override>` with 3 fields: `sources`, `focus`, `preserve`
- **Auto-sync SKILL.md rewrite** -- simplified phases, added `-o`/`--optimize` flag
  - `context: fork` -> `context: session` (access to conversation context)
  - Added `Skill` to allowed-tools
  - INIT mode simplified (no custom protocol prompt generation)
- **bd-auto-sync-processor rewrite** -- 364 -> 135 lines (-63%)
  - Removed `Task` tool dependency -- direct Glob/Grep/Read/WebFetch calls
  - Loads per-type instruction files for verification checklist
  - Model: opus -> sonnet
- **bc-coordinator: inline compaction** -- removed `Task` tool from agent tools
  - Auto-compact now inline: read -> dedupe -> sort -> trim -> write
  - No longer spawns bc-knowledge-manager for compaction
- **bc-grepai-configurator: direct tool calls** -- removed `Task` tool dependency
  - Phase 2: Explore agents -> direct Glob/Grep/Read calls
- **Skills context: `fork` -> `session`** -- auto-sync, create, grepai skills now run in session context
- **detect-mode.sh: FLAGS support** -- 3-field output `MODE|ARG|FLAGS`, `-o`/`--optimize` flag
- **index-ops.sh simplified** -- removed `query`, `hash`, `mtime` commands; added `threshold_date` helper; macOS/Linux date compatibility
- **Review skill: Critic mode** -- new `-c`/`--critic` flag for Devil's Advocate phase
  - Phase 5.5 Critic + Phase 5.75 DoubleCheck Critic
  - P0 priority for verified critic findings
  - Auto-enable via keywords: critic
  - Visual ASCII workflow diagrams in README

#### Added

- `skills/auto-sync/instructions/` -- 5 type-specific instruction files
- `autoSync` config section -- `intervalDays`, `retention`, `optimize`, `parallelAgents`
- Validation for `autoSync` numeric fields in `utils.mjs`

#### Fixed

- **Agent name typo** -- `prompt-optimizer` -> `text-optimizer` in config and hooks
- **Removed stale PROTOCOL_REMINDER** -- pre-agent priming string removed from `pre-task.mjs`

#### Removed

- `skills/auto-sync/references/doc-types.md` (replaced by instructions/)
- `skills/auto-sync/references/protocol-default.md` (replaced by instructions/)
- `user/CLAUDE-CODE-RELEASES-2025-2026.md`
- `user/CLAUDE-CODE-TASK-MANAGER-GUIDE.md`
- `user/CONTEXT-INJECTION-GUIDE.md`

#### Updated Files

| File | Change |
|------|--------|
| `skills/auto-sync/SKILL.md` | Rewrite: simplified phases, `-o` flag, `context: session` |
| `skills/auto-sync/README.md` | Updated to match new INDEX format and override block |
| `skills/auto-sync/scripts/detect-mode.sh` | 3-field output with FLAGS |
| `skills/auto-sync/scripts/discover.sh` | Updated type detection |
| `skills/auto-sync/scripts/index-ops.sh` | Simplified commands, date compat |
| `agents/bd-auto-sync-processor.md` | Rewrite: direct tools, instruction loading |
| `agents/bc-coordinator.md` | Inline compaction, removed Task tool |
| `agents/bc-grepai-configurator.md` | Direct tool calls, removed Task tool |
| `hooks/lib/utils.mjs` | `autoSync` config, agent name fix |
| `hooks/pre-task.mjs` | Removed PROTOCOL_REMINDER |
| `skills/create/SKILL.md` | `context: fork` -> `session` |
| `skills/grepai/SKILL.md` | `context: fork` -> `session` |
| `templates/auto-sync/INDEX.jsonl.template` | 4-field format |
| `templates/brewcode.config.json.template` | `autoSync` section |
| `templates/skills/review/SKILL.md.template` | Critic phase, argument-hint |
| `templates/skills/review/references/agent-prompt.md` | Critic prompt |
| `templates/skills/review/references/report-template.md` | P0 priority section |
| `README.md` | Critic mode docs, workflow diagrams |

---

## [2.4.1] - 2026-02-06

### brewcode
#### Fixed
- **C1: Role detection false positive** -- `name.includes('arch')` -> `name.includes('architect')` in `pre-task.mjs`
  - "search", "research", "archive" no longer misclassified as DEV role
- **C2: INIT casing bug** -- sed now strips first word unconditionally (was `[Ii]nit` only)
  - `INIT path.md` and `iNiT path.md` now correctly output `INIT|path.md`
- **H1: Stale `/brewcode:doc` in CLAUDE.md** -- replaced with `/brewcode:auto-sync`
- **H2: Phantom `sync` mode in description** -- replaced with actual 6 modes
- **M1: Bare `init` error** -- `detect-mode.sh` now exits with error for `init` without path
- **M2: Phase ordering** -- STATUS/INIT phases moved before Phase 1 Setup in SKILL.md
- **M3: Agent count** -- README.md updated to 4 agents (added bd-auto-sync-processor)
- **M4: Historical accuracy** -- [2.3.0] modes list shows original values with note
- **M5: `ARGS_HERE` placeholder** -- replaced with `$ARGUMENTS` in SKILL.md
- **L1: Dead code** -- collapsed identical if/else FILE detection branches
- **L2: discover.sh JSON bug** -- replaced pipe subshell with sed (comma separator fix)
- **L3: Invalid hex hash** -- `d4e5f6g7` -> `d4e5f607` in INDEX.jsonl.template
- **L4: Related docs** -- added auto-sync skill and bd-auto-sync-processor agent links

---

## [2.4.0] - 2026-02-06

### brewcode
#### Changed
- **Auto-sync modes** -- removed CREATE mode, added STATUS + INIT
  - Removed: `create skill`, `create agent`, `create doc` modes
  - Added: `status` -- diagnostic report of INDEX state + non-indexed files
  - Added: `init <path> [prompt]` -- add auto-sync tag + custom protocol to existing document
  - INIT supports LLM-optimized `<auto-sync-protocol>` block generation
  - Phases renumbered: 6 -> 5 (CREATE phase removed)
  - Modes: `status`, `init`, `global`, `project` (default), `file`, `folder`

#### Updated Files

| File | Change |
|------|--------|
| `skills/auto-sync/SKILL.md` | Removed Phase 2 CREATE, added STATUS + INIT phases, renumbered |
| `skills/auto-sync/scripts/detect-mode.sh` | Removed CREATE detection, added STATUS + INIT |
| `skills/auto-sync/README.md` | Updated docs, flow diagram, phase numbering |
| `README.md` | Updated auto-sync description and mode table |
| `RELEASE-NOTES.md` | Updated modes list |

---

## [2.3.1] - 2026-02-05

### brewcode
#### Changed
- **Auto-tagging** -- `/brewcode:auto-sync` adds `auto-sync: enabled` to .md files
  - PROJECT/FOLDER/GLOBAL modes find ALL .md files and tag them
  - SKILL.md/agent.md -> YAML frontmatter
  - Other .md -> `<!-- auto-sync:enabled -->` after title
  - No manual migration required

---

## [2.3.0] - 2026-02-05

### brewcode
#### Features
- **KILLER FEATURE**: `/brewcode:auto-sync` - Universal documentation system
  - Replaces `/brewcode:doc`
  - Modes (v2.3.0): `create skill|agent|doc`, `sync`, `global`, `project`, `path` (CREATE removed in 2.4.0)
  - LLM-optimized JSONL INDEX for tracking documents
  - Auto-detects document types (skill, agent, doc, rule)
  - Parallel processing with `bd-auto-sync-processor` agent
  - Custom protocols via `<auto-sync-protocol>` block
  - Stale detection (7 days threshold)

#### Added
- `bd-auto-sync-processor` agent for document processing
- INDEX.jsonl.template for tracking synced documents
- Scripts: `discover.sh`, `index-ops.sh`, `detect-mode.sh`
- References: `protocol-default.md`, `doc-types.md`

#### Removed
- `/brewcode:doc` skill (replaced by `/brewcode:auto-sync`)

#### Migration
If you were using `/brewcode:doc`, use `/brewcode:auto-sync` instead:
- `/brewcode:doc update` -> `/brewcode:auto-sync`
- `/brewcode:doc sync` -> `/brewcode:auto-sync`

---

## v2.2.0 (2026-02-04)

### brewcode
#### Added

- **Role-based constraint injection** -- auto-injection of constraints into agent prompts
  - New tags in TASK.md: `<!-- ALL -->`, `<!-- DEV -->`, `<!-- TEST -->`, `<!-- REVIEW -->`
  - `pre-task.mjs`: role detection by agent name (developer->DEV, tester->TEST, reviewer->REVIEW)
  - Constraints injected at prompt start before execution

- **Knowledge validation** -- filter useless entries
  - Blocklist: "Working on...", "Let me...", "Looks good", "Phase N", etc.
  - Min 15 chars, technical density check
  - `validateEntry()`, `appendKnowledge()` (with validation)

- **Scope-aware retention** -- separate global/task storage
  - Auto-classification: avoids->global, handoff->task, arch/config/api->global
  - Compaction retains: global:50, task:20 entries

#### Changed

| File | Change |
|------|--------|
| `TASK.md.template` | Added Role Constraints section with examples |
| `brewcode.config.json.template` | `knowledge.validation`: enabled, blocklist, densityCheck; `knowledge.retention`: global:50, task:20; `constraints.enabled`: true |

#### Updated Files

| File | Change |
|------|--------|
| `hooks/pre-task.mjs` | Role detection, constraint injection |
| `hooks/lib/knowledge.mjs` | validateEntry, appendKnowledge, localCompact |
| `templates/TASK.md.template` | Role Constraints section |
| `templates/brewcode.config.json.template` | validation, retention, constraints |
| `agents/bc-coordinator.md` | Updated for constraints |
| `agents/bc-knowledge-manager.md` | Scope documentation |

---

## v2.1.2 (2026-02-02)

### brewcode
#### Changed

- **Review skill consolidation** -- removed duplicate, kept only template
  - Removed: `skills/review/` (static version)
  - Kept: `templates/skills/review/SKILL.md.template` (generated)
  - Added: `templates/skills/review/references/` (agent-prompt.md, report-template.md)
  - Updated: SKILL.md.template (+quorum algorithm, matching/merge rules, DoubleCheck prompt, error handling)
  - Updated: setup.sh (copies references/)
  - Updated: README.md (link to template)

---

## v2.1.1 (2026-02-01)

### brewcode
#### Fixed

- **Agent triggers YAML** -- replaced `Trigger:` with `Triggers -` in agent descriptions
  - bc-coordinator.md, bc-knowledge-manager.md
  - Colon in value broke YAML parsing

---

## v2.1.0 (2026-02-01)

### brewcode
#### Changed

- **Documentation sync** -- major documentation update
  - README.md: PostToolUse hook, NEXT ACTION protocol, hook matrix (7 hooks)
  - CLAUDE.md: hook documentation, skill namespacing table
  - grepai.md: line refs, timeout info
  - user/coordinator.md: complete rewrite with NEXT ACTION

- **Template namespacing** -- skill names in templates
  - `templates/skills/review/SKILL.md.template`: `brewcode:review`
  - `templates/review-report.md.template`: `brewcode:review`

- **Protocol terminology** -- unified `WRITE report -> CALL bc-coordinator`

#### Updated Files

| File | Change |
|------|--------|
| `README.md` | PostToolUse, NEXT ACTION, hook matrix |
| `grepai.md` | line refs `:24`, timeout `(1s)` |
| `templates/skills/review/SKILL.md.template` | `name: brewcode:review` |
| `templates/review-report.md.template` | `brewcode:review` footer |
| `skills/review/references/report-template.md` | `brewcode:review` |
| `CLAUDE.md` (root) | 7 hooks documentation |

---

## v2.0.73 (2026-02-01)

### brewcode
#### Changed

- **Skill namespacing** -- added remaining skills
  - `create` -> `brewcode:create`
  - `doc` -> `brewcode:doc`

#### Updated Files

| File | Change |
|------|--------|
| `skills/create/SKILL.md` | name: `brewcode:create` |
| `skills/doc/SKILL.md` | name: `brewcode:doc` |

---

## v2.0.72 (2026-02-01)

### brewcode
#### Changed

- **Skill namespacing** -- unified skill names with namespace `brewcode:`
  - `review` -> `brewcode:review`
  - `rules` -> `brewcode:rules`
  - `start` -> `brewcode:start`
- **Skill descriptions** -- formatting
  - Removed colons after "Triggers" in all skills
  - Simplified argument-hint for `doc` and `rules`

#### Updated Files

| File | Change |
|------|--------|
| `skills/review/SKILL.md` | name: `brewcode:review` |
| `skills/rules/SKILL.md` | name: `brewcode:rules`, argument-hint |
| `skills/start/SKILL.md` | name: `brewcode:start` |
| `skills/create/SKILL.md` | triggers formatting |
| `skills/doc/SKILL.md` | triggers formatting, argument-hint |

---

## v2.0.71 (2026-02-01)

### brewcode
#### Fixed

- **Skill argument hints** -- improved argument hints
  - `doc`: description lists modes `Modes - create, update, analyze, sync, all`
  - `doc`: argument-hint simplified to `[create|update|analyze|sync] <path>`
  - `rules`: argument-hint shows session mode `[<path>] (empty = session mode)`

#### Updated Files

| File | Change |
|------|--------|
| `skills/doc/SKILL.md` | description + argument-hint |
| `skills/rules/SKILL.md` | argument-hint |

---

## v2.0.68 (2026-02-01)

### brewcode
#### Fixed

- **skills/install/SKILL.md** -- Output Rules for correct display
  - Added Output Rules section: show FULL output, preserve tables
  - Each phase has `-> Show:` and `-> Explain:` hints
  - Phase 5 skipped if grepai already installed

---

## v2.0.67 (2026-02-01)

### brewcode
#### Fixed

- **Plugin installation** -- version bump to apply pending changes from v2.0.66

---

## v2.0.66 (2026-02-01)

### brewcode
#### Changed

- **skills/install/SKILL.md** -- token optimization (-42%)
  - Added triggers: "install brewcode", "setup prerequisites"
  - Replaced verbose JSON with compact tables
- **skills/install/scripts/install.sh** -- improved summary
  - New format: `| Component | Status | Installed | Latest |`
  - Shows installed AND latest available version
  - Logs performed actions (Actions Performed)
  - Helper functions: `log_action()`, `clear_actions()`

#### Removed

- **skills/install/scripts/** -- removed 8 duplicate scripts (all in install.sh)

---

## v2.0.65 (2026-02-01)

### brewcode
#### Added

- **skills/install** -- new interactive plugin installer
  - Single script `install.sh` with parameters (state, required, grepai, etc.)
  - AskUserQuestion for optional components (ollama, grepai)
  - Required timeout symlink with confirmation
  - Helper functions: `ollama_running()`, `wait_for_ollama()`, `get_grepai_versions()`

#### Fixed

| File | Fix |
|------|-----|
| `grepai/upgrade.sh` | `grepai --version` -> `grepai version` |
| `grepai/infra-check.sh` | `grepai --version` -> `grepai version` |
| `bc-grepai-configurator.md` | `grepai --version` -> `grepai version` |

- **install.sh** -- security & reliability fixes:
  - curl with `--connect-timeout 2 --max-time 5`
  - `NONINTERACTIVE=1` for Homebrew
  - Retry loop for ollama start (10 attempts)
  - Guard for `ollama list` (check `command -v ollama`)
  - Symlink safety check (do not overwrite regular files)
  - Version fallback `${VER:-unknown}`

#### Changed

- **grepai skill** -- removed `install` mode, now separate skill `/install`
- **detect-mode.sh** -- removed `install` mode from grepai

---

## v2.0.64 (2026-02-01)

### brewcode
#### Fixed

- **grepai-reminder.mjs** -- added async/stdin pattern
  - Reads `input.cwd` from stdin instead of `process.cwd()`
  - Added try/catch with `output({})` on errors
  - Consistency with other hooks (grepai-session, pre-task)

- **grepai-session.mjs** -- added MCP server check
  - New function `checkMcpServer()` checks `grepai mcp-serve`
  - `additionalContext` injected only if MCP server available
  - Prevents useless grepai_search calls

- **mcp-check.sh** -- 4 security/reliability fixes
  - `mkdir -p` before creating settings.json
  - `trap 'rm -f "$TMP_FILE"' EXIT` for temp file cleanup
  - Path injection fix: path via `os.environ['SETTINGS_FILE']`
  - JSON validation after each write

- **create-rule.sh** -- fallback frontmatter fix
  - `globs:` -> `paths:` (Claude Code format)
  - Removed `alwaysApply:` (Cursor-only field)

- **grepai.md** -- documentation frontmatter fix
  - 3 places: `globs:` -> `paths:`, `alwaysApply:` -> removed

- **SKILL.md** -- simplified ARGS instruction
  - Removed confusing `ARGS_HERE` placeholder
  - Direct use of `$ARGUMENTS`

#### Changed

- **All 12 grepai scripts** -- added `set -euo pipefail`
  - detect-mode.sh, infra-check.sh, init-index.sh, start.sh, stop.sh
  - reindex.sh, optimize.sh, upgrade.sh, status.sh, verify.sh
  - create-rule.sh, mcp-check.sh

---

## v2.0.63 (2026-02-01)

### brewcode
#### Changed

- **pre-task.mjs** -- removed `systemMessage` from UI
  - grepai reminder and knowledge injection in agent prompts works as before
  - Logging to `brewcode.log` preserved
  - UI no longer shows "brewcode: grepai: injected"

---

## v2.0.62 (2026-02-01)

### brewcode
#### Changed

- **create-rule.sh** -- grepai rule always rewritten from template
  - Removed file existence check
  - Each `/brewcode:grepai setup` updates rule to current version

---

## v2.0.61 (2026-02-01)

### brewcode
#### Fixed

- **pre-task.mjs** -- grepai reminder injected for ALL agents
  - Previously Explore, Plan, Bash, etc. were in system agents list -> skipped
  - Now: grepai reminder -> ALL agents, knowledge injection -> only non-system
  - Fixed syntax (unclosed if block)

---

## v2.0.60 (2026-02-01)

### brewcode
#### Fixed

- **pre-task.mjs** -- critical JSON structure fix
  - `updatedInput` moved inside `hookSpecificOutput` (per docs)
  - Added `permissionDecision: 'allow'` to apply changes
  - Without this fix, injection into agent prompts did NOT work

---

## v2.0.59 (2026-02-01)

### brewcode
#### Fixed

- **Hooks use correct fields** -- fixed per Claude Code docs
  - `systemMessage` -> shown to user
  - `additionalContext` -> goes to Claude context
  - For agents: reminder injected in `updatedInput.prompt`
- **grepai-session.mjs** -- `hookSpecificOutput.additionalContext` for SessionStart
- **grepai-reminder.mjs** -- `hookSpecificOutput.additionalContext` for PreToolUse Glob/Grep
- **pre-task.mjs** -- reminder in agent prompt (not in parent's additionalContext)

---

## v2.0.58 (2026-02-01)

### brewcode
#### Changed

- **grepai reminder everywhere** -- single imperative message
  - `grepai: USE grepai_search FIRST for code exploration`
- **grepai-session.mjs** -- reminder at session start (when grepai ready)
- **pre-task.mjs** -- reminder for ALL agents (Explore, developer, etc.)
- **grepai-reminder.mjs** -- strengthened: `consider` -> `USE FIRST`
- **create-rule.sh** -- adds Code Search section to project CLAUDE.md

---

## v2.0.57 (2026-02-01)

### brewcode
#### Changed

- **grepai-reminder.mjs** -- systemMessage instead of console.log
  - Claude now sees reminder in context
  - Message: `grepai MCP available -- consider FIRST!`

---

## v2.0.56 (2026-02-01)

### brewcode
#### Changed

- **mcp-check.sh** -- automatic `allowedTools` setup for grepai
  - Adds `mcp__grepai__*` to `~/.claude/settings.json`
  - Removes `[destructive]` prompts for read-only tools
- **grepai-first.md.template** -- shortened and improved
  - Removed duplication with MCP descriptions
  - Added inline call->response examples
  - Reference to MCP: "Params -> MCP descriptions"
- **status.sh, verify.sh** -- show Permissions status

#### Updated Files

| File | Change |
|------|--------|
| `skills/grepai/scripts/mcp-check.sh` | allowedTools auto-config |
| `skills/grepai/scripts/status.sh` | Permissions status |
| `skills/grepai/scripts/verify.sh` | Permissions check |
| `skills/grepai/SKILL.md` | Phase 2 docs |
| `templates/rules/grepai-first.md.template` | inline examples, no MCP duplication |

---

## v2.0.55 (2026-01-31)

### brewcode
#### Changed

- **setup.sh** -- `grepai-first.md` synced on every setup
  - Uses `sync_template` (updates if changed)
  - No manual deletion needed for updates

#### Updated Files

| File | Change |
|------|--------|
| `skills/setup/scripts/setup.sh` | sync grepai-first.md on setup |

---

## v2.0.54 (2026-01-31)

### brewcode
#### Changed

- **grepai-first.md.template** -- complete rewrite
  - Tools table with params `limit?`, `compact?`
  - `<examples>` with JSON responses for search/callers/graph
  - Table `limit + compact` -> response -> workflow
  - Removed obvious content (Grep/Glob -- Claude knows)

#### Updated Files

| File | Change |
|------|--------|
| `templates/rules/grepai-first.md.template` | search types, compact mode, examples |

---

## v2.0.53 (2026-01-31)

### brewcode
#### Added

- **grepai-reminder hook** -- PreToolUse hook for Glob/Grep tools
  - Reminds Claude to prefer `grepai_search` when `.grepai/` exists
  - Debug logging via `log()` utility
  - Non-blocking (exit 0), soft reminder only

#### Updated Files

| File | Change |
|------|--------|
| `hooks/grepai-reminder.mjs` | New hook script |
| `hooks/hooks.json` | Added PreToolUse matcher for `Glob\|Grep` |

---

## v2.0.52 (2026-01-31)

### brewcode
#### Fixed

- **grepai indexing uses `grepai watch`** -- `grepai init` does NOT build index, only creates config
  - `reindex.sh`: complete rewrite -- uses `grepai watch`, polls for "Initial scan complete"
  - `init-index.sh`: rewritten -- uses `grepai watch`, skips if index exists
  - Added .grepai directory validation to init-index.sh
  - Dynamic timeouts based on file count (2 min to 60 min)

#### Changed

- **Log paths** -- all scripts use `.grepai/logs/grepai-watch.log`
- **Documentation** -- updated SKILL.md and bc-grepai-configurator.md with correct `grepai watch` references

#### Updated Files

| File | Change |
|------|--------|
| `skills/grepai/scripts/reindex.sh` | Complete rewrite for `grepai watch` |
| `skills/grepai/scripts/init-index.sh` | Rewritten with validation |
| `skills/grepai/SKILL.md` | Updated log paths, watch references |
| `agents/bc-grepai-configurator.md` | Updated Phase 5, troubleshooting |

---

## v2.0.51 (2026-01-31)

### brewcode
#### Fixed

- **reindex.sh index.gob wait** -- wait up to 30s for index.gob after watch starts
  - Fixes race condition where "index.gob missing" shown before watch creates it
  - Shows progress: "Waiting for index.gob (watch is building)..."

---

## v2.0.50 (2026-01-31)

### brewcode
#### Fixed

- **grepai indexing synchronous** -- scripts wait for `grepai init` to complete before starting watch
  - `init-index.sh`: runs init synchronously with `tee` to log, then starts watch
  - `reindex.sh`: same fix -- waits for init, logs to `.grepai/logs/grepai-init.log`
  - `SKILL.md`: updated warnings to reflect synchronous behavior
  - `bc-grepai-configurator.md`: updated Phase 5 indexing notes

#### Changed

- **Log output** -- init progress goes to `.grepai/logs/grepai-init.log` with timestamps
- **Duration tracking** -- scripts show actual indexing time on completion

#### Updated Files

| File | Change |
|------|--------|
| `skills/grepai/scripts/init-index.sh` | Synchronous init with logging |
| `skills/grepai/scripts/reindex.sh` | Synchronous init with logging |
| `skills/grepai/SKILL.md` | Updated async->sync warnings |
| `agents/bc-grepai-configurator.md` | Updated Phase 5 notes |

---

## v2.0.49 (2026-01-31)

### brewcode
#### Added

- **grepai gitignore docs** -- documented gitignore behavior and limitations
  - `bc-grepai-configurator.md`: new "## gitignore Behavior" section
  - Explains 3 layers: global gitignore -> local -> config.yaml `ignore:`
  - Workarounds table, diagnostic commands
  - Updated Phase 2 agent #5 to check global gitignore

- **grepai indexing time estimates** -- scripts show file count and ETA
  - `init-index.sh`: counts files, shows ETA, background indexing notice
  - `reindex.sh`: same improvements
  - `status.sh`: shows "indexing in progress" from log activity
  - `SKILL.md`: warnings after Phase 4 and reindex mode
  - `bc-grepai-configurator.md`: indexing time table in Phase 5

#### Changed

- **grepai-first.md** -- added Limitations section (gitignore behavior)
- **CLAUDE.md** -- added "### Limitations (gitignore)" in grepai section

#### Updated Files

| File | Change |
|------|--------|
| `agents/bc-grepai-configurator.md` | gitignore docs, indexing time table |
| `skills/grepai/SKILL.md` | async indexing warnings |
| `skills/grepai/scripts/init-index.sh` | file count, ETA, progress commands |
| `skills/grepai/scripts/reindex.sh` | file count, ETA, progress commands |
| `skills/grepai/scripts/status.sh` | indexing progress detection |
| `.claude/rules/grepai-first.md` | gitignore limitations |
| `CLAUDE.md` | gitignore limitations |

---

## v2.0.47 (2026-01-31)

### brewcode
#### Removed

- **Symlinks** -- removed all symlink-related functionality
  - Claude Code fixed plugin skill display ([#18949](https://github.com/anthropics/claude-code/issues/18949))
  - Removed Phase 5 (Enable Autocomplete) from `/brewcode:setup`
  - Removed `link` mode from setup skill
  - Removed symlink creation from `setup.sh`
  - Removed symlink removal from `/brewcode:teardown`

#### Changed

- **Skill triggers** -- updated to colon syntax
  - `/brewcode-*` -> `/brewcode:*` (plugin namespace)
  - `brewcode-review` directory remains for project-local skill

#### Updated Files

| File | Change |
|------|--------|
| `skills/setup/SKILL.md` | Removed Phase 5, link mode, symlink output |
| `skills/setup/scripts/setup.sh` | Removed `symlinks` mode and functions |
| `skills/teardown/SKILL.md` | Removed symlink mentions |
| `skills/teardown/teardown.sh` | Removed symlink removal loop |
| `skills/review/SKILL.md` | Updated trigger to `:review` |
| `skills/doc/SKILL.md` | Updated trigger to `:doc` |
| `agents/bc-coordinator.md` | Updated skill references |
| `templates/instructions-template.md` | Updated all skill references |
| `README.md` | Removed symlink references, updated examples |
| `CLAUDE.md` | Updated `/brewcode:setup` description |

---

## v2.0.46 (2026-01-31)

### brewcode
#### Fixed

- **status.sh** -- version detection for grepai CLI
  - Fixed: `grepai version` (subcommand) instead of `--version` (flag)
  - Fixed: macOS compatibility (removed `timeout` command)
  - Shows: `grepai: v0.25.0 (brew: v0.24.1)`

---

## v2.0.45 (2026-01-31)

### brewcode
#### Added

- **grepai skill** -- `upgrade` mode for CLI updates via Homebrew
  - `scripts/upgrade.sh` -- version check + brew upgrade
  - Keywords: upgrade, brew
- **status.sh** -- version comparison (current vs latest)
  - Shows `v0.23.0 (v0.24.0 available)` when outdated

#### Changed

- **bc-grepai-configurator** -- optimized for LLM (-32% tokens)
  - Fixed MCP paths (`~/.claude.json` instead of `~/.claude/mcp.json`)
  - Added `compact` param to `grepai_trace_graph`
  - Added MCP Integration phase (Phase 4)
- **grepai-first.md.template** -- improved clarity
  - Fixed `--compact` syntax (was `compact:true`)
  - Added WebSearch row to decision table
  - Removed unverified "3-7 words" guideline
- **grepai-session.mjs** -- Windows compatibility
  - Added platform check for `pgrep` (macOS/Linux only)
  - Documented limitation in header comment
- **SKILL.md** -- removed unused `Glob` from allowed-tools

#### Fixed

- **init-index.sh** -- added explicit `exit 0`
- **detect-mode.sh** -- added `(unrecognized text) -> prompt` to Mode Reference

#### Updated Files

| File | Change |
|------|--------|
| `agents/bc-grepai-configurator.md` | MCP paths, trace params, -32% tokens |
| `templates/rules/grepai-first.md.template` | --compact, WebSearch, clarity |
| `skills/grepai/SKILL.md` | upgrade mode, allowed-tools |
| `skills/grepai/scripts/upgrade.sh` | NEW -- brew upgrade |
| `skills/grepai/scripts/status.sh` | version comparison |
| `skills/grepai/scripts/detect-mode.sh` | upgrade keywords |
| `skills/grepai/scripts/init-index.sh` | exit 0 |
| `hooks/grepai-session.mjs` | Windows check |

---

## v2.0.44 (2026-01-30)

### brewcode
#### Added

- **bc-grepai-configurator** -- added "Supported File Extensions" section
  - Full list of 50+ extensions from [`indexer/scanner.go`](https://github.com/yoanbernabeu/grepai/blob/main/indexer/scanner.go)
  - Explicit `.mjs`/`.cjs`/`.mts`/`.cts` NOT supported warning
  - Auto-excluded files list (minified, bundles, binaries, >1MB)

#### Changed

- **bc-grepai-configurator** -- updated `.mjs` constraint with source link to scanner.go

#### Updated Files

| File | Change |
|------|--------|
| `agents/bc-grepai-configurator.md` | Added extensions table, source links |

---

## v2.0.43 (2026-01-30)

### brewcode
#### Added

- **Setup `link` mode** -- quick symlink refresh without full setup
  - Usage: `/brewcode:setup link`
  - Use after plugin update to refresh `~/.claude/skills/brewcode-*` symlinks
- **RELEASE-NOTES.md** -- changelog with format and protocol

#### Changed

- **CLAUDE.md** -- added requirement to update RELEASE-NOTES.md before plugin version bump

#### Updated Files

| File | Change |
|------|--------|
| `skills/setup/SKILL.md` | Added `link` mode with Mode Detection section |
| `RELEASE-NOTES.md` | New file |

---

## v2.0.42 (2026-01-30)

### brewcode
#### Fixed

- **Rules frontmatter documentation** -- corrected invalid fields
  - `globs` -> NOT supported (was incorrectly used)
  - `alwaysApply` -> NOT supported (Cursor field, not Claude Code)
  - `paths` -> Only valid field for conditional loading

#### Updated Files

| File | Change |
|------|--------|
| `skills/rules/SKILL.md` | Added frontmatter reference section |
| `agents/bc-knowledge-manager.md` | Added rules frontmatter reference |

#### Known Issues

- **Bug #16299**: Lazy loading not working -- all rules load at session start regardless of `paths`
  - Source: [github.com/anthropics/claude-code/issues/16299](https://github.com/anthropics/claude-code/issues/16299)

#### Documentation Sources

| Topic | URL |
|-------|-----|
| Official Rules Docs | [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory.md#path-specific-rules) |
| YAML Syntax Fix | [Issue #13905](https://github.com/anthropics/claude-code/issues/13905) |
| Lazy Loading Bug | [Issue #16299](https://github.com/anthropics/claude-code/issues/16299) |

---

## v2.0.41 and earlier

See git history for previous changes.

---

## Format

```
## vX.Y.Z (YYYY-MM-DD)

### Added | Changed | Fixed | Removed | Deprecated | Security

- **Feature/Component** -- description
  - Details if needed

### Updated Files (optional)
### Known Issues (optional)
### Breaking Changes (if any)
```

## Protocol

| Rule | Description |
|------|-------------|
| **Versioning** | SemVer: MAJOR.MINOR.PATCH |
| **MAJOR** | Breaking changes, incompatible API |
| **MINOR** | New features, backward compatible |
| **PATCH** | Bug fixes, documentation |
| **Order** | Newest first |
| **Sources** | Link to issues/docs when relevant |
