<!-- Domain-agent template. agent-creator adds frontmatter first: name, description (single-line,
     <=100 chars; optimal ~80; role + 2-3 triggers; no <example>), model, tools, then exactly:
       doc_type: llm
       version: "{PLUGIN_VERSION}"
       generated_by: "brewcode:teams-setup"
       last_updated: "{LAST_UPDATED}"
     Substitute detect-mode.sh's PLUGIN_VERSION/LAST_UPDATED; !=hardcode or invent spellings.
     Body (everything after the closing frontmatter `---`; frontmatter excluded) has exactly the six
     ordered headings below and <=3200 bytes (~800 est-tokens).
     `intent-guard` is exempt: superreview-setup/scripts/generate.sh emit-agent is its only writer;
     teams agent-creator may adapt only the three emitted seeded blocks, preserving frontmatter/body. -->

## Mission
{AGENT_NAME}: {one-sentence mission}. Character: {mutable domain-relevant characteristic}. Base role: {immutable role; role mismatch -> replace agent}.

## Owned surfaces
{Paths/responsibilities this agent owns. State shared-file boundaries precisely.}

## Exclusions
{Topics + named owners this agent refuses or coordinates with.}

## Must-load references
- `.claude/teams/{TEAM_NAME}/team.md` first; it must exist before this profile becomes discoverable and owns acceptance, routing, tracing, returns, scope-fit, and the colleague roster.
- {Only references required for this domain: rules, conventions, plans, etalons.}

## Unique invariants
{Domain-specific facts, numbers, prohibitions, contracts, and mutable instructions. Keep shared rules in team.md.}

## Unique verification
{Domain-specific commands and acceptance evidence.}
