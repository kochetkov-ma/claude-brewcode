# Documentation acceptance

## Scope matrix

Survey all five public levels; edit only applicable mode surfaces. Resolve current source paths and plugin inventory from disk.

| Mode/target | Editable surfaces |
|---|---|
| ENTITY skill | Entity README; source SKILL.md only minor stale description/trigger corrections; plugin README entry; `{plugin}/skills/{name}.mdx`; navigation entry |
| ENTITY agent | Source agent description/frontmatter/body only needed documentation corrections; `{plugin}/agents/{name}.mdx`; navigation entry |
| PLUGIN | Plugin README; `{plugin}/{overview,skills,agents}.mdx`; navigation section |
| FIX | Specific identified files |
| REPO | Root README/RELEASE-NOTES as requested |
| REVIEW | No edits; review applicable existing levels and report missing ones |

## Preflight

- Resolve target/source/dependencies and present/missing levels; read a recent same-section etalon or the native scaffold.
- Load relevant indexed shared Astro/accessibility/container rules. Confirm `web/docs/src/utils/navigation.ts`, MDX components, and Card `iconMap`.
- Determine actual exposed commands/models/tools from product source. Preserve invocation/trigger semantics when touching source metadata; Claude source retains its Claude schema, native Codex source its native schema.
- Derive hook totals from live `hooks.json` registries, not `.mjs` file counts. Distinguish registered runtime hooks from opt-in hooks installed by setup skills; derive skill/agent/plugin counts live.
- Assign each file once; serialize navigation and shared indexes. Read existing content before editing and preserve unrelated changes.

## Writing invariants

Public prose is English, plain, concrete, and user-first: one title → useful badges → quick reference → what it does → when to use → copy-paste example/expected result → workflow → technical arguments/modes/output/internals → related links. README installation precedes internals; link to deep web docs instead of duplicating them. No empty preambles, AI filler, or decorative heading emoji.

| MDX invariant | Check |
|---|---|
| Frontmatter | Title ≤60 characters, description 50–160 characters, appropriate existing order/schema; layout supplies the sole H1 |
| Component imports | `{plugin}/*.mdx`: `../../../components/mdx`; `{plugin}/{skills,agents}/*.mdx`: `../../../../components/mdx`; other depths resolved from file path; all imports used |
| Steps | Only explicit direct `<li><div><strong>Title</strong><p>…</p></div></li>` children; no Markdown numbered list or ol/ul wrapper inside Steps; nested lists inside li are allowed |
| Cards | Every icon in live `Card.astro` iconMap; pick existing icon unless component change is in scope. Preserve stretched-link overlay; do not wrap slot/Card in an anchor or rewrite Card as anchor wrapping content; slot links are permitted |
| Escaping | Escape angle brackets in prose; handle backticks inside JSX correctly; static paths use plain literals |
| URLs | Internal links resolve to content and navigation slugs; layouts construct URLs with `Astro.site`, not hardcoded domains |
| Navigation | Correct plugin skills/agents group and existing index pages; preserve intentional workflow order, otherwise alphabetical; preserve existing entries without duplicates |
| Related footer | CardGrid links to plugin overview, actual GitHub skill/agent source, ≥1 related same-domain entity; UpdateNotice last |

New skills/agents need their applicable index/group structure, not a flat sidebar. Source GitHub paths must match the entity kind; do not point agents to a skill directory. The native MDX scaffold is not ready-to-publish content: replace placeholders, verify imports/icons, and derive all metadata/examples from the actual product.

## Postflight

- Three independent reviewer results collected; quorum by same file/section/category; independently verify severe singleton findings. All accepted findings fixed or explicitly unresolved/user-denied; at most two fix cycles.
- Re-read changed content: metadata, imports, JSX Steps, icons, cross-links, unique title, English prose, actual command examples.
- Verify every supplied MDX path exists before `bash .codex/skills/docs/scripts/check-links.sh <existing files...>`; additionally inspect Markdown links/anchors and target content. Checker success covers only its quoted-href/navigation check.
- Changed MDX, navigation, or other docs-site files require `npm --prefix web/docs run build` (`astro build`); TypeScript/Astro changes additionally require `npm --prefix web/docs run check` (`astro check`). Run after coordinated writes/fixes settle; report failure/unavailable checks as validation gaps. Native instruction/report/implementation files and README-only edits are exempt from docs-site build/check. Do not infer TypeScript parsing from grep or unsupported `require` calls; local validation does not authorize deployment.

## Authorized release/deploy only

- Current explicit authorization, matching version manifests, discovered tags/version, maintained bump helper; release notes link touched pages. Stage owned files and follow indexed release ordering.
- Match `docs.yml` build `headSha` and release ref; record its exact run ID. For a `workflow_run` deployment, require triggering payload `workflow_run.id` = that build ID and verify `head_sha`/`head_branch`, actual checkout SHA, and computed/deployed image tag against that build/release. Deploy's own `headSha` can be the default-branch commit and need not equal the release SHA. Missing linkage/checkout/image evidence stays unverified; manually dispatched deploys need explicit image/build and checkout provenance instead. Both linked runs must succeed; latest-run helper output is diagnostic only, and no missing deploy run is accepted.
- Each updated URL loads and contains its supplied distinctive phrase; save browser snapshot/screenshot and close browser. CI success/HTTP 200 alone is insufficient. Record SHA, run IDs, content evidence, and any unverified step.
