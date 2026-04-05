# Agent Profile Generation (Setup Flow)

## Input

- Topic text
- Mode: challenge / strategy / critic
- Agent count: N (2-5)
- Archetypes (loaded from `agents/archetypes.md`)
- Optional: user-provided custom profiles

## Step 1: Domain Detection

Analyze the topic to identify domain(s):

| Domain | Indicators |
|--------|------------|
| Backend | API, database, server, microservices, scalability |
| Frontend | UI, UX, components, design system, accessibility |
| Infrastructure | deploy, CI/CD, containers, cloud, monitoring |
| Architecture | patterns, modules, coupling, system design |
| Data | pipeline, analytics, ML, storage, ETL |
| Business | cost, ROI, timeline, stakeholders, requirements |
| Security | auth, encryption, vulnerability, compliance |
| General | none of the above — use broad archetypes |

Multiple domains possible. Primary domain = most referenced in topic.

## Step 2: Role Assignment (Mode-Aware)

### Challenge Mode

| N agents | Defenders | Critics |
|----------|-----------|---------|
| 2 | 1 | 1 |
| 3 | 1 | 2 |
| 4 | 2 | 2 |
| 5 | 2 | 3 |

If topic contains explicit variants (e.g., "Option A vs Option B"):
- Assign each defender to a specific variant
- Critics attack all variants equally

### Strategy Mode

All agents are **strategists**. Each proposes independently.

### Critic Mode

All agents are **critics**. Each critiques from a different perspective.

## Step 3: Character Selection

For each agent, select an archetype from the 10 available. Rules:

1. **Maximize diversity** — no two agents share an archetype
2. **Match domain** — prefer archetypes listed as "Best For" matching the topic domain
3. **Create tension** — pair archetypes with naturally opposing viewpoints
4. **Avoid redundancy** — if two archetypes would argue identically on this topic, replace one

### Selection priority by mode

| Mode | Prefer | Avoid |
|------|--------|-------|
| Challenge | Opposing pairs (Pragmatist vs Visionary, Skeptic vs Advocate) | Two similar critics |
| Strategy | Maximum perspective diversity | Two archetypes that approach same way |
| Critic | Different issue types (technical, ops, financial, UX) | All-technical team |

## Step 4: Generate Profiles

For each agent, produce:

```
Agent {N}:
  Name:        {descriptive_name} (e.g., "Ops-Realist", "Cost-Analyst", "UX-Champion")
  Role:        defender / critic / strategist
  Archetype:   {from archetypes.md}
  Perspective:  {1-sentence: what angle they bring}
  WHY chosen:  {1-sentence: why this archetype for this topic}
```

Names should be short (1-2 words with hyphen), descriptive, and unique within the team.

## Step 5: Display for Confirmation

Present the full agent table to the user for approval before proceeding to debate.
