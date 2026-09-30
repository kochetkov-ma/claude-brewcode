# Code search

Use `semble_code` semantic search only when its MCP tools are available. Otherwise use `rg` and focused file reads; do not install or enable plugins to obtain search. Code is authoritative.

| Question | Tool |
|---|---|
| Behavior, intent, or wording absent from code | One `mcp__semble_code__search` when available |
| Neighbors of a known semantic hit | `mcp__semble_code__find_related` when available |
| Every/all/how many; identifiers, literals, regexes, paths; verifying hits | `rg`, including `-l`/`-c` for enumeration/counts |

A ranked top-k sample cannot answer exhaustive questions. Start semantic search with:

```json
{"query":"how sessions are persisted","repo":"/abs/root","top_k":5,"max_snippet_lines":10}
```

`repo` is required for both MCP calls: the absolute project root or an explicit `https://` URL, never inferred. Hits carry `file_path`, `start_line`, `end_line`, `score`, and `content`; no `line` field. Read the file at `start_line`; for `find_related`, pass `{file_path, line, repo}` with a repo-relative path and 1-indexed line.

Make one semantic search per question, then read the hit. Request the full chunk with `max_snippet_lines=null` if needed. Do not repeat an equivalent semantic query through `rg`; use exact/exhaustive verification where required.

With `--content code docs config`, indexed content includes source, config, and prose (`.md .rst .adoc .org .tex .html`). Never indexed: `.json .json5 .csv .tsv .psv .mdx .txt`; use `rg` for them. JSON manifests, hook registrations, `package.json`, `settings.json`, and OpenAPI are especially affected: semantic results may describe them without searching their contents.

Duplicate trees are not deduplicated; exclude duplicates through `.sembleignore`. There is no watcher: the index is built in-call and cached. Do not run shell `semble search` with another `--content` set; the cache is keyed by path alone and consumers overwrite each other's index.

Before adding or switching a search engine, read `brewcode/skills/semble-setup/references/engine-landscape.md` and refresh changing upstream facts (paginate release/star queries). The existing Claude product's `semble==0.5.4` pin is not an instruction to install it in Codex.
